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

create function pg_temp.check_claim(_mode text default 'normal') returns boolean language plpgsql as $$
declare a jsonb;b jsonb;t public.oauth_tokens;f record;
begin select * into f from qa5;select * into t from public.oauth_tokens where channel_id=f.tiktok;
  if _mode='wrong_version' then a:=public.claim_oauth_token_refresh(f.tiktok,'tiktok',gen_random_uuid());perform pg_temp.ok(a->>'state'='changed');return true;end if;
  if _mode='wrong_platform' then a:=public.claim_oauth_token_refresh(f.tiktok,'facebook',t.token_version);perform pg_temp.ok(a->>'state'='disconnected');return true;end if;
  if _mode='disconnected' then perform public.disconnect_oauth_channel(f.tiktok);a:=public.claim_oauth_token_refresh(f.tiktok,'tiktok',t.token_version);perform pg_temp.ok(a->>'state'='disconnected');return true;end if;
  a:=pg_temp.claim();perform pg_temp.ok(a->>'state'='claimed' and a->>'channel_id'=f.tiktok::text and a->>'token_version'=t.token_version::text and (a->>'lease')::uuid is not null);
  perform pg_temp.ok(not (a ? 'access_token_ciphertext') and not (a ? 'refresh_token_ciphertext'));
  if _mode='expire_before_begin' then update public.oauth_tokens set refresh_locked_until=clock_timestamp()-interval '1 second' where channel_id=f.tiktok;
    b:=pg_temp.claim();perform pg_temp.ok(b->>'state'='claimed' and b->>'lease'<>a->>'lease');perform pg_temp.ok(not pg_temp.begin_refresh(a));return true;
  end if;
  if _mode='expire_after_begin' then perform pg_temp.ok(pg_temp.begin_refresh(a));update public.oauth_tokens set refresh_locked_until=clock_timestamp()-interval '1 second' where channel_id=f.tiktok;
    b:=pg_temp.claim();perform pg_temp.ok(b->>'state'='reconnect');perform pg_temp.ok((select status='expired' and authorization_issue='refresh_uncertain' from public.channels where id=f.tiktok));
    perform pg_temp.ok(not pg_temp.finish_refresh(a));return true;
  end if;
  b:=pg_temp.claim();perform pg_temp.ok(b->>'state'='busy');perform pg_temp.ok((select refresh_lease=(a->>'lease')::uuid and refresh_started_at is null from public.oauth_tokens where channel_id=f.tiktok));
  return true;end $$;
create function pg_temp.check_begin(_mode text default 'normal') returns boolean language plpgsql as $$
declare a jsonb;f record;ok boolean;
begin select * into f from qa5;a:=pg_temp.claim();
  if _mode='wrong_lease' then a:=jsonb_set(a,'{lease}',to_jsonb(gen_random_uuid()::text));end if;
  if _mode='wrong_version' then a:=jsonb_set(a,'{token_version}',to_jsonb(gen_random_uuid()::text));end if;
  if _mode='expired' then update public.oauth_tokens set refresh_locked_until=clock_timestamp()-interval '1 second' where channel_id=f.tiktok;end if;
  if _mode='disconnected' then perform public.disconnect_oauth_channel(f.tiktok);end if;
  ok:=pg_temp.begin_refresh(a);perform pg_temp.ok(ok=(_mode='normal'));
  if _mode='normal' then perform pg_temp.ok(not pg_temp.begin_refresh(a));perform pg_temp.ok((select refresh_started_at is not null from public.oauth_tokens where channel_id=f.tiktok));end if;
  return true;end $$;
create function pg_temp.check_refresh_commit(_mode text default 'normal') returns boolean language plpgsql as $$
declare a jsonb;f record;new_version uuid:=gen_random_uuid();ok boolean;intent public.oauth_authorization_attempts;ch public.channels;old_version uuid;
begin select * into f from qa5;a:=pg_temp.claim();old_version:=(a->>'token_version')::uuid;
  if _mode<>'unbegun' then perform pg_temp.ok(pg_temp.begin_refresh(a));end if;
  if _mode='wrong_lease' then a:=jsonb_set(a,'{lease}',to_jsonb(gen_random_uuid()::text));end if;
  if _mode='wrong_version' then a:=jsonb_set(a,'{token_version}',to_jsonb(gen_random_uuid()::text));end if;
  if _mode='disconnected' then perform public.disconnect_oauth_channel(f.tiktok);end if;
  if _mode='deleted' then delete from public.channels where id=f.tiktok;end if;
  if _mode='reauthorized' then intent:=pg_temp.take(pg_temp.issue(f.owner_id,'tiktok','tiktok',f.brand,f.tiktok));ch:=pg_temp.finish(intent,'QA_TIKTOK');end if;
  ok:=pg_temp.finish_refresh(a,new_version);perform pg_temp.ok(ok=(_mode in ('normal','late_without_takeover')));
  if _mode='normal' then
    perform pg_temp.ok((select token_version=new_version and token_version<>old_version and access_token_ciphertext='QA_REFRESHED_CIPHERTEXT_NEVER_SENT' and refresh_token_ciphertext='QA_ROTATED_REFRESH_NEVER_SENT' and refresh_lease is null and refresh_started_at is null and not refresh_uncertain from public.oauth_tokens where channel_id=f.tiktok));
    perform pg_temp.ok((select status='connected' from public.channels where id=f.tiktok));
    perform pg_temp.ok(not pg_temp.finish_refresh(a,new_version));
    perform pg_temp.ok((select count(*)=1 from public.domain_events where workspace_id=f.ws and event_type='channel.authorization_refreshed'));
    perform pg_temp.ok(not exists(select 1 from public.domain_events where workspace_id=f.ws and payload::text like '%CIPHERTEXT%' or workspace_id=f.ws and payload::text like '%ROTATED_REFRESH%'));
  end if;
  if _mode in ('disconnected','deleted') then perform pg_temp.ok(not exists(select 1 from public.oauth_tokens where channel_id=f.tiktok));end if;
  if _mode='reauthorized' then perform pg_temp.ok((select access_token_ciphertext='QA_NEW_CIPHERTEXT_NEVER_SENT' and token_version<>old_version from public.oauth_tokens where channel_id=f.tiktok));end if;
  return true;end $$;
create function pg_temp.check_late() returns boolean language plpgsql as $$
declare a jsonb;
begin a:=pg_temp.claim();perform pg_temp.ok(pg_temp.begin_refresh(a));update public.oauth_tokens set refresh_locked_until=clock_timestamp()-interval '1 second' where channel_id=(a->>'channel_id')::uuid;
  -- Expiry alone does not invalidate a uniquely fenced worker if nobody has
  -- observed/recovered the abandoned grant and no reauthorization/disconnect won.
  perform pg_temp.ok(pg_temp.finish_refresh(a));return true;end $$;
create function pg_temp.check_refresh_fail(_outcome text,_begun boolean default true) returns boolean language plpgsql as $$
declare a jsonb;ok boolean;f record;uncertain boolean;
begin select * into f from qa5;a:=pg_temp.claim();if _begun then perform pg_temp.ok(pg_temp.begin_refresh(a));end if;
  ok:=public.fail_oauth_token_refresh(f.tiktok,(a->>'token_version')::uuid,(a->>'lease')::uuid,_outcome);
  if _outcome<>'not_sent' and not _begun then perform pg_temp.ok(not ok);return true;end if;
  perform pg_temp.ok(ok);uncertain:=_outcome in ('uncertain','invalid_grant','invalid_response');
  perform pg_temp.ok((select refresh_lease is null and refresh_started_at is null and refresh_uncertain=uncertain and (uncertain or refresh_retry_after>clock_timestamp()) from public.oauth_tokens where channel_id=f.tiktok));
  perform pg_temp.ok((select status=case when uncertain then 'expired'::public.channel_status else 'connected'::public.channel_status end from public.channels where id=f.tiktok));
  if not uncertain then a:=pg_temp.claim();perform pg_temp.ok(a->>'state'='cooldown');end if;
  return true;end $$;
create function pg_temp.check_stale_failure(_mode text default 'refresh') returns boolean language plpgsql as $$
declare a jsonb;f record;new_version uuid:=gen_random_uuid();intent public.oauth_authorization_attempts;ch public.channels;
begin select * into f from qa5;a:=pg_temp.claim();perform pg_temp.ok(pg_temp.begin_refresh(a));
  if _mode='disconnect' then perform public.disconnect_oauth_channel(f.tiktok);
  elsif _mode='reauthorize' then intent:=pg_temp.take(pg_temp.issue(f.owner_id,'tiktok','tiktok',f.brand,f.tiktok));ch:=pg_temp.finish(intent,'QA_TIKTOK');
  else perform pg_temp.ok(pg_temp.finish_refresh(a,new_version));end if;
  perform pg_temp.ok(not public.fail_oauth_token_refresh(f.tiktok,(a->>'token_version')::uuid,(a->>'lease')::uuid,'invalid_grant'));
  if _mode<>'disconnect' then perform pg_temp.ok((select status='connected' and authorization_issue is null from public.channels where id=f.tiktok));end if;return true;end $$;
create function pg_temp.check_invalidation(_mode text default 'current') returns boolean language plpgsql as $$
declare f record;old_version uuid;a jsonb;ok boolean;intent public.oauth_authorization_attempts;ch public.channels;
begin select * into f from qa5;select token_version into old_version from public.oauth_tokens where channel_id=f.tiktok;
  if _mode='refreshed' then a:=pg_temp.claim();perform pg_temp.ok(pg_temp.begin_refresh(a));perform pg_temp.ok(pg_temp.finish_refresh(a));end if;
  if _mode='reauthorized' then intent:=pg_temp.take(pg_temp.issue(f.owner_id,'tiktok','tiktok',f.brand,f.tiktok));ch:=pg_temp.finish(intent,'QA_TIKTOK');end if;
  if _mode='disconnected' then perform public.disconnect_oauth_channel(f.tiktok);end if;
  ok:=public.invalidate_oauth_token_version(f.tiktok,old_version,'provider_unauthorized');perform pg_temp.ok(ok=(_mode='current'));
  if _mode='current' then perform pg_temp.ok((select status='expired' and authorization_issue='provider_unauthorized' from public.channels where id=f.tiktok));
  elsif _mode<>'disconnected' then perform pg_temp.ok((select status='connected' and authorization_issue is null from public.channels where id=f.tiktok));end if;return true;end $$;
create function pg_temp.invalid_refresh(_mode text) returns boolean language plpgsql as $$
declare a jsonb;result boolean;
begin a:=pg_temp.claim();perform pg_temp.ok(pg_temp.begin_refresh(a));
  result:=public.complete_oauth_token_refresh((a->>'channel_id')::uuid,(a->>'token_version')::uuid,(a->>'lease')::uuid,
    case when _mode='same_version' then (a->>'token_version')::uuid else gen_random_uuid() end,
    case when _mode='empty_access' then '' else 'QA_NEW' end,null,
    case when _mode='past' then clock_timestamp()-interval '1 hour' when _mode='far_future' then clock_timestamp()+interval '2 years' when _mode='no_expiry' then null else clock_timestamp()+interval '1 hour' end,null,'Bearer');return result;end $$;

select pg_temp.probe('one_refresh_reservation_only','select pg_temp.check_claim()');
select pg_temp.probe('wrong_version_does_not_claim','select pg_temp.check_claim(''wrong_version'')');
select pg_temp.probe('wrong_platform_does_not_claim','select pg_temp.check_claim(''wrong_platform'')');
select pg_temp.probe('disconnected_channel_does_not_claim','select pg_temp.check_claim(''disconnected'')');
select pg_temp.probe('unbegun_abandoned_lease_is_reclaimable','select pg_temp.check_claim(''expire_before_begin'')');
select pg_temp.probe('begun_abandoned_grant_is_not_retried','select pg_temp.check_claim(''expire_after_begin'')');
select pg_temp.probe('begin_is_single_use','select pg_temp.check_begin()');
select pg_temp.probe('wrong_lease_cannot_begin','select pg_temp.check_begin(''wrong_lease'')');
select pg_temp.probe('wrong_version_cannot_begin','select pg_temp.check_begin(''wrong_version'')');
select pg_temp.probe('expired_lease_cannot_begin','select pg_temp.check_begin(''expired'')');
select pg_temp.probe('disconnect_wins_before_begin','select pg_temp.check_begin(''disconnected'')');
select pg_temp.probe('refresh_commits_version_ciphertexts_and_audit','select pg_temp.check_refresh_commit()');
select pg_temp.probe('unbegun_grant_cannot_commit','select pg_temp.check_refresh_commit(''unbegun'')');
select pg_temp.probe('wrong_lease_cannot_commit','select pg_temp.check_refresh_commit(''wrong_lease'')');
select pg_temp.probe('wrong_version_cannot_commit','select pg_temp.check_refresh_commit(''wrong_version'')');
select pg_temp.probe('late_refresh_never_recreates_disconnected_credentials','select pg_temp.check_refresh_commit(''disconnected'')');
select pg_temp.probe('late_refresh_never_recreates_deleted_credentials','select pg_temp.check_refresh_commit(''deleted'')');
select pg_temp.probe('late_refresh_never_overwrites_reauthorization','select pg_temp.check_refresh_commit(''reauthorized'')');
select pg_temp.probe('unique_late_worker_can_commit_without_takeover','select pg_temp.check_late()');
select pg_temp.probe('not_sent_reservation_releases_without_expiry','select pg_temp.check_refresh_fail(''not_sent'',false)');
select pg_temp.probe('lost_begin_ack_can_release_without_any_post','select pg_temp.check_refresh_fail(''not_sent'',true)');
select pg_temp.probe('throttled_grant_has_cooldown','select pg_temp.check_refresh_fail(''throttled'')');
select pg_temp.probe('clear_configuration_refusal_has_cooldown','select pg_temp.check_refresh_fail(''rejected'')');
select pg_temp.probe('uncertain_grant_requires_reconnect','select pg_temp.check_refresh_fail(''uncertain'')');
select pg_temp.probe('invalid_grant_requires_reconnect','select pg_temp.check_refresh_fail(''invalid_grant'')');
select pg_temp.probe('invalid_response_requires_reconnect','select pg_temp.check_refresh_fail(''invalid_response'')');
select pg_temp.probe('unbegun_grant_cannot_report_provider_failure','select pg_temp.check_refresh_fail(''uncertain'',false)');
select pg_temp.probe('stale_failure_cannot_expire_refreshed_token','select pg_temp.check_stale_failure(''refresh'')');
select pg_temp.probe('stale_failure_cannot_expire_reauthorized_token','select pg_temp.check_stale_failure(''reauthorize'')');
select pg_temp.probe('stale_failure_cannot_change_disconnected_channel','select pg_temp.check_stale_failure(''disconnect'')');
select pg_temp.probe('current_analytics_auth_failure_is_recorded','select pg_temp.check_invalidation()');
select pg_temp.probe('old_analytics_auth_failure_cannot_expire_refresh','select pg_temp.check_invalidation(''refreshed'')');
select pg_temp.probe('old_analytics_auth_failure_cannot_expire_reconnect','select pg_temp.check_invalidation(''reauthorized'')');
select pg_temp.probe('old_analytics_auth_failure_cannot_undo_disconnect','select pg_temp.check_invalidation(''disconnected'')');
select pg_temp.probe('cannot_commit_same_version','select pg_temp.invalid_refresh(''same_version'')','23514');
select pg_temp.probe('cannot_commit_empty_access','select pg_temp.invalid_refresh(''empty_access'')','23514');
select pg_temp.probe('cannot_commit_expired_credential','select pg_temp.invalid_refresh(''past'')','23514');
select pg_temp.probe('cannot_commit_unbounded_expiry','select pg_temp.invalid_refresh(''far_future'')','23514');
select pg_temp.probe('cannot_commit_missing_expiry','select pg_temp.invalid_refresh(''no_expiry'')','23514');
select pg_temp.probe('read_connected_token_returns_current_version','select pg_temp.ok((public.read_connected_oauth_token(tiktok,''tiktok'')).token_version=(select token_version from public.oauth_tokens where channel_id=tiktok)) from qa5');
select pg_temp.probe('read_token_rejects_wrong_platform','select pg_temp.ok((public.read_connected_oauth_token(tiktok,''facebook'')).id is null) from qa5');
set local role authenticated;
select pg_temp.probe('client_cannot_read_connected_token','select public.read_connected_oauth_token(tiktok,''tiktok'') from qa5','42501');
select pg_temp.probe('client_cannot_claim_refresh','select public.claim_oauth_token_refresh(tiktok,''tiktok'',gen_random_uuid()) from qa5','42501');
select pg_temp.probe('client_cannot_begin_refresh','select public.begin_oauth_token_refresh(tiktok,gen_random_uuid(),gen_random_uuid()) from qa5','42501');
select pg_temp.probe('client_cannot_commit_refresh','select public.complete_oauth_token_refresh(tiktok,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),''QA'',null,clock_timestamp()+interval ''1 hour'',null,''Bearer'') from qa5','42501');
select pg_temp.probe('client_cannot_fail_refresh','select public.fail_oauth_token_refresh(tiktok,gen_random_uuid(),gen_random_uuid(),''uncertain'') from qa5','42501');
select pg_temp.probe('client_cannot_invalidate_credentials','select public.invalidate_oauth_token_version(tiktok,gen_random_uuid(),''invalid_token'') from qa5','42501');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.probe('old_service_upsert_cannot_recreate_credentials','insert into public.oauth_tokens(channel_id,access_token_ciphertext) select tiktok,''QA_LATE'' from qa5 on conflict(channel_id) do update set access_token_ciphertext=excluded.access_token_ciphertext','42501');
select pg_temp.probe('old_service_update_cannot_overwrite_credentials','update public.oauth_tokens set access_token_ciphertext=''QA_LATE'' where channel_id=(select tiktok from qa5)','42501');
select pg_temp.probe('old_service_delete_cannot_bypass_lifecycle','delete from public.oauth_tokens where channel_id=(select tiktok from qa5)','42501');
select pg_temp.probe('old_service_status_write_cannot_expire_newer_auth','update public.channels set status=''expired'' where id=(select tiktok from qa5)','23514');
select pg_temp.probe('old_service_status_write_cannot_reconnect_channel','update public.channels set status=''disconnected'' where id=(select tiktok from qa5)','23514');
select pg_temp.probe('trusted_non_lifecycle_sync_timestamp_still_allowed','update public.channels set last_synced_at=clock_timestamp() where id=(select tiktok from qa5)');
reset role;

select jsonb_build_object('all_passed',bool_and(passed),'passed',count(*) filter(where passed),'failed',count(*) filter(where not passed),'total',count(*),'results',jsonb_agg(to_jsonb(r) order by name)) as result from qa5_results r;
rollback;
