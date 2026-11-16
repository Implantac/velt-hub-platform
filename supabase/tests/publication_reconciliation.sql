-- SQL-only synthetic references: NEVER evidence of actual provider publication.
-- Tests run in one transaction and roll back; no dispatcher, OAuth or HTTP call.
begin;
set local statement_timeout='60s';
create temporary table qa4_f as select gen_random_uuid() owner_a,gen_random_uuid() owner_b,gen_random_uuid() admin_id,
  gen_random_uuid() editor_id,gen_random_uuid() viewer_id,gen_random_uuid() ws_a,gen_random_uuid() ws_b,
  gen_random_uuid() ch_fb,gen_random_uuid() ch_gbp,gen_random_uuid() ch_tt,gen_random_uuid() ch_ig;
create temporary table qa4_j(key text primary key,content_id uuid default gen_random_uuid(),id uuid default gen_random_uuid(),token uuid default gen_random_uuid());
insert into qa4_j(key) values('pending'),('foreign'),('unstarted'),('started'),('no_reference'),('legacy'),('review'),('check'),('tiktok'),('container');
create temporary table qa4_r(name text,passed boolean,expected text,actual text,affected bigint);
grant select on qa4_f,qa4_j to service_role,authenticated,anon;
grant select,insert on qa4_r to service_role,authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data)
  select x,'qa-r4-sql-'||x||'@example.invalid','{}'::jsonb from qa4_f f,
    lateral unnest(array[f.owner_a,f.owner_b,f.admin_id,f.editor_id,f.viewer_id]) x;
insert into public.workspaces(id,owner_id,slug,name)
  select ws_a,owner_a,'qa-r4-'||ws_a,'QA R4 isolated SQL A' from qa4_f union all
  select ws_b,owner_b,'qa-r4-'||ws_b,'QA R4 isolated SQL B' from qa4_f;
insert into public.workspace_members(workspace_id,user_id,role)
  select ws_a,admin_id,'admin'::public.app_role from qa4_f union all
  select ws_a,editor_id,'editor'::public.app_role from qa4_f union all
  select ws_a,viewer_id,'viewer'::public.app_role from qa4_f;
insert into public.channels(id,workspace_id,platform,status,external_id)
  select ch_fb,ws_a,'facebook'::public.social_platform,'connected'::public.channel_status,'111' from qa4_f union all
  select ch_gbp,ws_a,'google_business','connected','accounts/100/locations/200' from qa4_f union all
  select ch_tt,ws_a,'tiktok','connected','qa_r4_creator_not_real' from qa4_f union all
  select ch_ig,ws_a,'instagram','connected','333' from qa4_f;
insert into public.channels(workspace_id,platform,status,external_id) select ws_b,'facebook','disconnected','222' from qa4_f;
insert into public.oauth_tokens(channel_id,access_token_ciphertext) select ch_fb,'QA_R4_INVALID_NOT_USED_NOT_SENT' from qa4_f;
insert into public.content(id,workspace_id,title,status)
  select j.content_id,case when j.key='foreign' then f.ws_b else f.ws_a end,'QA R4 SQL '||j.key,
    case when j.key in ('pending','foreign') then 'draft'::public.content_status else 'scheduled'::public.content_status end from qa4_f f,qa4_j j;
insert into public.scheduler_jobs(id,workspace_id,content_id,channel_id,scheduled_at,status,attempts,max_attempts,delivery_token,
  delivery_started_at,provider_platform,provider_target,provider_reference,provider_reference_kind,reconcile_state,reconcile_after,locked_until,run_at)
select j.id,case when j.key='foreign' then f.ws_b else f.ws_a end,j.content_id,
  case when j.key='foreign' then (select id from public.channels where workspace_id=f.ws_b) when j.key='check' then f.ch_gbp when j.key='tiktok' then f.ch_tt when j.key='container' then f.ch_ig else f.ch_fb end,
  now()-interval '1 day',case when j.key in ('pending','foreign') then 'pending'::public.job_status when j.key in ('check','review') then 'dead_letter'::public.job_status else 'processing'::public.job_status end,
  case when j.key in ('pending','foreign') then 0 else 1 end,3,
  case when j.key in ('pending','foreign','legacy') then null else j.token end,
  case when j.key in ('started','no_reference','review','check','tiktok','container') then now()-interval '30 minutes' else null end,
  case when j.key='check' then 'google_business'::public.social_platform when j.key='tiktok' then 'tiktok' when j.key='container' then 'instagram'
    when j.key in ('started','no_reference','review') then 'facebook' else null end,
  case when j.key='check' then 'accounts/100/locations/200' when j.key='tiktok' then 'qa_r4_creator_not_real' when j.key='container' then '333'
    when j.key in ('started','no_reference','review') then '111' else null end,
  case when j.key='started' then '111_100' when j.key='review' then '111_900' when j.key='check' then 'accounts/100/locations/200/localPosts/qa_r4_not_sent'
    when j.key='tiktok' then 'qa_r4_tracking_not_sent' when j.key='container' then '444' else null end,
  case when j.key in ('started','review') then 'facebook_post' when j.key='check' then 'google_local_post' when j.key='tiktok' then 'tiktok_publish' when j.key='container' then 'instagram_container' else null end,
  case when j.key='review' then 'review' when j.key in ('started','no_reference','check','tiktok','container') then 'pending' else 'none' end,
  case when j.key='check' then now()-interval '1 minute' else null end,
  case when j.key in ('review','check','pending','foreign') then null else now()-interval '10 minutes' end,now()-interval '30 minutes'
from qa4_f f,qa4_j j;

create function pg_temp.qa4_ok(value boolean) returns boolean language plpgsql as $$
begin if value is distinct from true then raise exception 'assertion failed';end if;return true;end $$;
create function pg_temp.qa4_probe(_name text,_sql text,_expected text default '00000',_rows bigint default 1)
returns void language plpgsql as $$ declare code text:='00000';n bigint:=0;
begin begin execute _sql;get diagnostics n=row_count;raise exception using errcode='ZQ004',message='rollback probe';
exception when sqlstate 'ZQ004' then null;when others then code:=sqlstate;n:=0;end;
insert into qa4_r values(_name,code=_expected and (code<>'00000' or n=_rows),_expected,code,n);end $$;

create function pg_temp.qa4_flow(mode text) returns boolean language plpgsql as $$
declare f record;j record;r public.scheduler_jobs;s public.scheduler_jobs;old_token uuid;n bigint;
begin
  select * into f from qa4_f;
  if mode in ('claim','begin','begin_target','begin_retry','begin_wrong_target') then
    select * into j from qa4_j where key='pending';
    select * into r from public.claim_publication_jobs(1,300,f.ws_a);
    perform pg_temp.qa4_ok(r.id=j.id and r.workspace_id=f.ws_a and r.status='processing' and r.delivery_token is not null and r.delivery_started_at is null);
    if mode='claim' then return true;end if;
    r:=public.begin_publication_delivery(r.id,r.delivery_token,'facebook',case when mode='begin_wrong_target' then '222' else '111' end);
    perform pg_temp.qa4_ok(r.delivery_started_at is not null and r.provider_target='111' and r.reconcile_state='pending');
    if mode='begin_retry' then s:=public.begin_publication_delivery(r.id,r.delivery_token,'facebook','111');perform pg_temp.qa4_ok(s.delivery_started_at=r.delivery_started_at);end if;
    return true;
  end if;
  if mode in ('complete','complete_twice','late_fail','mismatch_id','checkpoint_same','checkpoint_changed','checkpoint_bad_kind','checkpoint_foreign') then
    select * into j from qa4_j where key='started';
    if mode like 'checkpoint_%' then
      r:=public.checkpoint_publication_delivery(j.id,j.token,case when mode='checkpoint_bad_kind' then 'instagram_media' else 'facebook_post' end,
        case when mode='checkpoint_changed' then '111_101' when mode='checkpoint_foreign' then '222_100' else '111_100' end);
      return pg_temp.qa4_ok(r.provider_reference='111_100' and r.status='processing' and r.external_post_id is null);
    end if;
    r:=public.complete_publication_delivery(j.id,j.token,case when mode='mismatch_id' then '111_101' else '111_100' end);
    perform pg_temp.qa4_ok(r.status='succeeded' and r.reconcile_state='confirmed' and (select status='published' from public.content where id=j.content_id));
    if mode='complete_twice' then s:=public.complete_publication_delivery(j.id,j.token,'111_100');perform pg_temp.qa4_ok(s.id=r.id);end if;
    if mode='late_fail' then s:=public.fail_publication_delivery(j.id,j.token,'late error',true,false,null,null);perform pg_temp.qa4_ok(s.status='succeeded');end if;
    return pg_temp.qa4_ok((select count(*)=1 from public.domain_events where workspace_id=f.ws_a and event_type='content.published'));
  end if;
  if mode in ('fail_unstarted','fail_ambiguous','fail_reference','fail_refused') then
    select * into j from qa4_j where key=case when mode='fail_unstarted' then 'unstarted' when mode='fail_reference' then 'started' else 'no_reference' end;
    r:=public.fail_publication_delivery(j.id,j.token,'QA SQL only; no request sent',true,mode='fail_refused',null,null);
    if mode in ('fail_unstarted','fail_refused') then
      return pg_temp.qa4_ok(r.status='pending' and r.delivery_token is null and r.reconcile_state='none' and r.scheduled_at>clock_timestamp());
    end if;
    return pg_temp.qa4_ok(r.status='dead_letter' and r.reconcile_state=case when mode='fail_reference' then 'pending' else 'review' end
      and r.external_post_id is null and (select status='scheduled' from public.content where id=j.content_id));
  end if;
  if mode like 'recover_%' then
    select * into j from qa4_j where key=case mode when 'recover_unstarted' then 'unstarted' when 'recover_exhausted' then 'unstarted'
      when 'recover_active' then 'unstarted' when 'recover_fenced' then 'unstarted' when 'recover_reference' then 'started'
      when 'recover_legacy' then 'legacy' else 'no_reference' end;
    if mode='recover_exhausted' then update public.scheduler_jobs set attempts=max_attempts where id=j.id;end if;
    if mode='recover_active' then update public.scheduler_jobs set locked_until=clock_timestamp()+interval '5 minutes' where id=j.id;end if;
    select * into r from public.recover_publication_deliveries(f.ws_a,50,j.id);
    if mode='recover_active' then return pg_temp.qa4_ok(r.id is null);end if;
    if mode='recover_fenced' then perform public.begin_publication_delivery(j.id,j.token,'facebook','111');return false;end if;
    if mode='recover_unstarted' then return pg_temp.qa4_ok(r.status='pending' and r.delivery_token is null and r.delivery_started_at is null);end if;
    if mode='recover_exhausted' then
      perform pg_temp.qa4_ok(r.status='dead_letter' and r.reconcile_state='none' and r.delivery_token is distinct from j.token and r.delivery_token is not null);
      select count(*) into n from public.recover_publication_deliveries(f.ws_a,50,j.id);return pg_temp.qa4_ok(n=0);
    end if;
    return pg_temp.qa4_ok(r.status='dead_letter' and r.reconcile_state=case when mode='recover_reference' then 'pending' else 'review' end
      and r.external_post_id is null and (select status='scheduled' from public.content where id=j.content_id));
  end if;
  if mode like 'reconcile_%' then
    select * into j from qa4_j where key='check';
    select * into r from public.claim_publication_reconciliations(f.ws_a,1,60,j.id);
    perform pg_temp.qa4_ok(r.id=j.id and r.reconcile_attempts=1 and r.reconcile_token is not null and r.status='dead_letter');
    if mode='reconcile_claim' then return true;end if;
    if mode='reconcile_duplicate_claim' then select count(*) into n from public.claim_publication_reconciliations(f.ws_a,1,60,j.id);return pg_temp.qa4_ok(n=0);end if;
    old_token:=r.reconcile_token;
    if mode='reconcile_fenced' then
      update public.scheduler_jobs set reconcile_locked_until=clock_timestamp()-interval '1 minute' where id=j.id;
      select * into s from public.claim_publication_reconciliations(f.ws_a,1,60,j.id);
      perform public.settle_publication_reconciliation(j.id,old_token,'confirmed',r.provider_reference,'QA not sent');return false;
    end if;
    if mode='reconcile_limit' then update public.scheduler_jobs set reconcile_attempts=20 where id=j.id;end if;
    if mode='reconcile_age' then update public.scheduler_jobs set delivery_started_at=clock_timestamp()-interval '8 days' where id=j.id;end if;
    r:=public.settle_publication_reconciliation(j.id,old_token,
      case when mode in ('reconcile_confirm','reconcile_idempotent','reconcile_wrong_id') then 'confirmed'
        when mode='reconcile_rejected' then 'rejected' when mode='reconcile_review' then 'review' else 'pending' end,
      case when mode='reconcile_wrong_id' then 'accounts/100/locations/200/localPosts/another_not_sent'
        when mode in ('reconcile_confirm','reconcile_idempotent') then r.provider_reference else null end,'QA SQL only; never a provider response');
    if mode in ('reconcile_confirm','reconcile_idempotent') then
      perform pg_temp.qa4_ok(r.status='succeeded' and r.reconcile_state='confirmed' and (select status='published' from public.content where id=j.content_id));
      if mode='reconcile_idempotent' then
        s:=public.settle_publication_reconciliation(j.id,old_token,'confirmed',r.provider_reference,'QA duplicate acknowledgement');
        perform pg_temp.qa4_ok((select count(*)=1 from public.domain_events where workspace_id=f.ws_a and event_type='content.published'));
      end if;return true;
    end if;
    if mode='reconcile_rejected' then return pg_temp.qa4_ok(r.reconcile_state='rejected' and r.external_post_id is null and (select status='failed' from public.content where id=j.content_id));end if;
    if mode in ('reconcile_review','reconcile_limit','reconcile_age') then return pg_temp.qa4_ok(r.reconcile_state='review' and r.reconcile_after>=clock_timestamp()+interval '14 minutes' and r.external_post_id is null);end if;
    perform pg_temp.qa4_ok(r.reconcile_state='pending' and r.external_post_id is null and r.reconcile_after>=clock_timestamp()+interval '59 seconds');
    select count(*) into n from public.claim_publication_reconciliations(f.ws_a,1,60,j.id);
    return pg_temp.qa4_ok(n=0 and (select status='scheduled' from public.content where id=j.content_id));
  end if;
  if mode='check_crash_limit' then
    select * into j from qa4_j where key='check';update public.scheduler_jobs set reconcile_attempts=20 where id=j.id;
    select count(*) into n from public.claim_publication_reconciliations(f.ws_a,1,60,null);
    return pg_temp.qa4_ok(n=0 and (select reconcile_state='review' from public.scheduler_jobs where id=j.id));
  end if;
  if mode='review_no_auto_claim' then
    select * into j from qa4_j where key='review';update public.scheduler_jobs set reconcile_after=clock_timestamp()-interval '1 minute' where id=j.id;
    return pg_temp.qa4_ok(not exists(select 1 from public.claim_publication_reconciliations(f.ws_a,50,60,null) where id=j.id));
  end if;
  raise exception 'Unknown QA scenario: %',mode;
end $$;

-- Additional interleavings use fixture-only mutations; every probe rolls back.
create function pg_temp.qa4_edges(mode text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare f record;j record;r public.scheduler_jobs;s public.scheduler_jobs;new_id uuid:=gen_random_uuid();
begin
  select * into f from qa4_f;
  if mode like 'instagram_%' then
    select * into j from qa4_j where key='container';
    r:=public.checkpoint_publication_delivery(j.id,j.token,'instagram_media','555');
    perform pg_temp.qa4_ok(r.provider_reference='555' and r.provider_reference_kind='instagram_media' and r.external_post_id is null);
    if mode='instagram_no_downgrade' then perform public.checkpoint_publication_delivery(j.id,j.token,'instagram_container','444');return false;end if;
    r:=public.complete_publication_delivery(j.id,j.token,'555');return pg_temp.qa4_ok(r.reconcile_state='confirmed' and r.external_post_id='555');
  end if;
  if mode='refusal_with_reference' then
    select * into j from qa4_j where key='started';r:=public.fail_publication_delivery(j.id,j.token,'synthetic refusal after reference received',true,true,'111_100','facebook_post');
    return pg_temp.qa4_ok(r.reconcile_state='pending' and r.status='dead_letter' and r.delivery_token=j.token);
  end if;
  if mode='late_original_checkpoint' then
    select * into j from qa4_j where key='no_reference';
    perform public.recover_publication_deliveries(f.ws_a,1,j.id);
    r:=public.checkpoint_publication_delivery(j.id,j.token,'facebook_post','111_777');
    return pg_temp.qa4_ok(r.status='dead_letter' and r.reconcile_state='pending' and r.provider_reference='111_777' and r.external_post_id is null);
  end if;
  if mode='legacy_coexistence' then
    select * into j from qa4_j where key='pending';select * into r from public.claim_workspace_scheduler_jobs(f.ws_a,1,60);
    perform pg_temp.qa4_ok(r.id=j.id and r.delivery_token is null);
    r:=public.complete_scheduler_job(j.id,'111_888');return pg_temp.qa4_ok(r.status='succeeded' and r.reconcile_state='confirmed');
  end if;
  select * into j from qa4_j where key='review';
  if mode in ('close_with_check_lease','close_with_delivery_lease') then
    update public.scheduler_jobs set reconcile_locked_until=case when mode='close_with_check_lease' then clock_timestamp()+interval '1 minute' else null end,
      locked_until=case when mode='close_with_delivery_lease' then clock_timestamp()+interval '1 minute' else null end where id=j.id;
    perform public.close_publication_review(f.ws_a,j.id,'QA synthetic account reviewed without provider requests',true);return false;
  end if;
  if mode='close_fences_late_success' then
    perform public.close_publication_review(f.ws_a,j.id,'QA synthetic account reviewed without provider requests',true);
    perform public.complete_publication_delivery(j.id,j.token,'111_900');return false;
  end if;
  if mode='active_index_covers_review' then
    insert into public.scheduler_jobs(workspace_id,content_id,channel_id,scheduled_at,status) values(f.ws_a,j.content_id,f.ch_fb,clock_timestamp()+interval '30 days','pending');return false;
  end if;
  if mode in ('cancel_other_does_not_unlock','success_other_does_not_unlock','close_preserves_other_success') then
    insert into public.scheduler_jobs(id,workspace_id,content_id,channel_id,scheduled_at,status,external_post_id,reconcile_state)
      values(new_id,f.ws_a,j.content_id,f.ch_gbp,clock_timestamp()+interval '30 days',
        case when mode='cancel_other_does_not_unlock' then 'pending'::public.job_status else 'succeeded'::public.job_status end,
        case when mode<>'cancel_other_does_not_unlock' then 'accounts/100/locations/200/localPosts/qa_other_channel' else null end,
        case when mode<>'cancel_other_does_not_unlock' then 'confirmed' else 'none' end);
    if mode='cancel_other_does_not_unlock' then perform public.cancel_publication(f.ws_a,new_id);else perform public.sync_publication_content_state(j.content_id);end if;
    perform pg_temp.qa4_ok((select status='scheduled' from public.content where id=j.content_id));
    if mode='close_preserves_other_success' then
      perform public.close_publication_review(f.ws_a,j.id,'QA synthetic account reviewed without provider requests',true);
      return pg_temp.qa4_ok((select status='published' from public.content where id=j.content_id) and
        (select status='dead_letter' and reconcile_state='closed' and external_post_id is null from public.scheduler_jobs where id=j.id));
    end if;
    return true;
  end if;
  raise exception 'Unknown edge scenario';
end $$;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.qa4_probe('reference_cannot_omit_kind','update public.scheduler_jobs set provider_reference_kind=null where id=(select id from qa4_j where key=''started'')','23514');
select pg_temp.qa4_probe('reference_kind_cannot_omit_id','update public.scheduler_jobs set provider_reference=null where id=(select id from qa4_j where key=''started'')','23514');
select pg_temp.qa4_probe('instagram_promotes_container_to_exact_media','select pg_temp.qa4_edges(''instagram_promotion'')');
select pg_temp.qa4_probe('instagram_cannot_downgrade_media_to_container','select pg_temp.qa4_edges(''instagram_no_downgrade'')','23514');
select pg_temp.qa4_probe('reference_stays_blocked_despite_refusal_flag','select pg_temp.qa4_edges(''refusal_with_reference'')');
select pg_temp.qa4_probe('late_original_reference_can_be_recovered_without_resend','select pg_temp.qa4_edges(''late_original_checkpoint'')');
select pg_temp.qa4_probe('legacy_unfenced_lifecycle_compatible_for_rolling_deploy','select pg_temp.qa4_edges(''legacy_coexistence'')');
select pg_temp.qa4_probe('claim_scoped_fenced_not_started','select pg_temp.qa4_flow(''claim'')');
select pg_temp.qa4_probe('begin_durable_boundary','select pg_temp.qa4_flow(''begin'')');
select pg_temp.qa4_probe('begin_idempotent_same_execution','select pg_temp.qa4_flow(''begin_retry'')');
select pg_temp.qa4_probe('begin_cannot_retarget_account','select pg_temp.qa4_flow(''begin_wrong_target'')','23514');
select pg_temp.qa4_probe('begin_expired_worker_cannot_write','select public.begin_publication_delivery(id,token,''facebook'',''111'') from qa4_j where key=''unstarted''','40001');
select pg_temp.qa4_probe('begin_wrong_worker_cannot_write','select public.begin_publication_delivery(id,gen_random_uuid(),''facebook'',''111'') from qa4_j where key=''started''','40001');
select pg_temp.qa4_probe('claim_rejects_zero_limit','select * from public.claim_publication_jobs(0,300,null)','P0001');
select pg_temp.qa4_probe('claim_rejects_unbounded_lease','select * from public.claim_publication_jobs(1,10000,null)','P0001');
select pg_temp.qa4_probe('checkpoint_same_reference_idempotent','select pg_temp.qa4_flow(''checkpoint_same'')');
select pg_temp.qa4_probe('checkpoint_reference_immutable','select pg_temp.qa4_flow(''checkpoint_changed'')','23514');
select pg_temp.qa4_probe('checkpoint_kind_matches_platform','select pg_temp.qa4_flow(''checkpoint_bad_kind'')','23514');
select pg_temp.qa4_probe('checkpoint_foreign_page_rejected','select pg_temp.qa4_flow(''checkpoint_foreign'')','23514');
select pg_temp.qa4_probe('complete_fenced_confirmed_state','select pg_temp.qa4_flow(''complete'')');
select pg_temp.qa4_probe('complete_idempotent_single_event','select pg_temp.qa4_flow(''complete_twice'')');
select pg_temp.qa4_probe('late_failure_never_undoes_success','select pg_temp.qa4_flow(''late_fail'')');
select pg_temp.qa4_probe('complete_mismatched_post_rejected','select pg_temp.qa4_flow(''mismatch_id'')','23514');
select pg_temp.qa4_probe('complete_blank_id_rejected','select public.complete_publication_delivery(id,token,'''') from qa4_j where key=''started''','23514');
select pg_temp.qa4_probe('tracking_id_is_not_public_post','select public.complete_publication_delivery(id,token,''qa_r4_tracking_not_sent'') from qa4_j where key=''tiktok''','23514');
select pg_temp.qa4_probe('container_id_is_not_media_id','select public.complete_publication_delivery(id,token,''444'') from qa4_j where key=''container''','23514');
select pg_temp.qa4_probe('legacy_completion_cannot_bypass_fence','select public.complete_scheduler_job(id,''111_100'') from qa4_j where key=''started''','40001');
select pg_temp.qa4_probe('legacy_failure_cannot_bypass_fence','select public.fail_scheduler_job(id,''QA'',true,null) from qa4_j where key=''started''','40001');
select pg_temp.qa4_probe('retry_before_dispatch_is_safe','select pg_temp.qa4_flow(''fail_unstarted'')');
select pg_temp.qa4_probe('ambiguous_send_never_requeues','select pg_temp.qa4_flow(''fail_ambiguous'')');
select pg_temp.qa4_probe('accepted_reference_waits_without_success','select pg_temp.qa4_flow(''fail_reference'')');
select pg_temp.qa4_probe('explicit_reference_free_refusal_can_retry','select pg_temp.qa4_flow(''fail_refused'')');
select pg_temp.qa4_probe('recover_unstarted_only_requeues','select pg_temp.qa4_flow(''recover_unstarted'')');
select pg_temp.qa4_probe('recovery_invalidates_prior_writer','select pg_temp.qa4_flow(''recover_fenced'')','40001');
select pg_temp.qa4_probe('recover_exhausted_not_misclassified_legacy','select pg_temp.qa4_flow(''recover_exhausted'')');
select pg_temp.qa4_probe('recover_accepted_reference_read_only','select pg_temp.qa4_flow(''recover_reference'')');
select pg_temp.qa4_probe('recover_no_reference_needs_review','select pg_temp.qa4_flow(''recover_unknown'')');
select pg_temp.qa4_probe('recover_legacy_is_not_safe_retry','select pg_temp.qa4_flow(''recover_legacy'')');
select pg_temp.qa4_probe('recover_does_not_steal_live_lease','select pg_temp.qa4_flow(''recover_active'')');
select pg_temp.qa4_probe('recovery_respects_foreign_scope','select pg_temp.qa4_ok(not exists(select 1 from public.recover_publication_deliveries(f.ws_b,50,j.id))) from qa4_f f,qa4_j j where j.key=''unstarted''');
select pg_temp.qa4_probe('individual_recovery_requires_workspace','select * from public.recover_publication_deliveries(null,1,(select id from qa4_j where key=''unstarted''))','P0001');
select pg_temp.qa4_probe('reconcile_claim_is_separate_from_send','select pg_temp.qa4_flow(''reconcile_claim'')');
select pg_temp.qa4_probe('reconcile_lease_prevents_duplicate_claim','select pg_temp.qa4_flow(''reconcile_duplicate_claim'')');
select pg_temp.qa4_probe('reconcile_confirmed_updates_content','select pg_temp.qa4_flow(''reconcile_confirm'')');
select pg_temp.qa4_probe('reconcile_confirmation_is_idempotent','select pg_temp.qa4_flow(''reconcile_idempotent'')');
select pg_temp.qa4_probe('reconcile_stale_token_fenced','select pg_temp.qa4_flow(''reconcile_fenced'')','40001');
select pg_temp.qa4_probe('reconcile_mismatched_id_rejected','select pg_temp.qa4_flow(''reconcile_wrong_id'')','23514');
select pg_temp.qa4_probe('reconcile_pending_preserves_backoff','select pg_temp.qa4_flow(''reconcile_pending'')');
select pg_temp.qa4_probe('reconcile_definitive_rejection_not_published','select pg_temp.qa4_flow(''reconcile_rejected'')');
select pg_temp.qa4_probe('reconcile_unknown_requires_review','select pg_temp.qa4_flow(''reconcile_review'')');
select pg_temp.qa4_probe('reconcile_twenty_checks_stop_polling','select pg_temp.qa4_flow(''reconcile_limit'')');
select pg_temp.qa4_probe('reconcile_seven_day_limit','select pg_temp.qa4_flow(''reconcile_age'')');
select pg_temp.qa4_probe('crashed_last_check_also_stops_polling','select pg_temp.qa4_flow(''check_crash_limit'')');
select pg_temp.qa4_probe('review_not_automatically_reclaimed','select pg_temp.qa4_flow(''review_no_auto_claim'')');
select pg_temp.qa4_probe('reconcile_cannot_claim_foreign_workspace','select pg_temp.qa4_ok(not exists(select 1 from public.claim_publication_reconciliations(f.ws_b,1,60,j.id))) from qa4_f f,qa4_j j where j.key=''check''');
select pg_temp.qa4_probe('individual_check_requires_workspace','select * from public.claim_publication_reconciliations(null,1,60,(select id from qa4_j where key=''check''))','P0001');
reset role;

-- Temporary helpers retain the caller JWT, but perform fixture-only setup as the
-- test transaction owner. They do not survive rollback or expose a production RPC.
create function pg_temp.qa4_close_test(mode text) returns boolean language plpgsql as $$
declare f record;j record;r public.scheduler_jobs;
begin
  select * into f from qa4_f;select * into j from qa4_j where key='review';
  r:=public.close_publication_review(f.ws_a,j.id,'QA R4 synthetic provider review; nothing sent',true);
  perform pg_temp.qa4_ok(r.reconcile_state='closed' and r.status='dead_letter' and r.provider_reference='111_900' and r.external_post_id is null);
  perform pg_temp.qa4_ok((select status='failed' from public.content where id=j.content_id));
  perform pg_temp.qa4_ok(exists(select 1 from public.domain_events where workspace_id=f.ws_a and event_type='content.publication_review_closed' and payload->>'actor_id'=auth.uid()::text));
  perform pg_temp.qa4_ok(not exists(select 1 from public.domain_events where workspace_id=f.ws_a and event_type='content.published'));
  if mode='enqueue_after_close' then
    select * into r from public.enqueue_publication(j.content_id,array[f.ch_fb],clock_timestamp()+interval '30 days');
    return pg_temp.qa4_ok(r.status='pending' and r.attempts=0);
  end if;
  return true;
end $$;
create function pg_temp.qa4_enqueue_unknown() returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j record;f record;begin select * into f from qa4_f;select * into j from qa4_j where key='review';
update public.content set status='failed' where id=j.content_id;
perform public.enqueue_publication(j.content_id,array[f.ch_fb],clock_timestamp()+interval '30 days');return false;end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_a from qa4_f),'role','authenticated')::text,true);
select pg_temp.qa4_probe('close_refuses_inflight_check_lease','select pg_temp.qa4_edges(''close_with_check_lease'')','23514');
select pg_temp.qa4_probe('close_refuses_inflight_delivery_lease','select pg_temp.qa4_edges(''close_with_delivery_lease'')','23514');
select pg_temp.qa4_probe('late_success_cannot_reopen_closed_review','select pg_temp.qa4_edges(''close_fences_late_success'')','P0001');
select pg_temp.qa4_probe('active_uniqueness_includes_review','select pg_temp.qa4_edges(''active_index_covers_review'')','23505');
select pg_temp.qa4_probe('cancelling_other_channel_does_not_unlock_uncertain_content','select pg_temp.qa4_edges(''cancel_other_does_not_unlock'')');
select pg_temp.qa4_probe('other_channel_success_does_not_hide_uncertainty','select pg_temp.qa4_edges(''success_other_does_not_unlock'')');
select pg_temp.qa4_probe('closing_review_preserves_independent_confirmed_channel','select pg_temp.qa4_edges(''close_preserves_other_success'')');
select pg_temp.qa4_probe('owner_can_close_with_audit_without_publish','select pg_temp.qa4_close_test(''close'')');
select pg_temp.qa4_probe('closure_does_not_send_but_allows_explicit_new_schedule','select pg_temp.qa4_close_test(''enqueue_after_close'')');
select pg_temp.qa4_probe('close_requires_explicit_provider_review','select public.close_publication_review(f.ws_a,j.id,''QA review not performed; no sends'',false) from qa4_f f,qa4_j j where j.key=''review''','23514');
select pg_temp.qa4_probe('close_requires_nontrivial_reason','select public.close_publication_review(f.ws_a,j.id,''short'',true) from qa4_f f,qa4_j j where j.key=''review''','23514');
select pg_temp.qa4_probe('close_cannot_skip_pending_confirmation','select public.close_publication_review(f.ws_a,j.id,''QA review not performed; no sends'',true) from qa4_f f,qa4_j j where j.key=''check''','23514');
select pg_temp.qa4_probe('content_review_cannot_be_reset_to_draft','update public.content set status=''draft'' where id=(select content_id from qa4_j where key=''review'')','23514');
select pg_temp.qa4_probe('content_pending_confirmation_cannot_be_edited','update public.content set title=''unsafe replacement'' where id=(select content_id from qa4_j where key=''check'')','23514');
select pg_temp.qa4_probe('content_review_cannot_be_deleted','delete from public.content where id=(select content_id from qa4_j where key=''review'')','23514');
select pg_temp.qa4_probe('channel_review_cannot_be_deleted','delete from public.channels where id=(select ch_fb from qa4_f)','23514');
select pg_temp.qa4_probe('channel_identity_cannot_be_reassigned','update public.channels set external_id=''222'' where id=(select ch_fb from qa4_f)','23514');
select pg_temp.qa4_probe('enqueue_cannot_ignore_review_even_if_content_failed','select pg_temp.qa4_enqueue_unknown()','P0001');
select pg_temp.qa4_probe('client_cannot_forge_reconciliation_outcome','update public.scheduler_jobs set reconcile_state=''confirmed'',status=''succeeded'',external_post_id=''111_999'' where id=(select id from qa4_j where key=''review'')','00000',0);
select pg_temp.qa4_probe('foreign_workspace_rows_invisible','select * from public.scheduler_jobs where workspace_id=(select ws_b from qa4_f)','00000',0);
select pg_temp.qa4_probe('workspace_cascade_cleanup_still_possible','delete from public.workspaces where id=(select ws_a from qa4_f)');
select pg_temp.qa4_probe('all_lifecycle_rpcs_service_only', $q$select pg_temp.qa4_ok(not exists(
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (
 'claim_publication_jobs','begin_publication_delivery','checkpoint_publication_delivery','complete_publication_delivery','fail_publication_delivery',
 'recover_publication_deliveries','claim_publication_reconciliations','settle_publication_reconciliation','sync_publication_content_state') and
 (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))))$q$);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select admin_id from qa4_f),'role','authenticated')::text,true);
select pg_temp.qa4_probe('admin_can_close_review','select pg_temp.qa4_close_test(''close'')');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select editor_id from qa4_f),'role','authenticated')::text,true);
select pg_temp.qa4_probe('editor_cannot_close_review','select pg_temp.qa4_close_test(''close'')','42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select viewer_id from qa4_f),'role','authenticated')::text,true);
select pg_temp.qa4_probe('viewer_cannot_close_review','select pg_temp.qa4_close_test(''close'')','42501');
select pg_temp.qa4_probe('client_cannot_recover_jobs','select * from public.recover_publication_deliveries(null,1,null)','42501');
select pg_temp.qa4_probe('client_cannot_claim_checks','select * from public.claim_publication_reconciliations(null,1,60,null)','42501');
select pg_temp.qa4_probe('client_cannot_complete_fenced_job','select public.complete_publication_delivery(id,token,''111_100'') from qa4_j where key=''started''','42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_b from qa4_f),'role','authenticated')::text,true);
select pg_temp.qa4_probe('foreign_owner_cannot_close_review','select pg_temp.qa4_close_test(''close'')','42501');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.qa4_probe('anonymous_cannot_close_review','select pg_temp.qa4_close_test(''close'')','42501');
select pg_temp.qa4_probe('anonymous_cannot_begin_send','select public.begin_publication_delivery(id,token,''facebook'',''111'') from qa4_j where key=''started''','42501');
reset role;
select jsonb_build_object('all_passed',bool_and(passed) and count(*)>0,'passed',count(*) filter(where passed),'failed',count(*) filter(where not passed),'total',count(*),'results',jsonb_agg(to_jsonb(r) order by name)) as result from qa4_r r;
rollback;
