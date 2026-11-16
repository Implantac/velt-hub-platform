-- OAuth intents are single-use. Refreshes are fenced; a late worker never
-- upserts credentials or reconnects a channel. No provider/network call in SQL.
-- Epoch rows serialize start/disconnect/delete even if the external identity
-- is not known yet, or a new authorization is being inserted concurrently.
create table public.oauth_authorization_contexts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform public.social_platform not null,
  version uuid not null default gen_random_uuid(),
  primary key(workspace_id,platform)
);
alter table public.oauth_authorization_contexts enable row level security;
revoke all on public.oauth_authorization_contexts from public,anon,authenticated,service_role;

create table public.oauth_authorization_attempts (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid,
  provider text not null check (provider in ('meta','facebook','instagram','google','youtube','google_business','linkedin','tiktok')),
  platform public.social_platform not null,
  context_version uuid not null,
  target_channel_id uuid,
  target_external_id text,
  redirect_uri text not null check (length(redirect_uri) between 12 and 2048),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending','exchanging','completed','cancelled','failed')),
  exchange_token uuid,
  exchange_until timestamptz,
  finished_at timestamptz,
  reason text check (reason in ('provider_denied','invalid_response','exchange_failed','disconnected','channel_deleted')),
  foreign key(workspace_id,target_channel_id) references public.channels(workspace_id,id) on delete cascade,
  check ((target_channel_id is null) = (target_external_id is null)),
  foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete cascade,
  foreign key(workspace_id,actor_id) references public.workspace_members(workspace_id,user_id) on delete cascade,
  check (expires_at>created_at and expires_at<=created_at+interval '10 minutes 1 second')
);
create index oauth_attempts_expiry on public.oauth_authorization_attempts(expires_at);
create index oauth_attempts_context on public.oauth_authorization_attempts(workspace_id,platform,state);
alter table public.oauth_authorization_attempts enable row level security;
revoke all on public.oauth_authorization_attempts from public,anon,authenticated,service_role;
grant select on public.oauth_authorization_attempts to service_role;

alter table public.channels
  add column oauth_revoked_at timestamptz,
  add column oauth_authorization_started_at timestamptz,
  add column authorization_issue text check (authorization_issue in ('refresh_uncertain','invalid_grant','missing_refresh','invalid_token','provider_unauthorized'));
alter table public.oauth_tokens
  add column token_version uuid not null default gen_random_uuid(),
  add column refresh_lease uuid,
  add column refresh_locked_until timestamptz,
  add column refresh_started_at timestamptz,
  add column refresh_retry_after timestamptz,
  add column refresh_uncertain boolean not null default false;
-- Old service-role UPSERT/DELETE paths fail closed as well: all writes must
-- go through the SECURITY DEFINER lifecycle functions below.
revoke all on public.oauth_tokens from service_role;
grant select on public.oauth_tokens to service_role;

create or replace function public.register_oauth_authorization(
  _workspace_id uuid,_provider text,_platform public.social_platform,_brand_id uuid,
  _state_hash text,_redirect_uri text,_expires_at timestamptz,_channel_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare attempt_id uuid; expected_platform public.social_platform; context_uuid uuid; target public.channels;
begin
  perform 1 from public.workspace_members where workspace_id=_workspace_id and user_id=auth.uid() and role in ('owner','admin') for share;
  if not found then raise exception using errcode='42501',message='OAuth requires owner/admin permission'; end if;
  expected_platform:=case _provider when 'meta' then 'facebook' when 'facebook' then 'facebook' when 'instagram' then 'instagram'
    when 'google' then 'youtube' when 'youtube' then 'youtube' when 'google_business' then 'google_business'
    when 'linkedin' then 'linkedin' when 'tiktok' then 'tiktok' else null end;
  if expected_platform is null or _platform is distinct from expected_platform or _state_hash is null or _state_hash !~ '^[a-f0-9]{64}$' or
    _expires_at is null or _expires_at<=clock_timestamp() or _expires_at>clock_timestamp()+interval '10 minutes' or
    _redirect_uri is null or _redirect_uri !~ '^https?://' or length(_redirect_uri)>2048 or
    right(_redirect_uri,length('/api/public/oauth/callback/'||_provider)) is distinct from '/api/public/oauth/callback/'||_provider then
    raise exception using errcode='23514',message='Invalid OAuth authorization context';
  end if;
  if _brand_id is not null then
    perform 1 from public.brands where workspace_id=_workspace_id and id=_brand_id for key share;
    if not found then raise exception using errcode='23503',message='Brand is not in this workspace'; end if;
  end if;
  if _channel_id is not null then
    select * into target from public.channels where id=_channel_id and workspace_id=_workspace_id and platform=_platform for update;
    if target.id is null or target.external_id is null then raise exception using errcode='23514',message='A reconexão exige o mesmo canal e identidade externa.'; end if;
  end if;
  -- Channel -> epoch -> attempt, the same order as completion/disconnection.
  insert into public.oauth_authorization_contexts(workspace_id,platform) values(_workspace_id,_platform) on conflict do nothing;
  select version into context_uuid from public.oauth_authorization_contexts where workspace_id=_workspace_id and platform=_platform for update;
  -- Bounded housekeeping; expired hashes never become reusable even before pruning.
  delete from public.oauth_authorization_attempts where id in (
    select id from public.oauth_authorization_attempts where workspace_id=_workspace_id and expires_at<clock_timestamp()-interval '24 hours'
    order by expires_at,id limit 200 for update skip locked);
  perform pg_advisory_xact_lock(hashtextextended('velt/oauth/start/'||_workspace_id::text||'/'||auth.uid()::text,0));
  if (select count(*) from public.oauth_authorization_attempts where workspace_id=_workspace_id and actor_id=auth.uid() and created_at>clock_timestamp()-interval '10 minutes')>=20 then
    raise exception using errcode='54000',message='Muitas autorizações recentes. Aguarde antes de iniciar novamente.';
  end if;
  insert into public.oauth_authorization_attempts(workspace_id,actor_id,brand_id,provider,platform,state_hash,redirect_uri,expires_at,context_version,target_channel_id,target_external_id)
    values(_workspace_id,auth.uid(),_brand_id,_provider,_platform,_state_hash,_redirect_uri,_expires_at,context_uuid,target.id,target.external_id) returning id into attempt_id;
  return attempt_id;
end $$;
revoke all on function public.register_oauth_authorization(uuid,text,public.social_platform,uuid,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.register_oauth_authorization(uuid,text,public.social_platform,uuid,text,text,timestamptz,uuid) to authenticated;

create or replace function public.consume_oauth_authorization(
  _state_hash text,_workspace_id uuid,_actor_id uuid,_provider text,_brand_id uuid,_redirect_uri text,_channel_id uuid default null
) returns public.oauth_authorization_attempts language plpgsql security definer set search_path=public as $$
declare result public.oauth_authorization_attempts;
begin
  update public.oauth_authorization_attempts set state='exchanging',exchange_token=gen_random_uuid(),exchange_until=clock_timestamp()+interval '3 minutes'
    where state_hash=_state_hash and workspace_id=_workspace_id and actor_id=_actor_id and provider=_provider
      and brand_id is not distinct from _brand_id and target_channel_id is not distinct from _channel_id and redirect_uri=_redirect_uri and state='pending' and expires_at>clock_timestamp()
      and exists(select 1 from public.workspace_members where workspace_id=_workspace_id and user_id=_actor_id and role in ('owner','admin'))
    returning * into result;
  return result;
end $$;
revoke all on function public.consume_oauth_authorization(text,uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.consume_oauth_authorization(text,uuid,uuid,text,uuid,text,uuid) to service_role;

create or replace function public.fail_oauth_authorization(_attempt_id uuid,_exchange_token uuid,_reason text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if _reason is null or _reason not in ('provider_denied','invalid_response','exchange_failed') then raise exception 'Invalid OAuth failure reason'; end if;
  update public.oauth_authorization_attempts set state='failed',finished_at=clock_timestamp(),reason=_reason
    where id=_attempt_id and exchange_token=_exchange_token and state='exchanging';
  return found;
end $$;
revoke all on function public.fail_oauth_authorization(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_oauth_authorization(uuid,uuid,text) to service_role;

-- Direct REST may edit registration labels/brand, never assert OAuth state.
create or replace function public.guard_channel_authorization()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user not in ('postgres','supabase_admin') then
    if (tg_op='INSERT' and (new.status<>'disconnected' or new.external_id is not null or new.connected_at is not null or
        new.oauth_revoked_at is not null or new.oauth_authorization_started_at is not null or new.authorization_issue is not null or new.metadata<>'{}'::jsonb)) or
      (tg_op='UPDATE' and (new.status is distinct from old.status or new.connected_at is distinct from old.connected_at or
        new.oauth_revoked_at is distinct from old.oauth_revoked_at or new.oauth_authorization_started_at is distinct from old.oauth_authorization_started_at or new.authorization_issue is distinct from old.authorization_issue or new.metadata is distinct from old.metadata)) then
      raise exception using errcode='23514',message='OAuth status and metadata are controlled by verified server operations';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_channel_authorization() from public,anon,authenticated;
create trigger guard_channel_authorization before insert or update on public.channels for each row execute function public.guard_channel_authorization();

create or replace function public.complete_oauth_authorization(
  _attempt_id uuid,_exchange_token uuid,_external_id text,_handle text,_metadata jsonb,
  _access_ciphertext text,_refresh_ciphertext text,_token_type text,_scope text,_expires_at timestamptz
) returns public.channels language plpgsql security definer set search_path=public as $$
declare attempt public.oauth_authorization_attempts; result public.channels; context_uuid uuid;
begin
  select * into attempt from public.oauth_authorization_attempts where id=_attempt_id;
  if attempt.id is null then raise exception using errcode='40001',message='OAuth authorization is no longer valid'; end if;
  perform 1 from public.workspace_members where workspace_id=attempt.workspace_id and user_id=attempt.actor_id and role in ('owner','admin') for share;
  if not found then raise exception using errcode='42501',message='OAuth permission was revoked'; end if;
  if attempt.brand_id is not null then
    perform 1 from public.brands where workspace_id=attempt.workspace_id and id=attempt.brand_id for key share;
    if not found then raise exception using errcode='23503',message='Brand is no longer available'; end if;
  end if;
  if nullif(btrim(_external_id),'') is null or length(_external_id)>300 or nullif(btrim(_access_ciphertext),'') is null or length(_access_ciphertext)>65536 or
    (_refresh_ciphertext is not null and (length(_refresh_ciphertext)<1 or length(_refresh_ciphertext)>65536)) or jsonb_typeof(_metadata) is distinct from 'object' or _metadata ?| array['access_token','refresh_token','accessToken','refreshToken','client_secret','clientSecret','page_access_token','pageAccessToken'] or
    (attempt.platform not in ('facebook','instagram') and _expires_at is null) or (_expires_at is not null and (_expires_at<=clock_timestamp() or _expires_at>clock_timestamp()+interval '367 days')) or
    length(coalesce(_scope,''))>8192 or (_token_type is not null and lower(_token_type)<>'bearer') then
    raise exception using errcode='23514',message='Verified external identity and encrypted credentials are required';
  end if;
  if attempt.platform='google_business' and (
    (_external_id ~ '^accounts/[0-9]+$' and (_metadata->>'requires_location_selection' is distinct from 'true' or _metadata->>'location_confirmed' is distinct from 'false')) or
    (_external_id ~ '^accounts/[0-9]+/locations/[0-9]+$' and (attempt.target_channel_id is null or _metadata->>'requires_location_selection' is distinct from 'false' or _metadata->>'location_confirmed' is distinct from 'true' or
      _metadata->>'account_id' is distinct from split_part(_external_id,'/',2) or _metadata->>'location_id' is distinct from split_part(_external_id,'/',4))) or
    _external_id !~ '^accounts/[0-9]+(/locations/[0-9]+)?$') then
    raise exception using errcode='23514',message='Google Business authorization must preserve the explicitly chosen account/location';
  end if;
  -- Lock order matches disconnect/delete: channel -> epoch -> attempt.
  if attempt.target_channel_id is not null then
    select * into result from public.channels where id=attempt.target_channel_id and workspace_id=attempt.workspace_id and platform=attempt.platform for update;
    if result.id is null or result.external_id is distinct from attempt.target_external_id or _external_id is distinct from attempt.target_external_id then
      raise exception using errcode='23514',message='A reconexão deve autorizar a mesma conta/unidade deste canal.';
    end if;
  else
    insert into public.channels(workspace_id,platform,external_id,status) values(attempt.workspace_id,attempt.platform,_external_id,'disconnected')
      on conflict(workspace_id,platform,external_id) do nothing;
    select * into result from public.channels where workspace_id=attempt.workspace_id and platform=attempt.platform and external_id=_external_id for update;
  end if;
  select version into context_uuid from public.oauth_authorization_contexts where workspace_id=attempt.workspace_id and platform=attempt.platform for update;
  select * into attempt from public.oauth_authorization_attempts where id=_attempt_id for update;
  if attempt.id is null or context_uuid is null or attempt.context_version is distinct from context_uuid or _exchange_token is null or attempt.exchange_token is distinct from _exchange_token or attempt.state<>'exchanging' or attempt.exchange_until<=clock_timestamp() or
    coalesce(result.oauth_authorization_started_at,result.connected_at,'-infinity'::timestamptz)>=attempt.created_at or coalesce(result.oauth_revoked_at,'-infinity'::timestamptz)>=attempt.created_at then
    raise exception using errcode='40001',message='OAuth authorization was consumed, superseded or disconnected';
  end if;
  update public.channels set brand_id=attempt.brand_id,handle=_handle,status='connected',connected_at=clock_timestamp(),metadata=_metadata,
    authorization_issue=null,oauth_authorization_started_at=attempt.created_at where id=result.id returning * into result;
  insert into public.oauth_tokens(channel_id,access_token_ciphertext,refresh_token_ciphertext,token_type,scope,expires_at)
    values(result.id,_access_ciphertext,_refresh_ciphertext,_token_type,_scope,_expires_at)
    on conflict(channel_id) do update set access_token_ciphertext=excluded.access_token_ciphertext,refresh_token_ciphertext=excluded.refresh_token_ciphertext,
      token_type=excluded.token_type,scope=excluded.scope,expires_at=excluded.expires_at,token_version=gen_random_uuid(),
      refresh_lease=null,refresh_locked_until=null,refresh_started_at=null,refresh_retry_after=null,refresh_uncertain=false;
  update public.oauth_authorization_attempts set state='completed',finished_at=clock_timestamp() where id=attempt.id;
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,'channel.connected',
    jsonb_build_object('channel_id',result.id,'platform',result.platform,'actor_id',attempt.actor_id,'authorization_id',attempt.id));
  return result;
end $$;
revoke all on function public.complete_oauth_authorization(uuid,uuid,text,text,jsonb,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_oauth_authorization(uuid,uuid,text,text,jsonb,text,text,text,text,timestamptz) to service_role;

-- Old immutable deployments cannot bypass the new single-use authorization.
create or replace function public.complete_oauth_connection(
  _workspace_id uuid,_actor_id uuid,_brand_id uuid,_platform public.social_platform,
  _external_id text,_handle text,_metadata jsonb,_access_ciphertext text,
  _refresh_ciphertext text,_token_type text,_scope text,_expires_at timestamptz
) returns public.channels language plpgsql security definer set search_path=public as $$
begin
  raise exception using errcode='40001',message='Inicie uma nova autorização em Canais; esta versão não aceita conclusão sem tentativa única.';
end $$;

create or replace function public.disconnect_oauth_channel(_channel_id uuid)
returns public.channels language plpgsql security definer set search_path=public as $$
declare result public.channels;
begin
  select * into result from public.channels where id=_channel_id for update;
  if result.id is null or not public.has_workspace_role(result.workspace_id,array['owner','admin']::public.app_role[]) then
    raise exception using errcode='42501',message='forbidden: insufficient role to disconnect this channel';
  end if;
  update public.channels set status='disconnected',oauth_revoked_at=clock_timestamp(),authorization_issue=null where id=_channel_id returning * into result;
  delete from public.oauth_tokens where channel_id=_channel_id;
  insert into public.oauth_authorization_contexts(workspace_id,platform) values(result.workspace_id,result.platform)
    on conflict(workspace_id,platform) do update set version=gen_random_uuid();
  update public.oauth_authorization_attempts set state='cancelled',finished_at=clock_timestamp(),reason='disconnected'
    where workspace_id=result.workspace_id and platform=result.platform and state in ('pending','exchanging');
  insert into public.domain_events(workspace_id,event_type,payload) values(result.workspace_id,'channel.disconnected',jsonb_build_object('channel_id',result.id,'actor_id',auth.uid()));
  return result;
end $$;
create or replace function public.cancel_deleted_channel_authorizations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.workspaces where id=old.workspace_id) then return old; end if;
  insert into public.oauth_authorization_contexts(workspace_id,platform) values(old.workspace_id,old.platform)
    on conflict(workspace_id,platform) do update set version=gen_random_uuid();
  update public.oauth_authorization_attempts set state='cancelled',finished_at=clock_timestamp(),reason='channel_deleted'
    where workspace_id=old.workspace_id and platform=old.platform and state in ('pending','exchanging');
  return old;
end $$;
revoke all on function public.cancel_deleted_channel_authorizations() from public,anon,authenticated;
create trigger cancel_deleted_channel_authorizations before delete on public.channels for each row execute function public.cancel_deleted_channel_authorizations();

-- Only a current connected channel/version can reserve a refresh. Returning a
-- token lease does NOT permit writes until begin_oauth_token_refresh is acked.
create or replace function public.claim_oauth_token_refresh(_channel_id uuid,_platform public.social_platform,_expected_version uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare channel_row public.channels; credential public.oauth_tokens; lease uuid;
begin
  select * into channel_row from public.channels where id=_channel_id for update;
  if channel_row.id is null or channel_row.platform is distinct from _platform or channel_row.status<>'connected' then
    return jsonb_build_object('state','disconnected');
  end if;
  select * into credential from public.oauth_tokens where channel_id=_channel_id for update;
  if credential.id is null then return jsonb_build_object('state','disconnected'); end if;
  if _expected_version is null or credential.token_version is distinct from _expected_version then return jsonb_build_object('state','changed'); end if;
  if credential.refresh_locked_until>clock_timestamp() then return jsonb_build_object('state','busy'); end if;
  if credential.refresh_uncertain or credential.refresh_started_at is not null then
    update public.oauth_tokens set refresh_uncertain=true where id=credential.id;
    update public.channels set status='expired',authorization_issue='refresh_uncertain' where id=_channel_id;
    return jsonb_build_object('state','reconnect');
  end if;
  if credential.refresh_retry_after>clock_timestamp() then return jsonb_build_object('state','cooldown'); end if;
  lease:=gen_random_uuid();
  update public.oauth_tokens set refresh_lease=lease,refresh_locked_until=clock_timestamp()+interval '60 seconds',refresh_started_at=null where id=credential.id;
  return jsonb_build_object('state','claimed','channel_id',_channel_id,'token_version',credential.token_version,'lease',lease);
end $$;
revoke all on function public.claim_oauth_token_refresh(uuid,public.social_platform,uuid) from public,anon,authenticated;
grant execute on function public.claim_oauth_token_refresh(uuid,public.social_platform,uuid) to service_role;

create or replace function public.begin_oauth_token_refresh(_channel_id uuid,_expected_version uuid,_lease uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from public.channels where id=_channel_id and status='connected' for update;
  if not found then return false; end if;
  update public.oauth_tokens set refresh_started_at=clock_timestamp()
    where channel_id=_channel_id and token_version=_expected_version and refresh_lease=_lease and _lease is not null
      and refresh_locked_until>clock_timestamp() and refresh_started_at is null and not refresh_uncertain;
  return found;
end $$;
revoke all on function public.begin_oauth_token_refresh(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_oauth_token_refresh(uuid,uuid,uuid) to service_role;

create or replace function public.complete_oauth_token_refresh(
  _channel_id uuid,_expected_version uuid,_lease uuid,_new_version uuid,
  _access_ciphertext text,_refresh_ciphertext text,_expires_at timestamptz,_scope text,_token_type text
) returns boolean language plpgsql security definer set search_path=public as $$
declare credential public.oauth_tokens; workspace_uuid uuid;
begin
  select workspace_id into workspace_uuid from public.channels where id=_channel_id and status='connected' for update;
  if workspace_uuid is null then return false; end if;
  select * into credential from public.oauth_tokens where channel_id=_channel_id for update;
  if credential.id is null or _expected_version is null or _lease is null or credential.token_version is distinct from _expected_version or credential.refresh_lease is distinct from _lease or
    credential.refresh_started_at is null or credential.refresh_uncertain then return false; end if;
  if _new_version is null or _new_version=_expected_version or nullif(btrim(_access_ciphertext),'') is null or length(_access_ciphertext)>65536 or
    (_refresh_ciphertext is not null and (length(_refresh_ciphertext)<1 or length(_refresh_ciphertext)>65536)) or
    _expires_at is null or _expires_at<=clock_timestamp() or _expires_at>clock_timestamp()+interval '367 days' then
    raise exception using errcode='23514',message='Invalid refreshed credential';
  end if;
  update public.oauth_tokens set token_version=_new_version,access_token_ciphertext=_access_ciphertext,refresh_token_ciphertext=_refresh_ciphertext,
    expires_at=_expires_at,scope=_scope,token_type=_token_type,refresh_lease=null,refresh_locked_until=null,
    refresh_started_at=null,refresh_retry_after=null,refresh_uncertain=false where id=credential.id;
  insert into public.domain_events(workspace_id,event_type,payload) values(workspace_uuid,'channel.authorization_refreshed',jsonb_build_object('channel_id',_channel_id));
  return true;
end $$;
revoke all on function public.complete_oauth_token_refresh(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.complete_oauth_token_refresh(uuid,uuid,uuid,uuid,text,text,timestamptz,text,text) to service_role;

create or replace function public.fail_oauth_token_refresh(_channel_id uuid,_expected_version uuid,_lease uuid,_outcome text)
returns boolean language plpgsql security definer set search_path=public as $$
declare credential public.oauth_tokens; workspace_uuid uuid; issue text;
begin
  if _outcome is null or _outcome not in ('not_sent','throttled','rejected','uncertain','invalid_grant','invalid_response') then raise exception 'Invalid refresh outcome'; end if;
  select workspace_id into workspace_uuid from public.channels where id=_channel_id and status='connected' for update;
  if workspace_uuid is null then return false; end if;
  select * into credential from public.oauth_tokens where channel_id=_channel_id for update;
  if credential.id is null or _lease is null or credential.token_version is distinct from _expected_version or credential.refresh_lease is distinct from _lease then return false; end if;
  if _outcome<>'not_sent' and credential.refresh_started_at is null then return false; end if;
  issue:=case _outcome when 'uncertain' then 'refresh_uncertain' when 'invalid_grant' then 'invalid_grant' when 'invalid_response' then 'invalid_token' else null end;
  update public.oauth_tokens set refresh_lease=null,refresh_locked_until=null,refresh_started_at=null,
    refresh_retry_after=case when issue is null then clock_timestamp()+interval '60 seconds' else null end,
    refresh_uncertain=issue is not null where id=credential.id;
  if issue is not null then update public.channels set status='expired',authorization_issue=issue where id=_channel_id; end if;
  insert into public.domain_events(workspace_id,event_type,payload) values(workspace_uuid,'channel.authorization_refresh_failed',jsonb_build_object('channel_id',_channel_id,'outcome',_outcome));
  return true;
end $$;
revoke all on function public.fail_oauth_token_refresh(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.fail_oauth_token_refresh(uuid,uuid,uuid,text) to service_role;

-- A late analytics auth error must not expire a newer reauthorization/refresh.
create or replace function public.invalidate_oauth_token_version(_channel_id uuid,_expected_version uuid,_issue text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if _issue is null or _issue not in ('provider_unauthorized','invalid_token','missing_refresh') then raise exception 'Invalid authorization issue'; end if;
  perform 1 from public.channels where id=_channel_id and status='connected' for update;
  if not found then return false; end if;
  perform 1 from public.oauth_tokens where channel_id=_channel_id and token_version=_expected_version for update;
  if not found then return false; end if;
  update public.channels set status='expired',authorization_issue=_issue where id=_channel_id;
  return true;
end $$;
revoke all on function public.invalidate_oauth_token_version(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.invalidate_oauth_token_version(uuid,uuid,text) to service_role;

-- Only a trusted explicit initial GBP binding can change external_id. It is
-- independently fenced by credentials and forbidden once any delivery exists.
create or replace function public.guard_channel_identity()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.id is distinct from old.id or new.workspace_id is distinct from old.workspace_id or new.platform is distinct from old.platform then
    raise exception using errcode='23514',message='Channel identity cannot be reassigned';
  end if;
  if new.external_id is distinct from old.external_id then
    if current_user not in ('postgres','supabase_admin') or old.platform<>'google_business' or
      old.external_id !~ '^accounts/[0-9]+$' or new.external_id is null or new.external_id !~ '^accounts/[0-9]+/locations/[0-9]+$' or
      not starts_with(new.external_id,old.external_id||'/locations/') or
      exists(select 1 from public.scheduler_jobs where channel_id=old.id) or exists(select 1 from public.analytics_snapshots where channel_id=old.id) then
      raise exception using errcode='23514',message='Channel identity cannot be reassigned; connect another account explicitly';
    end if;
  end if;
  return new;
end $$;

create or replace function public.bind_google_business_location(
  _workspace_id uuid,_actor_id uuid,_channel_id uuid,_expected_version uuid,_location_reference text,_location_name text,_address text
) returns public.channels language plpgsql security definer set search_path=public as $$
declare result public.channels; account_id text; location_id text;
begin
  perform 1 from public.workspace_members where workspace_id=_workspace_id and user_id=_actor_id and role in ('owner','admin') for share;
  if not found then raise exception using errcode='42501',message='Insufficient permission to bind a location'; end if;
  select * into result from public.channels where id=_channel_id and workspace_id=_workspace_id for update;
  if result.id is null or result.platform<>'google_business' or result.status<>'connected' then raise exception 'Reconecte o canal Google Business antes de escolher a unidade.'; end if;
  perform 1 from public.oauth_tokens where channel_id=_channel_id and token_version=_expected_version and not refresh_uncertain for update;
  if not found then raise exception using errcode='40001',message='A autorização mudou durante a consulta. Atualize as unidades antes de confirmar.'; end if;
  if _location_reference is null or _location_reference !~ '^accounts/[0-9]+/locations/[0-9]+$' or nullif(btrim(_location_name),'') is null or length(_location_name)>500 or length(coalesce(_address,''))>1000 then
    raise exception using errcode='23514',message='Invalid Google Business location';
  end if;
  if result.external_id=_location_reference and result.metadata->>'location_confirmed'='true' then return result; end if;
  if result.external_id is null or result.external_id !~ '^accounts/[0-9]+$' or not starts_with(_location_reference,result.external_id||'/locations/') or
    exists(select 1 from public.scheduler_jobs where channel_id=_channel_id) or exists(select 1 from public.analytics_snapshots where channel_id=_channel_id) then
    raise exception using errcode='23514',message='A unidade deste canal não pode ser trocada. Conecte outro canal explicitamente.';
  end if;
  account_id:=split_part(_location_reference,'/',2);location_id:=split_part(_location_reference,'/',4);
  update public.channels set external_id=_location_reference,handle=_location_name,metadata=metadata||jsonb_build_object('requires_location_selection',false,'location_confirmed',true,
    'account_id',account_id,'location_id',location_id,'location_name',_location_name,'address',_address)
    where id=_channel_id returning * into result;
  insert into public.domain_events(workspace_id,event_type,payload) values(_workspace_id,'channel.business_location_bound',jsonb_build_object('channel_id',_channel_id,'actor_id',_actor_id,'location',_location_reference));
  return result;
end $$;
revoke all on function public.bind_google_business_location(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.bind_google_business_location(uuid,uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.read_connected_oauth_token(_channel_id uuid,_platform public.social_platform)
returns public.oauth_tokens language sql stable security definer set search_path=public as $$
  select t from public.oauth_tokens t join public.channels c on c.id=t.channel_id
    where c.id=_channel_id and c.platform=_platform and c.status='connected';
$$;
revoke all on function public.read_connected_oauth_token(uuid,public.social_platform) from public,anon,authenticated;
grant execute on function public.read_connected_oauth_token(uuid,public.social_platform) to service_role;

-- Serialize enqueue against binding/disconnect, including direct authenticated RPC calls.
create or replace function public.enqueue_publication(_content_id uuid,_channel_ids uuid[],_scheduled_at timestamptz)
returns setof public.scheduler_jobs language plpgsql security definer set search_path=public as $$
declare item public.content; channel_uuid uuid; channel_row public.channels;
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
  foreach channel_uuid in array (select array_agg(x order by x) from unnest(_channel_ids) x) loop
    select * into channel_row from public.channels where id=channel_uuid and workspace_id=item.workspace_id for share;
    if channel_row.id is null or channel_row.status<>'connected' or not exists(select 1 from public.oauth_tokens t where t.channel_id=channel_uuid and not t.refresh_uncertain) then
      raise exception 'Conecte ou reconecte todos os canais neste workspace antes de agendar.';
    end if;
    if channel_row.platform='google_business' and (channel_row.external_id is null or channel_row.external_id !~ '^accounts/[0-9]+/locations/[0-9]+$' or
      channel_row.metadata->>'location_confirmed' is distinct from 'true' or channel_row.metadata->>'requires_location_selection' is distinct from 'false' or
      channel_row.metadata->>'account_id' is distinct from split_part(channel_row.external_id,'/',2) or channel_row.metadata->>'location_id' is distinct from split_part(channel_row.external_id,'/',4)) then
      raise exception using errcode='23514',message='Escolha uma unidade Google Business verificada antes de agendar.';
    end if;
  end loop;
  return query insert into public.scheduler_jobs(workspace_id,content_id,channel_id,scheduled_at,status)
    select item.workspace_id,item.id,x,_scheduled_at,'pending'::public.job_status from unnest(_channel_ids) x returning *;
  update public.content set status='scheduled' where id=item.id;
  insert into public.domain_events(workspace_id,event_type,payload) values(item.workspace_id,'content.scheduled',
    jsonb_build_object('content_id',item.id,'channel_ids',_channel_ids,'scheduled_at',_scheduled_at));
end $$;

