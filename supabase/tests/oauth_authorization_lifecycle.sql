-- VELT only. Temporary synthetic users/workspaces, no network/provider call.
-- Every probe and the entire suite roll back. Not OAuth provider homologation.
begin;
set local statement_timeout='60s';
create temporary table qa5 as select gen_random_uuid() owner_id,gen_random_uuid() admin_id,gen_random_uuid() editor_id,gen_random_uuid() viewer_id,gen_random_uuid() other_id,
  gen_random_uuid() ws,gen_random_uuid() ws_b,gen_random_uuid() brand,gen_random_uuid() foreign_brand,gen_random_uuid() tiktok,gen_random_uuid() facebook,gen_random_uuid() gbp,gen_random_uuid() bound,gen_random_uuid() content_id;
create temporary table qa5_results(name text,passed boolean,expected text,actual text,affected bigint,detail text);
grant select on qa5 to authenticated,service_role,anon;
grant select,insert on qa5_results to authenticated,service_role,anon;
insert into auth.users(id,email,raw_user_meta_data) select u,'qa-r5-sql-'||u||'@example.invalid','{}'::jsonb from qa5 cross join lateral unnest(array[owner_id,admin_id,editor_id,viewer_id,other_id]) u;
insert into public.workspaces(id,owner_id,name,slug) select ws,owner_id,'QA R5 SQL A','qa-r5-'||ws from qa5 union all select ws_b,other_id,'QA R5 SQL B','qa-r5-'||ws_b from qa5;
insert into public.workspace_members(workspace_id,user_id,role) select ws,admin_id,'admin'::public.app_role from qa5 union all select ws,editor_id,'editor' from qa5 union all select ws,viewer_id,'viewer' from qa5;
insert into public.brands(id,workspace_id,name) select brand,ws,'QA R5 brand A' from qa5 union all select foreign_brand,ws_b,'QA R5 brand B' from qa5;
insert into public.content(id,workspace_id,title,status) select content_id,ws,'QA R5 future only','draft' from qa5;
insert into public.channels(id,workspace_id,platform,status,external_id,brand_id,connected_at,metadata)
  select tiktok,ws,'tiktok'::public.social_platform,'connected'::public.channel_status,'QA_TIKTOK',brand,clock_timestamp()-interval '1 day','{}'::jsonb from qa5 union all
  select facebook,ws,'facebook','connected','QA_FACEBOOK',brand,clock_timestamp()-interval '1 day','{}' from qa5 union all
  select gbp,ws,'google_business','connected','accounts/100',brand,clock_timestamp()-interval '1 day','{"requires_location_selection":true,"location_confirmed":false}' from qa5 union all
  select bound,ws,'google_business','connected','accounts/100/locations/300',brand,clock_timestamp()-interval '1 day','{"requires_location_selection":false,"location_confirmed":true,"account_id":"100","location_id":"300","location_name":"QA Existing"}' from qa5;
insert into public.oauth_tokens(channel_id,access_token_ciphertext,refresh_token_ciphertext,token_type,expires_at)
  select x,'QA_SYNTHETIC_CIPHERTEXT_NEVER_SENT','QA_SYNTHETIC_REFRESH_NEVER_SENT','Bearer',clock_timestamp()+interval '1 hour' from qa5 cross join lateral unnest(array[tiktok,facebook,gbp,bound]) x;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from qa5),'role','authenticated')::text,true);
create function pg_temp.probe(_name text,_sql text,_expected text default '00000',_rows bigint default 1)
returns void language plpgsql as $$
declare n bigint:=0;code text:='00000';msg text:='operation reverted';
begin
  begin execute _sql;get diagnostics n=row_count;raise exception using errcode='ZQ005',message='rollback probe';
  exception when sqlstate 'ZQ005' then null;when others then code:=sqlstate;msg:=sqlerrm;n:=0;end;
  insert into qa5_results values(_name,code=_expected and (code<>'00000' or _rows is null or n=_rows),_expected,code,n,msg);
end $$;
create function pg_temp.ok(_value boolean) returns boolean language plpgsql as $$
begin if _value is distinct from true then raise exception 'assertion failed';end if;return true;end $$;
create function pg_temp.issue(_actor uuid,_platform public.social_platform default 'tiktok',_provider text default 'tiktok',_brand uuid default null,_target uuid default null,_workspace uuid default null)
returns public.oauth_authorization_attempts language plpgsql as $$
declare intent_id uuid; result public.oauth_authorization_attempts;claims text:=current_setting('request.jwt.claims',true);
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',_actor,'role','authenticated')::text,true);
  intent_id:=public.register_oauth_authorization(coalesce(_workspace,(select ws from qa5)),_provider,_platform,_brand,
    replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'https://qa.example.invalid/api/public/oauth/callback/'||_provider,clock_timestamp()+interval '9 minutes',_target);
  select * into result from public.oauth_authorization_attempts where id=intent_id;
  perform set_config('request.jwt.claims',coalesce(claims,''),true);
  return result;
end $$;
create function pg_temp.take(_intent public.oauth_authorization_attempts)
returns public.oauth_authorization_attempts language sql as $$
  select public.consume_oauth_authorization(_intent.state_hash,_intent.workspace_id,_intent.actor_id,_intent.provider,_intent.brand_id,_intent.redirect_uri,_intent.target_channel_id);
$$;
create function pg_temp.finish(_intent public.oauth_authorization_attempts,_external text default 'QA_NEW_ID',_cipher text default 'QA_NEW_CIPHERTEXT_NEVER_SENT',_metadata jsonb default '{}')
returns public.channels language sql as $$
  select public.complete_oauth_authorization(_intent.id,_intent.exchange_token,_external,'QA Synthetic',_metadata,_cipher,'QA_NEW_REFRESH_NEVER_SENT','Bearer','qa.scope',clock_timestamp()+interval '1 hour');
$$;
create function pg_temp.claim(_channel uuid default null,_platform public.social_platform default 'tiktok')
returns jsonb language sql as $$
  select public.claim_oauth_token_refresh(coalesce(_channel,(select tiktok from qa5)),_platform,(select token_version from public.oauth_tokens where channel_id=coalesce(_channel,(select tiktok from qa5))));
$$;
create function pg_temp.begin_refresh(_claim jsonb)
returns boolean language sql as $$
  select public.begin_oauth_token_refresh((_claim->>'channel_id')::uuid,(_claim->>'token_version')::uuid,(_claim->>'lease')::uuid);
$$;
create function pg_temp.finish_refresh(_claim jsonb,_new_version uuid default gen_random_uuid())
returns boolean language sql as $$
  select public.complete_oauth_token_refresh((_claim->>'channel_id')::uuid,(_claim->>'token_version')::uuid,(_claim->>'lease')::uuid,_new_version,'QA_REFRESHED_CIPHERTEXT_NEVER_SENT','QA_ROTATED_REFRESH_NEVER_SENT',clock_timestamp()+interval '1 hour','qa.scope','Bearer');
$$;

create function pg_temp.check_issue(_actor uuid) returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;f record;
begin select * into f from qa5;a:=pg_temp.issue(_actor,'tiktok','tiktok',f.brand,f.tiktok);
  perform pg_temp.ok(a.actor_id=_actor and a.workspace_id=f.ws and a.state='pending' and a.target_channel_id=f.tiktok and a.target_external_id='QA_TIKTOK' and a.brand_id=f.brand);
  perform pg_temp.ok(a.expires_at>a.created_at and a.expires_at<=a.created_at+interval '10 minutes' and a.state_hash ~ '^[a-f0-9]{64}$' and a.exchange_token is null);
  perform pg_temp.ok(a.context_version=(select version from public.oauth_authorization_contexts where workspace_id=f.ws and platform='tiktok'));
  return true;end $$;
create function pg_temp.check_consume(_wrong text default null) returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;b public.oauth_authorization_attempts;f record;
begin select * into f from qa5;a:=pg_temp.issue(f.owner_id,'tiktok','tiktok',f.brand,f.tiktok);
  if _wrong is not null then
    b:=public.consume_oauth_authorization(case when _wrong='hash' then repeat('f',64) else a.state_hash end,
      case when _wrong='workspace' then f.ws_b else a.workspace_id end,case when _wrong='actor' then f.admin_id else a.actor_id end,
      case when _wrong='provider' then 'facebook' else a.provider end,case when _wrong='brand' then null else a.brand_id end,
      case when _wrong='redirect' then 'https://qa.example.invalid/api/public/oauth/callback/facebook' else a.redirect_uri end,
      case when _wrong='target' then f.facebook else a.target_channel_id end);
    perform pg_temp.ok(b.id is null);
  end if;
  b:=pg_temp.take(a);perform pg_temp.ok(b.id=a.id and b.state='exchanging' and b.exchange_token is not null and b.exchange_until>clock_timestamp());
  a:=pg_temp.take(b);perform pg_temp.ok(a.id is null);return true;end $$;
create function pg_temp.check_expiry() returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;b public.oauth_authorization_attempts;
begin a:=pg_temp.issue((select owner_id from qa5));update public.oauth_authorization_attempts set created_at=clock_timestamp()-interval '11 minutes',expires_at=clock_timestamp()-interval '2 minutes' where id=a.id;
  b:=pg_temp.take(a);perform pg_temp.ok(b.id is null);return true;end $$;
create function pg_temp.check_consumption_revocation(_deleted boolean default false) returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;b public.oauth_authorization_attempts;
begin a:=pg_temp.issue((select admin_id from qa5));
  if _deleted then delete from public.workspace_members where workspace_id=a.workspace_id and user_id=a.actor_id;else update public.workspace_members set role='viewer' where workspace_id=a.workspace_id and user_id=a.actor_id;end if;
  b:=pg_temp.take(a);perform pg_temp.ok(b.id is null);return true;end $$;
create function pg_temp.check_fail() returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;b public.oauth_authorization_attempts;
begin a:=pg_temp.take(pg_temp.issue((select owner_id from qa5)));
  perform pg_temp.ok(not public.fail_oauth_authorization(a.id,gen_random_uuid(),'exchange_failed'));
  perform pg_temp.ok(public.fail_oauth_authorization(a.id,a.exchange_token,'provider_denied'));
  perform pg_temp.ok((select state='failed' and reason='provider_denied' from public.oauth_authorization_attempts where id=a.id));
  b:=pg_temp.take(a);perform pg_temp.ok(b.id is null);return true;end $$;
create function pg_temp.check_complete(_mode text default 'valid') returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;ch public.channels;f record;
begin select * into f from qa5;a:=pg_temp.issue(f.admin_id,'tiktok','tiktok',f.brand);
  if _mode<>'pending' then a:=pg_temp.take(a);end if;
  if _mode='lease' then a.exchange_token:=gen_random_uuid();end if;
  if _mode='lease_expired' then update public.oauth_authorization_attempts set exchange_until=clock_timestamp()-interval '1 second' where id=a.id;end if;
  if _mode='demoted' then update public.workspace_members set role='viewer' where workspace_id=f.ws and user_id=f.admin_id;end if;
  if _mode='brand_removed' then delete from public.brands where id=f.brand;end if;
  ch:=pg_temp.finish(a);
  perform pg_temp.ok(ch.workspace_id=f.ws and ch.platform='tiktok' and ch.status='connected' and ch.brand_id=f.brand and ch.oauth_authorization_started_at=a.created_at);
  perform pg_temp.ok((select state='completed' and finished_at is not null from public.oauth_authorization_attempts where id=a.id));
  perform pg_temp.ok((select count(*)=1 from public.oauth_tokens where channel_id=ch.id and access_token_ciphertext='QA_NEW_CIPHERTEXT_NEVER_SENT' and refresh_token_ciphertext='QA_NEW_REFRESH_NEVER_SENT'));
  perform pg_temp.ok((select count(*)=1 from public.domain_events where workspace_id=f.ws and event_type='channel.connected' and payload->>'authorization_id'=a.id::text));
  perform pg_temp.ok(not exists(select 1 from public.domain_events where workspace_id=f.ws and payload::text like '%CIPHERTEXT%' or workspace_id=f.ws and payload::text like '%REFRESH_NEVER_SENT%'));
  if _mode='replay' then ch:=pg_temp.finish(a);end if;
  return true;end $$;
create function pg_temp.check_disconnect(_mode text default 'generic') returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;ch public.channels;f record;
begin select * into f from qa5;a:=pg_temp.issue(f.owner_id,'tiktok','tiktok',null,case when _mode='target' then f.tiktok else null end);
  a:=pg_temp.take(a);
  if _mode='delete' then delete from public.channels where id=f.tiktok;
  else ch:=public.disconnect_oauth_channel(f.tiktok);perform pg_temp.ok(ch.status='disconnected' and ch.oauth_revoked_at is not null);end if;
  perform pg_temp.ok(not exists(select 1 from public.oauth_tokens where channel_id=f.tiktok));
  if _mode='assert' then perform pg_temp.ok((select state='cancelled' and reason='disconnected' from public.oauth_authorization_attempts where id=a.id));return true;end if;
  if _mode='epoch' then update public.oauth_authorization_attempts set state='exchanging' where id=a.id;end if;
  ch:=pg_temp.finish(a,case when _mode='target' then 'QA_TIKTOK' else 'QA_LATE_NEW_ID' end);return true;end $$;
create function pg_temp.check_newest(_new_first boolean,_same_instant boolean default false) returns boolean language plpgsql as $$
declare older public.oauth_authorization_attempts;newer public.oauth_authorization_attempts;ch public.channels;f record;
begin select * into f from qa5;older:=pg_temp.issue(f.owner_id);newer:=pg_temp.issue(f.owner_id);
  -- These are explicit clock fixtures, not a change to production timestamps.
  -- PGlite's millisecond clock can give consecutive starts the same instant.
  -- Exercise strict ordering deterministically and test equal-time refusal too.
  if _same_instant then
    update public.oauth_authorization_attempts set created_at=older.created_at where id=newer.id returning * into newer;
  else
    update public.oauth_authorization_attempts set created_at=created_at-interval '1 second' where id=older.id returning * into older;
  end if;
  older:=pg_temp.take(older);newer:=pg_temp.take(newer);
  if _new_first then ch:=pg_temp.finish(newer);ch:=pg_temp.finish(older);
  else ch:=pg_temp.finish(older);ch:=pg_temp.finish(newer);perform pg_temp.ok(ch.oauth_authorization_started_at=newer.created_at);end if;
  return true;end $$;
create function pg_temp.check_reconnect(_same boolean default true) returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;ch public.channels;f record;old_version uuid;
begin select * into f from qa5;select token_version into old_version from public.oauth_tokens where channel_id=f.tiktok;
  a:=pg_temp.take(pg_temp.issue(f.owner_id,'tiktok','tiktok',f.brand,f.tiktok));ch:=pg_temp.finish(a,case when _same then 'QA_TIKTOK' else 'QA_OTHER_TIKTOK' end);
  perform pg_temp.ok(ch.id=f.tiktok and ch.external_id='QA_TIKTOK' and ch.brand_id=f.brand);
  perform pg_temp.ok((select token_version<>old_version from public.oauth_tokens where channel_id=f.tiktok));return true;end $$;
create function pg_temp.check_rate_limit() returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;i integer;
begin for i in 1..21 loop a:=pg_temp.issue((select owner_id from qa5));end loop;return true;end $$;

select pg_temp.probe('owner_registers_bound_intent','select pg_temp.check_issue(owner_id) from qa5');
select pg_temp.probe('admin_registers_bound_intent','select pg_temp.check_issue(admin_id) from qa5');
select pg_temp.probe('editor_cannot_register_intent','select pg_temp.check_issue(editor_id) from qa5','42501');
select pg_temp.probe('viewer_cannot_register_intent','select pg_temp.check_issue(viewer_id) from qa5','42501');
select pg_temp.probe('foreign_actor_cannot_register_intent','select pg_temp.check_issue(other_id) from qa5','42501');
select pg_temp.probe('foreign_brand_rejected','select pg_temp.issue(owner_id,''tiktok'',''tiktok'',foreign_brand) from qa5','23503');
select pg_temp.probe('mismatched_provider_platform_rejected','select pg_temp.issue(owner_id,''facebook'',''tiktok'') from qa5','23514');
select pg_temp.probe('target_from_wrong_platform_rejected','select pg_temp.issue(owner_id,''tiktok'',''tiktok'',null,facebook) from qa5','23514');
select pg_temp.probe('state_single_use','select pg_temp.check_consume()');
select pg_temp.probe('state_bound_workspace','select pg_temp.check_consume(''workspace'')');
select pg_temp.probe('state_bound_actor','select pg_temp.check_consume(''actor'')');
select pg_temp.probe('state_bound_provider','select pg_temp.check_consume(''provider'')');
select pg_temp.probe('state_bound_brand','select pg_temp.check_consume(''brand'')');
select pg_temp.probe('state_bound_redirect','select pg_temp.check_consume(''redirect'')');
select pg_temp.probe('state_bound_target','select pg_temp.check_consume(''target'')');
select pg_temp.probe('state_bound_hash','select pg_temp.check_consume(''hash'')');
select pg_temp.probe('expired_intent_not_consumed','select pg_temp.check_expiry()');
select pg_temp.probe('demoted_actor_not_consumed','select pg_temp.check_consumption_revocation(false)');
select pg_temp.probe('removed_actor_not_consumed','select pg_temp.check_consumption_revocation(true)');
select pg_temp.probe('denied_intent_cannot_be_reused','select pg_temp.check_fail()');
select pg_temp.probe('atomic_complete_credential_and_audit','select pg_temp.check_complete()');
select pg_temp.probe('unconsumed_intent_cannot_complete','select pg_temp.check_complete(''pending'')','40001');
select pg_temp.probe('wrong_exchange_token_cannot_complete','select pg_temp.check_complete(''lease'')','40001');
select pg_temp.probe('expired_exchange_cannot_complete','select pg_temp.check_complete(''lease_expired'')','40001');
select pg_temp.probe('demotion_during_exchange_blocks_commit','select pg_temp.check_complete(''demoted'')','42501');
select pg_temp.probe('brand_removed_during_exchange_blocks_commit','select pg_temp.check_complete(''brand_removed'')','40001');
select pg_temp.probe('completed_intent_cannot_commit_twice','select pg_temp.check_complete(''replay'')','40001');
select pg_temp.probe('disconnect_cancels_inflight_and_removes_credentials','select pg_temp.check_disconnect(''assert'')');
select pg_temp.probe('disconnect_blocks_late_generic_new_identity','select pg_temp.check_disconnect(''generic'')','40001');
select pg_temp.probe('disconnect_blocks_late_targeted_reconnect','select pg_temp.check_disconnect(''target'')','40001');
select pg_temp.probe('delete_blocks_late_generic_new_identity','select pg_temp.check_disconnect(''delete'')','40001');
select pg_temp.probe('context_epoch_also_fences_stale_commits','select pg_temp.check_disconnect(''epoch'')','40001');
select pg_temp.probe('newer_started_intent_can_supersede_older_completion','select pg_temp.check_newest(false)');
select pg_temp.probe('older_intent_cannot_overwrite_newer_completion','select pg_temp.check_newest(true)','40001');
select pg_temp.probe('equal_time_intents_cannot_overwrite_completed_authorization','select pg_temp.check_newest(false,true)','40001');
select pg_temp.probe('reconnect_preserves_account_channel_and_brand','select pg_temp.check_reconnect(true)');
select pg_temp.probe('reconnect_cannot_target_other_account','select pg_temp.check_reconnect(false)','23514');
select pg_temp.probe('per_actor_rate_limit','select pg_temp.check_rate_limit()','54000');
select pg_temp.probe('ttl_over_ten_minutes_rejected','select public.register_oauth_authorization(ws,''tiktok'',''tiktok'',null,repeat(''a'',64),''https://qa.example.invalid/api/public/oauth/callback/tiktok'',clock_timestamp()+interval ''11 minutes'') from qa5','23514');
select pg_temp.probe('expired_ttl_rejected','select public.register_oauth_authorization(ws,''tiktok'',''tiktok'',null,repeat(''a'',64),''https://qa.example.invalid/api/public/oauth/callback/tiktok'',clock_timestamp()-interval ''1 minute'') from qa5','23514');
select pg_temp.probe('raw_state_not_accepted_as_digest','select public.register_oauth_authorization(ws,''tiktok'',''tiktok'',null,''raw-signed-state'',''https://qa.example.invalid/api/public/oauth/callback/tiktok'',clock_timestamp()+interval ''9 minutes'') from qa5','23514');
select pg_temp.probe('redirect_must_match_callback_provider','select public.register_oauth_authorization(ws,''tiktok'',''tiktok'',null,repeat(''a'',64),''https://qa.example.invalid/api/public/oauth/callback/facebook'',clock_timestamp()+interval ''9 minutes'') from qa5','23514');

set local role authenticated;
select pg_temp.probe('client_cannot_read_private_intents','select * from public.oauth_authorization_attempts','42501');
select pg_temp.probe('client_cannot_read_private_epochs','select * from public.oauth_authorization_contexts','42501');
select pg_temp.probe('client_cannot_insert_intents','insert into public.oauth_authorization_attempts(state_hash) values(repeat(''a'',64))','42501');
select pg_temp.probe('client_cannot_consume_intents','select public.consume_oauth_authorization(repeat(''a'',64),ws,owner_id,''tiktok'',null,''https://qa.example.invalid/api/public/oauth/callback/tiktok'') from qa5','42501');
select pg_temp.probe('client_cannot_complete_intents','select public.complete_oauth_authorization(gen_random_uuid(),gen_random_uuid(),''QA'',null,''{}'',''QA'',null,null,null,null)','42501');
select pg_temp.probe('client_cannot_fail_intents','select public.fail_oauth_authorization(gen_random_uuid(),gen_random_uuid(),''provider_denied'')','42501');
select pg_temp.probe('client_cannot_forge_connected_channel','insert into public.channels(workspace_id,platform,status) select ws,''tiktok'',''connected'' from qa5','23514');
select pg_temp.probe('client_cannot_forge_channel_metadata','update public.channels set metadata=''{}'' where id=(select gbp from qa5)','23514');
select pg_temp.probe('client_cannot_forge_revocation_marker','update public.channels set oauth_revoked_at=clock_timestamp() where id=(select tiktok from qa5)','23514');
select pg_temp.probe('manual_disconnected_registration_still_allowed','insert into public.channels(workspace_id,platform,handle) select ws,''facebook'',''QA manual'' from qa5');
select pg_temp.probe('owner_workspace_cascade_still_allowed','delete from public.workspaces where id=(select ws from qa5)');
set local role anon;
select pg_temp.probe('anon_cannot_register_intent','select public.register_oauth_authorization(ws,''tiktok'',''tiktok'',null,repeat(''a'',64),''https://qa.example.invalid/api/public/oauth/callback/tiktok'',clock_timestamp()+interval ''9 minutes'') from qa5','42501');
select pg_temp.probe('anon_cannot_read_tokens','select * from public.oauth_tokens','42501');
reset role;

select jsonb_build_object('all_passed',bool_and(passed),'passed',count(*) filter(where passed),'failed',count(*) filter(where not passed),'total',count(*),'results',jsonb_agg(to_jsonb(r) order by name)) as result from qa5_results r;
rollback;
