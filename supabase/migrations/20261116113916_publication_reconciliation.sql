-- Durable delivery checkpoints and read-only reconciliation. No provider request is
-- performed by SQL. Existing users/workspaces and business rows are not rewritten.
-- The v2 RPCs use fencing tokens; legacy server RPCs remain for a rolling deploy.
alter table public.scheduler_jobs
  add column delivery_token uuid,
  add column delivery_started_at timestamptz,
  add column provider_platform public.social_platform,
  add column provider_target text,
  add column provider_reference text,
  add column provider_reference_kind text,
  add column reconcile_state text not null default 'none',
  add column reconcile_after timestamptz,
  add column reconcile_attempts integer not null default 0,
  add column reconcile_token uuid,
  add column reconcile_locked_until timestamptz,
  add column reconciled_at timestamptz,
  add column reconcile_note text,
  add constraint scheduler_reconcile_state_check check (reconcile_state in ('none','pending','review','confirmed','rejected','closed')),
  add constraint scheduler_reconcile_attempts_check check (reconcile_attempts between 0 and 1000),
  add constraint scheduler_provider_reference_check check (
    (provider_reference is null and provider_reference_kind is null) or
    (provider_reference is not null and provider_reference_kind is not null and length(provider_reference) between 1 and 300 and
      provider_reference_kind in ('instagram_container','instagram_media','facebook_post','facebook_photo','facebook_video','youtube_video','linkedin_post','tiktok_publish','google_local_post'))
  ),
  add constraint scheduler_provider_target_check check (provider_target is null or length(provider_target) between 1 and 300);
drop index public.scheduler_jobs_active_content_channel_key;
create unique index scheduler_jobs_active_content_channel_key on public.scheduler_jobs(content_id,channel_id)
  where status in ('pending','processing') or reconcile_state in ('pending','review');
create index scheduler_reconcile_due on public.scheduler_jobs(reconcile_after,id)
  where reconcile_state='pending' and status='dead_letter';

-- Every lifecycle uses the same aggregate: uncertain delivery must not make a
-- content item schedulable again, even after another channel has succeeded.
create or replace function public.sync_publication_content_state(_content_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.content set status=case
    when exists(select 1 from public.scheduler_jobs where content_id=_content_id and
      (status in ('pending','processing') or reconcile_state in ('pending','review')))
      then 'scheduled'::public.content_status
    when exists(select 1 from public.scheduler_jobs where content_id=_content_id and status='succeeded')
      then 'published'::public.content_status
    when not exists(select 1 from public.scheduler_jobs where content_id=_content_id and status<>'cancelled')
      then 'draft'::public.content_status
    else 'failed'::public.content_status end where id=_content_id;
end $$;
revoke all on function public.sync_publication_content_state(uuid) from public,anon,authenticated;
grant execute on function public.sync_publication_content_state(uuid) to service_role;

create or replace function public.claim_publication_jobs(
  _limit integer default 10,_lock_seconds integer default 300,_workspace_id uuid default null
) returns setof public.scheduler_jobs language plpgsql security definer set search_path=public as $$
begin
  if _limit is null or _limit not between 1 and 50 or _lock_seconds is null or _lock_seconds not between 30 and 900 then
    raise exception 'Invalid publication claim parameters';
  end if;
  return query with ready as (
    select id from public.scheduler_jobs where status='pending' and scheduled_at<=clock_timestamp()
      and (_workspace_id is null or workspace_id=_workspace_id) and reconcile_state='none'
      and provider_reference is null and external_post_id is null
      and (locked_until is null or locked_until<clock_timestamp())
    order by scheduled_at,id limit _limit for update skip locked
  ) update public.scheduler_jobs j set status='processing',attempts=j.attempts+1,run_at=clock_timestamp(),
    locked_until=clock_timestamp()+make_interval(secs=>_lock_seconds),delivery_token=gen_random_uuid(),delivery_started_at=null
    from ready where j.id=ready.id returning j.*;
end $$;
revoke all on function public.claim_publication_jobs(integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_publication_jobs(integer,integer,uuid) to service_role;

-- Called immediately before an upstream write (and again before later writes).
-- A worker which lost its lease before this boundary cannot publish afterwards.
create or replace function public.begin_publication_delivery(
  _job_id uuid,_delivery_token uuid,_platform public.social_platform,_target text
) returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; channel_row public.channels;
begin
  select * into result from public.scheduler_jobs where id=_job_id for update;
  if result.id is null or _delivery_token is null or result.delivery_token is distinct from _delivery_token or
     result.status<>'processing' or result.locked_until is null or result.locked_until<=clock_timestamp() then
    raise exception using errcode='40001',message='Publication execution lease is no longer valid';
  end if;
  select * into channel_row from public.channels where id=result.channel_id and workspace_id=result.workspace_id;
  if channel_row.id is null or channel_row.status<>'connected' or channel_row.platform is distinct from _platform or channel_row.external_id is null or
     nullif(btrim(_target),'') is null or length(_target)>300 or
     not (_target=channel_row.external_id or
       (_platform='linkedin' and _target in ('urn:li:person:'||channel_row.external_id,'urn:li:organization:'||channel_row.external_id))) then
    raise exception using errcode='23514',message='Publication target does not match the connected channel';
  end if;
  if result.provider_target is not null and (result.provider_target is distinct from _target or result.provider_platform is distinct from _platform) then
    raise exception using errcode='23514',message='A delivery cannot change its provider account';
  end if;
  update public.scheduler_jobs set delivery_started_at=coalesce(delivery_started_at,clock_timestamp()),
    provider_platform=_platform,provider_target=_target,reconcile_state='pending',
    locked_until=clock_timestamp()+interval '5 minutes',reconcile_after=clock_timestamp()+interval '5 minutes 30 seconds',
    reconcile_note='Envio iniciado; confirmação final ainda não registrada.'
    where id=_job_id returning * into result;
  return result;
end $$;
revoke all on function public.begin_publication_delivery(uuid,uuid,public.social_platform,text) from public,anon,authenticated;
grant execute on function public.begin_publication_delivery(uuid,uuid,public.social_platform,text) to service_role;

create or replace function public.checkpoint_publication_delivery(
  _job_id uuid,_delivery_token uuid,_kind text,_reference text
) returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; valid boolean:=false;
begin
  select * into result from public.scheduler_jobs where id=_job_id for update;
  if result.id is null or _delivery_token is null or result.delivery_token is distinct from _delivery_token or
    result.delivery_started_at is null or result.status not in ('processing','dead_letter') or
    result.reconcile_state not in ('pending','review') then
    raise exception using errcode='40001',message='Publication checkpoint belongs to an inactive execution';
  end if;
  if _reference is not null and length(_reference) between 1 and 300 then
    valid:=case
      when result.provider_platform='instagram' and _kind in ('instagram_container','instagram_media') then _reference ~ '^[0-9]+$'
      when result.provider_platform='facebook' and _kind='facebook_post' then _reference ~ '^[0-9]+_[0-9]+$' and split_part(_reference,'_',1)=result.provider_target
      when result.provider_platform='facebook' and _kind in ('facebook_photo','facebook_video') then _reference ~ '^[0-9]+$'
      when result.provider_platform='youtube' and _kind='youtube_video' then _reference ~ '^[A-Za-z0-9_-]{6,128}$'
      when result.provider_platform='linkedin' and _kind='linkedin_post' then _reference ~ '^urn:li:(share|ugcPost):[0-9]+$'
      when result.provider_platform='tiktok' and _kind='tiktok_publish' then _reference ~ '^[A-Za-z0-9_~.-]{1,200}$'
      when result.provider_platform='google_business' and _kind='google_local_post' then
        _reference ~ '^accounts/[0-9]+/locations/[0-9]+/localPosts/[A-Za-z0-9_-]+$' and
        starts_with(_reference,result.provider_target||'/localPosts/')
      else false end;
  end if;
  if not coalesce(valid,false) then
    raise exception using errcode='23514',message='Invalid provider reference for this delivery';
  end if;
  if result.provider_reference is not null and
    (result.provider_reference is distinct from _reference or result.provider_reference_kind is distinct from _kind) and
    not ((result.provider_reference_kind='instagram_container' and _kind='instagram_media') or
      (result.provider_reference_kind='facebook_photo' and _kind='facebook_post')) then
    raise exception using errcode='23514',message='An accepted provider reference cannot be replaced';
  end if;
  update public.scheduler_jobs set provider_reference=_reference,provider_reference_kind=_kind,
    reconcile_state='pending',reconcile_after=case when status='processing' then
      greatest(coalesce(locked_until,clock_timestamp()),clock_timestamp())+interval '30 seconds' else clock_timestamp()+interval '30 seconds' end,
    reconcile_note='Referência do provedor preservada; não reenviar automaticamente.'
    where id=_job_id returning * into result;
  return result;
end $$;
revoke all on function public.checkpoint_publication_delivery(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.checkpoint_publication_delivery(uuid,uuid,text,text) to service_role;

-- An actual public post ID is separate from a tracking/container/resource ID.
create or replace function public.complete_publication_delivery(_job_id uuid,_delivery_token uuid,_external_post_id text)
returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; content_uuid uuid;
begin
  if nullif(btrim(_external_post_id),'') is null or length(_external_post_id)>300 or starts_with(_external_post_id,'sim_') then
    raise exception using errcode='23514',message='A provider-confirmed post ID is required';
  end if;
  select content_id into content_uuid from public.scheduler_jobs where id=_job_id;
  if content_uuid is null then raise exception 'Publication job not found'; end if;
  perform 1 from public.content where id=content_uuid for update;
  select * into result from public.scheduler_jobs where id=_job_id for update;
  if _delivery_token is null or result.delivery_token is distinct from _delivery_token then
    raise exception using errcode='40001',message='Publication completion belongs to another execution';
  end if;
  if result.status='succeeded' and result.external_post_id=_external_post_id then return result; end if;
  if result.delivery_started_at is null or result.status not in ('processing','dead_letter') or result.reconcile_state not in ('pending','review') then
    raise exception 'Only an unresolved dispatched execution can be completed';
  end if;
  if result.provider_reference is null or result.provider_reference_kind in ('instagram_container','facebook_photo') or
    (result.provider_reference_kind='tiktok_publish' and _external_post_id !~ '^[0-9]+$') then
    raise exception using errcode='23514',message='A recoverable reference and actual public post ID are required';
  end if;
  if result.provider_reference_kind in ('instagram_media','facebook_post','facebook_video','youtube_video','linkedin_post','google_local_post') and
    result.provider_reference is distinct from _external_post_id then
    raise exception using errcode='23514',message='Confirmed post ID does not match the preserved reference';
  end if;
  update public.scheduler_jobs set status='succeeded',external_post_id=_external_post_id,last_error=null,locked_until=null,
    reconcile_state='confirmed',reconcile_after=null,reconcile_token=null,reconcile_locked_until=null,reconciled_at=clock_timestamp(),
    reconcile_note='Publicação confirmada pelo contrato do provedor.' where id=_job_id returning * into result;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,'content.published',
    jsonb_build_object('job_id',result.id,'content_id',result.content_id,'channel_id',result.channel_id,'external_post_id',_external_post_id,'source','publisher'));
  return result;
end $$;
revoke all on function public.complete_publication_delivery(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_publication_delivery(uuid,uuid,text) to service_role;

create or replace function public.fail_publication_delivery(
  _job_id uuid,_delivery_token uuid,_error text,_retryable boolean default false,_definite_rejection boolean default false,
  _reference text default null,_reference_kind text default null
) returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; content_uuid uuid; retry boolean; uncertain boolean;
begin
  select content_id into content_uuid from public.scheduler_jobs where id=_job_id;
  if content_uuid is null then raise exception 'Publication job not found'; end if;
  perform 1 from public.content where id=content_uuid for update;
  select * into result from public.scheduler_jobs where id=_job_id for update;
  if _delivery_token is null or result.delivery_token is distinct from _delivery_token then
    raise exception using errcode='40001',message='Publication failure belongs to another execution';
  end if;
  if result.status='succeeded' or result.reconcile_state in ('rejected','closed') then return result; end if;
  if result.status not in ('processing','dead_letter') then raise exception 'Publication execution is not active'; end if;
  if _reference is not null then
    result:=public.checkpoint_publication_delivery(_job_id,_delivery_token,_reference_kind,_reference);
  end if;
  uncertain:=result.delivery_started_at is not null and (not coalesce(_definite_rejection,false) or result.provider_reference is not null);
  retry:=not uncertain and coalesce(_retryable,false) and result.attempts<result.max_attempts;
  update public.scheduler_jobs set
    status=case when retry then 'pending'::public.job_status else 'dead_letter'::public.job_status end,
    last_error=left(_error,1000),locked_until=null,
    delivery_token=case when retry then null else delivery_token end,
    delivery_started_at=case when retry then null else delivery_started_at end,
    provider_platform=case when retry then null else provider_platform end,provider_target=case when retry then null else provider_target end,
    reconcile_state=case when uncertain and provider_reference is not null then 'pending' when uncertain then 'review'
      when delivery_started_at is not null and not retry then 'rejected' else 'none' end,
    reconcile_after=case when uncertain and provider_reference is not null then clock_timestamp()+interval '30 seconds' else null end,
    reconcile_token=null,reconcile_locked_until=null,
    reconcile_note=case when uncertain and provider_reference is not null then 'Aguardando consulta de confirmação, sem reenviar.'
      when uncertain then 'Envio iniciado sem referência recuperável. Revise o provedor antes de qualquer novo envio.'
      when retry then 'Falha anterior ao envio ou recusa explícita; nova tentativa é segura.' else 'Falha sem confirmação de publicação.' end,
    scheduled_at=case when retry then clock_timestamp()+(power(2,least(attempts,10))*interval '30 seconds') else scheduled_at end
    where id=_job_id returning * into result;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,
    case when uncertain then 'content.publication_unconfirmed' when retry then 'content.publish_retry' else 'content.publish_dead_letter' end,
    jsonb_build_object('job_id',result.id,'content_id',result.content_id,'state',result.reconcile_state,'attempts',result.attempts));
  return result;
end $$;
revoke all on function public.fail_publication_delivery(uuid,uuid,text,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.fail_publication_delivery(uuid,uuid,text,boolean,boolean,text,text) to service_role;

-- Recovery fences an expired worker before requeueing an execution that never
-- crossed begin_publication_delivery. All other expired executions stay blocked.
create or replace function public.recover_publication_deliveries(_workspace_id uuid default null,_limit integer default 50,_job_id uuid default null)
returns setof public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare candidate record; result public.scheduler_jobs; safe_retry boolean;
begin
  if _limit is null or _limit not between 1 and 100 or (_job_id is not null and _workspace_id is null) then raise exception 'Invalid recovery parameters'; end if;
  for candidate in select id,content_id from public.scheduler_jobs where (_workspace_id is null or workspace_id=_workspace_id) and (_job_id is null or id=_job_id) and (
      (status='processing' and ((locked_until is not null and locked_until<clock_timestamp()-interval '30 seconds') or
        (locked_until is null and coalesce(run_at,created_at)<clock_timestamp()-interval '10 minutes'))) or
      (status='dead_letter' and reconcile_state='none' and delivery_token is null and attempts>0))
    order by updated_at,id limit _limit
  loop
    perform 1 from public.content where id=candidate.content_id for update skip locked;
    if not found then continue; end if;
    select * into result from public.scheduler_jobs where id=candidate.id for update skip locked;
    if not found then continue; end if;
    if not ((result.status='processing' and ((result.locked_until is not null and result.locked_until<clock_timestamp()-interval '30 seconds') or
      (result.locked_until is null and coalesce(result.run_at,result.created_at)<clock_timestamp()-interval '10 minutes'))) or
      (result.status='dead_letter' and result.reconcile_state='none' and result.delivery_token is null and result.attempts>0)) then continue; end if;
    safe_retry:=result.status='processing' and result.delivery_token is not null and result.delivery_started_at is null and result.provider_reference is null;
    update public.scheduler_jobs set
      status=case when safe_retry and attempts<max_attempts then 'pending'::public.job_status else 'dead_letter'::public.job_status end,
      delivery_token=case when safe_retry and attempts<max_attempts then null when safe_retry then gen_random_uuid() else delivery_token end,locked_until=null,
      reconcile_state=case when safe_retry then 'none' when provider_reference is not null then 'pending' else 'review' end,
      reconcile_after=case when not safe_retry and provider_reference is not null then clock_timestamp() else null end,
      reconcile_token=null,reconcile_locked_until=null,
      last_error=case when safe_retry then 'Execução interrompida antes do limite de envio.' else 'Execução interrompida sem confirmação final.' end,
      reconcile_note=case when safe_retry then 'Nenhum envio iniciado: lease anterior invalidado.'
        when provider_reference is not null then 'Consultar a referência preservada; nunca recriar o post.'
        else 'Resultado desconhecido sem referência segura. Exige revisão; não é prova de falha no provedor.' end
      where id=result.id returning * into result;
    perform public.sync_publication_content_state(result.content_id);
    insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,'content.publication_recovered',
      jsonb_build_object('job_id',result.id,'content_id',result.content_id,'safe_to_retry',safe_retry,'state',result.reconcile_state));
    return next result;
  end loop;
end $$;
revoke all on function public.recover_publication_deliveries(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.recover_publication_deliveries(uuid,integer,uuid) to service_role;

create or replace function public.claim_publication_reconciliations(
  _workspace_id uuid default null,_limit integer default 10,_lock_seconds integer default 60,_job_id uuid default null
) returns setof public.scheduler_jobs language plpgsql security definer set search_path=public as $$
begin
  if _limit is null or _limit not between 1 and 50 or _lock_seconds is null or _lock_seconds not between 30 and 300 or
    (_job_id is not null and _workspace_id is null) then raise exception 'Invalid reconciliation claim parameters'; end if;
  -- A worker crash during the final permitted check also stops automatic polling.
  if _job_id is null then
    with exhausted as (
      select id from public.scheduler_jobs where status='dead_letter' and reconcile_state='pending'
        and reconcile_attempts>=20 and (_workspace_id is null or workspace_id=_workspace_id)
        and (reconcile_locked_until is null or reconcile_locked_until<clock_timestamp())
      order by reconcile_after,id limit 50 for update skip locked
    ) update public.scheduler_jobs j set reconcile_state='review',reconcile_after=clock_timestamp()+interval '15 minutes',
      reconcile_token=null,reconcile_locked_until=null,reconcile_note='Limite de consultas automáticas atingido após execução sem confirmação.'
      from exhausted where j.id=exhausted.id;
  end if;
  return query with ready as (
    select id from public.scheduler_jobs where status='dead_letter' and
      (_workspace_id is null or workspace_id=_workspace_id) and (_job_id is null or id=_job_id) and
      (reconcile_state='pending' or (_job_id is not null and reconcile_state='review')) and
      provider_reference is not null and provider_target is not null and provider_platform is not null and
      reconcile_after is not null and reconcile_after<=clock_timestamp() and reconcile_attempts<1000 and
      (reconcile_locked_until is null or reconcile_locked_until<clock_timestamp())
    order by reconcile_after,id limit _limit for update skip locked
  ) update public.scheduler_jobs j set reconcile_token=gen_random_uuid(),
      reconcile_locked_until=clock_timestamp()+make_interval(secs=>_lock_seconds),reconcile_attempts=j.reconcile_attempts+1
    from ready where j.id=ready.id returning j.*;
end $$;
revoke all on function public.claim_publication_reconciliations(uuid,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_publication_reconciliations(uuid,integer,integer,uuid) to service_role;

create or replace function public.settle_publication_reconciliation(
  _job_id uuid,_reconcile_token uuid,_state text,_external_post_id text default null,_note text default null
) returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; content_uuid uuid; final_state text; final_note text;
begin
  if _state is null or _state not in ('confirmed','pending','review','rejected') or
    (_state='confirmed' and (nullif(btrim(_external_post_id),'') is null or length(_external_post_id)>300 or starts_with(_external_post_id,'sim_'))) or
    (_state<>'confirmed' and _external_post_id is not null) then
    raise exception using errcode='23514',message='Invalid reconciliation outcome';
  end if;
  select content_id into content_uuid from public.scheduler_jobs where id=_job_id;
  if content_uuid is null then raise exception 'Publication job not found'; end if;
  perform 1 from public.content where id=content_uuid for update;
  select * into result from public.scheduler_jobs where id=_job_id for update;
  if result.status='succeeded' and _state='confirmed' and result.external_post_id=_external_post_id then return result; end if;
  if _reconcile_token is null or result.reconcile_token is distinct from _reconcile_token or
    result.status<>'dead_letter' or result.reconcile_state not in ('pending','review') then
    raise exception using errcode='40001',message='Reconciliation lease has been superseded';
  end if;
  if _state='confirmed' and result.provider_reference_kind in ('instagram_media','facebook_post','facebook_video','youtube_video','linkedin_post','google_local_post') and
    result.provider_reference is distinct from _external_post_id then
    raise exception using errcode='23514',message='Confirmed post ID differs from its reference';
  end if;
  if _state='confirmed' and (result.provider_reference is null or result.provider_reference_kind in ('instagram_container','facebook_photo') or
    (result.provider_reference_kind='tiktok_publish' and _external_post_id !~ '^[0-9]+$')) then
    raise exception using errcode='23514',message='A container/photo reference is not a confirmed post ID';
  end if;
  final_state:=case when _state='pending' and
    (result.reconcile_attempts>=20 or coalesce(result.delivery_started_at,result.run_at,result.created_at)<clock_timestamp()-interval '7 days')
    then 'review' else _state end;
  final_note:=case when final_state='review' and _state='pending' then 'Limite de consultas automáticas atingido. Revise o provedor antes de encerrar ou reenviar. '
    else '' end||coalesce(_note,'Consulta sem detalhes adicionais.');
  update public.scheduler_jobs set status=case when final_state='confirmed' then 'succeeded'::public.job_status else 'dead_letter'::public.job_status end,
    external_post_id=case when final_state='confirmed' then _external_post_id else external_post_id end,
    last_error=case when final_state='confirmed' then null else left(final_note,1000) end,
    reconcile_state=final_state,reconciled_at=clock_timestamp(),reconcile_token=null,reconcile_locked_until=null,locked_until=null,
    reconcile_after=case when final_state='pending' then clock_timestamp()+least(power(2,least(reconcile_attempts,10))*interval '30 seconds',interval '6 hours')
      when final_state='review' then clock_timestamp()+interval '15 minutes' else null end,
    reconcile_note=left(final_note,1000) where id=_job_id returning * into result;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,
    case when final_state='confirmed' then 'content.published' else 'content.publication_checked' end,
    jsonb_build_object('job_id',result.id,'content_id',result.content_id,'channel_id',result.channel_id,'state',final_state,
      'external_post_id',case when final_state='confirmed' then _external_post_id else null end,'source','reconciliation','checks',result.reconcile_attempts));
  return result;
end $$;
revoke all on function public.settle_publication_reconciliation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_publication_reconciliation(uuid,uuid,text,text,text) to service_role;

-- Explicit, audited operator decision. This is NOT evidence of public success or
-- absence upstream, does not delete the reference, and NEVER sends/requeues a job.
create or replace function public.close_publication_review(_workspace_id uuid,_job_id uuid,_note text,_checked_provider boolean)
returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; content_uuid uuid;
begin
  if not public.has_workspace_role(_workspace_id,array['owner','admin']::public.app_role[]) then
    raise exception using errcode='42501',message='forbidden: only owner/admin can close publication review';
  end if;
  if _checked_provider is distinct from true or length(btrim(coalesce(_note,''))) not between 20 and 1000 then
    raise exception using errcode='23514',message='Confirme a revisão no provedor e registre uma justificativa de 20 a 1000 caracteres.';
  end if;
  select content_id into content_uuid from public.scheduler_jobs where id=_job_id and workspace_id=_workspace_id;
  if content_uuid is null then raise exception 'Publicação não encontrada neste workspace.'; end if;
  perform 1 from public.content where id=content_uuid for update;
  select * into result from public.scheduler_jobs where id=_job_id and workspace_id=_workspace_id for update;
  if result.status<>'dead_letter' or result.reconcile_state<>'review' or
    coalesce(result.locked_until,'-infinity'::timestamptz)>clock_timestamp() or
    coalesce(result.reconcile_locked_until,'-infinity'::timestamptz)>clock_timestamp() then
    raise exception using errcode='23514',message='Somente uma revisão sem execução/consulta em andamento pode ser encerrada.';
  end if;
  update public.scheduler_jobs set reconcile_state='closed',reconcile_after=null,reconcile_token=null,reconcile_locked_until=null,
    reconciled_at=clock_timestamp(),reconcile_note=left('Encerrado manualmente, sem certificação do resultado no provedor. '||btrim(_note),1000)
    where id=_job_id returning * into result;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values(_workspace_id,'content.publication_review_closed',
    jsonb_build_object('job_id',result.id,'content_id',result.content_id,'actor_id',auth.uid(),'decision','close_without_resend','note',btrim(_note)));
  return result;
end $$;
revoke all on function public.close_publication_review(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.close_publication_review(uuid,uuid,text,boolean) to authenticated;

-- Unknown results must not be erased/reset through a draft edit, enqueue or delete.
create or replace function public.guard_content_delivery()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user in ('postgres','supabase_admin','service_role') or coalesce(auth.role(),'')='service_role' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='INSERT' then
    if new.status<>'draft' then raise exception using errcode='23514',message='New content must start as a draft'; end if;
    return new;
  end if;
  if exists(select 1 from public.scheduler_jobs where content_id=old.id and
    (status in ('pending','processing') or reconcile_state in ('pending','review') or
      (status='dead_letter' and external_post_id is not null and reconcile_state='none')))
    and exists(select 1 from public.workspaces where id=old.workspace_id) then
    raise exception using errcode='23514',message='O conteúdo tem agendamentos ativos ou resultado sem confirmação. Resolva a fila/revisão antes de alterar ou excluir.';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.workspace_id is distinct from old.workspace_id or new.id is distinct from old.id then
    raise exception using errcode='23514',message='Content identity cannot be reassigned';
  end if;
  if new.status is distinct from old.status and new.status not in ('draft','archived') then
    raise exception using errcode='23514',message='Delivery status is controlled by the publication lifecycle';
  end if;
  return new;
end $$;

create or replace function public.guard_channel_publications()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.workspaces where id=old.workspace_id) and
    exists(select 1 from public.scheduler_jobs where channel_id=old.id and
      (status in ('pending','processing') or reconcile_state in ('pending','review') or
        (status='dead_letter' and external_post_id is not null and reconcile_state='none'))) then
    raise exception using errcode='23514',message='O canal tem agendamentos ativos ou resultado sem confirmação. Resolva a fila/revisão antes de excluir.';
  end if;
  return old;
end $$;
create or replace function public.guard_channel_identity()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or
     new.platform is distinct from old.platform or new.external_id is distinct from old.external_id then
    raise exception using errcode='23514',message='Channel identity cannot be reassigned; connect another account explicitly';
  end if;
  return new;
end $$;
revoke all on function public.guard_channel_identity() from public,anon,authenticated;
create trigger guard_channel_identity before update on public.channels for each row execute function public.guard_channel_identity();

create or replace function public.enqueue_publication(_content_id uuid,_channel_ids uuid[],_scheduled_at timestamptz)
returns setof public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare item public.content; channel_uuid uuid;
begin
  if _channel_ids is null or cardinality(_channel_ids) not between 1 and 20 or
     exists(select 1 from unnest(_channel_ids) x where x is null) or
     (select count(distinct x) from unnest(_channel_ids) x)<>cardinality(_channel_ids) then
    raise exception 'Selecione de 1 a 20 canais distintos.';
  end if;
  if _scheduled_at is null or _scheduled_at<clock_timestamp() then raise exception 'Escolha um horário futuro para o agendamento.'; end if;
  select * into item from public.content where id=_content_id for update;
  if item.id is null then raise exception 'Conteúdo não encontrado.'; end if;
  if not public.has_workspace_role(item.workspace_id,array['owner','admin','editor']::public.app_role[]) then
    raise exception using errcode='42501',message='forbidden: insufficient role to schedule content';
  end if;
  if item.status not in ('draft','failed') or exists(select 1 from public.scheduler_jobs where content_id=item.id and
    (status in ('pending','processing') or reconcile_state in ('pending','review') or
      (status='dead_letter' and external_post_id is not null and reconcile_state='none'))) then
    raise exception 'O conteúdo já está agendado ou aguarda confirmação/revisão. Confira o provedor antes de reagendar.';
  end if;
  foreach channel_uuid in array _channel_ids loop
    if not exists(select 1 from public.channels c where c.id=channel_uuid and c.workspace_id=item.workspace_id and c.status='connected'
      and exists(select 1 from public.oauth_tokens t where t.channel_id=c.id)) then
      raise exception 'Conecte ou reconecte todos os canais neste workspace antes de agendar.';
    end if;
  end loop;
  return query insert into public.scheduler_jobs(workspace_id,content_id,channel_id,scheduled_at,status)
    select item.workspace_id,item.id,x,_scheduled_at,'pending'::public.job_status from unnest(_channel_ids) x returning *;
  update public.content set status='scheduled' where id=item.id;
  insert into public.domain_events(workspace_id,event_type,payload) values(item.workspace_id,'content.scheduled',
    jsonb_build_object('content_id',item.id,'channel_ids',_channel_ids,'scheduled_at',_scheduled_at));
end $$;

-- Legacy workers cannot settle or downgrade a fenced v2 execution.
create or replace function public.complete_scheduler_job(_job_id uuid,_external_post_id text)
returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs; content_uuid uuid;
begin
  if nullif(btrim(_external_post_id),'') is null then
    raise exception using errcode='23514',message='A provider-confirmed external post ID is required';
  end if;
  select content_id into content_uuid from public.scheduler_jobs where id=_job_id;
  if content_uuid is null then raise exception 'Publication job not found'; end if;
  perform 1 from public.content where id=content_uuid for update;
  select * into result from public.scheduler_jobs where id=_job_id for update;
  if result.status='succeeded' and result.external_post_id=_external_post_id then return result; end if;
  if result.delivery_token is not null then raise exception using errcode='40001',message='Use the fenced publication lifecycle for this job'; end if;
  if result.status<>'processing' then raise exception 'Only a processing job can be completed'; end if;
  update public.scheduler_jobs set status='succeeded',external_post_id=_external_post_id,last_error=null,locked_until=null,reconcile_state='confirmed',reconcile_after=null,reconciled_at=clock_timestamp()
    where id=_job_id returning * into result;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,'content.published',
    jsonb_build_object('job_id',result.id,'content_id',result.content_id,'channel_id',result.channel_id,'external_post_id',_external_post_id));
  return result;
end $$;
revoke all on function public.complete_scheduler_job(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_scheduler_job(uuid,text) to service_role;

-- Preserve the existing four-argument signature for legacy deployments.
create or replace function public.fail_scheduler_job(_job_id uuid,_error text,_retryable boolean default true,_external_post_id text default null)
returns public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare result public.scheduler_jobs;content_uuid uuid;retry boolean;
begin
  select content_id into content_uuid from public.scheduler_jobs where id=_job_id;
  if content_uuid is null then raise exception 'Publication job not found'; end if;
  perform 1 from public.content where id=content_uuid for update;
  select * into result from public.scheduler_jobs where id=_job_id for update;
  -- A lost HTTP acknowledgement must not undo a committed success or terminal failure.
  if result.status in ('succeeded','dead_letter') then return result; end if;
  if result.delivery_token is not null then raise exception using errcode='40001',message='Use the fenced publication lifecycle for this job'; end if;
  if result.status<>'processing' then raise exception 'Only a processing job can fail'; end if;
  retry:=coalesce(_retryable,false) and result.attempts<result.max_attempts and
    nullif(btrim(_external_post_id),'') is null and result.external_post_id is null;
  update public.scheduler_jobs set status=case when retry then 'pending'::public.job_status else 'dead_letter'::public.job_status end,
    last_error=left(_error,1000),locked_until=null,
    reconcile_state=case when nullif(btrim(_external_post_id),'') is not null or external_post_id is not null then 'review' else 'none' end,
    reconcile_note=case when nullif(btrim(_external_post_id),'') is not null or external_post_id is not null then 'Referência legada sem tipo verificável: exige revisão manual.' else null end,
    external_post_id=coalesce(nullif(btrim(_external_post_id),''),external_post_id),
    scheduled_at=case when retry then now()+(power(2,least(attempts,10))*interval '30 seconds') else scheduled_at end
    where id=_job_id returning * into result;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,
    case when retry then 'content.publish_retry' else 'content.publish_dead_letter' end,
    jsonb_build_object('job_id',result.id,'error',left(_error,1000),'attempts',result.attempts,'external_post_id',result.external_post_id));
  return result;
end $$;
revoke all on function public.fail_scheduler_job(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.fail_scheduler_job(uuid,text,boolean,text) to service_role;

-- Cancelling another pending channel must not unlock an uncertain delivery.
create or replace function public.cancel_publication(_workspace_id uuid,_job_id uuid)
returns public.scheduler_jobs
language plpgsql security definer set search_path = public as $$
declare content_uuid uuid; result public.scheduler_jobs;
begin
  if not public.has_workspace_role(_workspace_id,array['owner','admin','editor']::public.app_role[]) then
    raise exception using errcode='42501',message='forbidden: insufficient role to cancel a publication';
  end if;
  select content_id into content_uuid from public.scheduler_jobs
    where id=_job_id and workspace_id=_workspace_id;
  if content_uuid is null then raise exception 'Agendamento não encontrado neste workspace.'; end if;
  -- Lock the content first, consistently with future enqueue/content operations.
  perform 1 from public.content where id=content_uuid and workspace_id=_workspace_id for update;
  update public.scheduler_jobs set status='cancelled',last_error='canceled by user',locked_until=null
    where id=_job_id and workspace_id=_workspace_id and status='pending' returning * into result;
  if result.id is null then raise exception 'Somente agendamentos pendentes podem ser cancelados.'; end if;
  perform public.sync_publication_content_state(content_uuid);
  insert into public.domain_events(workspace_id,event_type,payload) values
    (_workspace_id,'content.publication_cancelled',jsonb_build_object('job_id',_job_id,'content_id',content_uuid));
  return result;
end $$;
revoke all on function public.cancel_publication(uuid,uuid) from public,anon;
grant execute on function public.cancel_publication(uuid,uuid) to authenticated;
