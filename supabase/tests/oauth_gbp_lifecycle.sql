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

create function pg_temp.bind(_mode text default 'normal') returns boolean language plpgsql as $$
declare f record;ch public.channels;version uuid;channel_uuid uuid;actor uuid;reference text;before_events bigint;intent public.oauth_authorization_attempts;
begin select * into f from qa5;channel_uuid:=case when _mode in ('other_unit','same_unit') then f.bound else f.gbp end;
  select token_version into version from public.oauth_tokens where channel_id=channel_uuid;
  actor:=case _mode when 'editor' then f.editor_id when 'viewer' then f.viewer_id when 'foreign_actor' then f.other_id when 'admin' then f.admin_id else f.owner_id end;
  reference:=case _mode when 'other_account' then 'accounts/999/locations/200' when 'other_unit' then 'accounts/100/locations/999' when 'same_unit' then 'accounts/100/locations/300' else 'accounts/100/locations/200' end;
  if _mode='wrong_version' then version:=gen_random_uuid();end if;
  if _mode='disconnected' then perform public.disconnect_oauth_channel(channel_uuid);end if;
  if _mode='wrong_platform' then channel_uuid:=f.tiktok;select token_version into version from public.oauth_tokens where channel_id=channel_uuid;end if;
  if _mode='history' then insert into public.scheduler_jobs(workspace_id,channel_id,content_id,status,scheduled_at) values(f.ws,channel_uuid,f.content_id,'cancelled',clock_timestamp()+interval '30 days');end if;
  if _mode='analytics' then insert into public.analytics_snapshots(workspace_id,channel_id,content_id,metrics) values(f.ws,channel_uuid,f.content_id,'{"qa_synthetic":true}');end if;
  select count(*) into before_events from public.domain_events where workspace_id=f.ws and event_type='channel.business_location_bound';
  ch:=public.bind_google_business_location(f.ws,actor,channel_uuid,version,reference,'QA Unit','QA Synthetic Address');
  perform pg_temp.ok(ch.id=channel_uuid and ch.external_id=reference and ch.metadata->>'location_confirmed'='true' and ch.metadata->>'requires_location_selection'='false' and ch.metadata->>'account_id'='100' and ch.metadata->>'location_id'=split_part(reference,'/',4));
  if _mode='same_unit' then perform pg_temp.ok((select count(*)=before_events from public.domain_events where workspace_id=f.ws and event_type='channel.business_location_bound'));end if;
  if _mode in ('normal','admin') then
    perform pg_temp.ok((select count(*)=before_events+1 from public.domain_events where workspace_id=f.ws and event_type='channel.business_location_bound'));
    perform pg_temp.ok((select token_version=version from public.oauth_tokens where channel_id=channel_uuid));
    ch:=public.bind_google_business_location(f.ws,actor,channel_uuid,version,reference,'QA Unit','QA Synthetic Address');
    perform pg_temp.ok((select count(*)=before_events+1 from public.domain_events where workspace_id=f.ws and event_type='channel.business_location_bound'));
  end if;
  return true;end $$;
create function pg_temp.gbp_reconnect(_metadata_ok boolean default true) returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;ch public.channels;f record;
begin select * into f from qa5;a:=pg_temp.take(pg_temp.issue(f.owner_id,'google_business','google_business',f.brand,f.bound));
  ch:=pg_temp.finish(a,'accounts/100/locations/300','QA_GBP_NEW_CIPHERTEXT',case when _metadata_ok then '{"requires_location_selection":false,"location_confirmed":true,"account_id":"100","location_id":"300","location_name":"QA Existing"}'::jsonb else '{}'::jsonb end);
  perform pg_temp.ok(ch.id=f.bound and ch.external_id='accounts/100/locations/300' and ch.metadata->>'location_confirmed'='true');return true;end $$;
create function pg_temp.gbp_initial(_metadata_ok boolean default true) returns boolean language plpgsql as $$
declare a public.oauth_authorization_attempts;ch public.channels;f record;
begin select * into f from qa5;a:=pg_temp.take(pg_temp.issue(f.owner_id,'google_business','google_business',f.brand));
  ch:=pg_temp.finish(a,'accounts/200','QA_GBP_INITIAL_CIPHERTEXT',case when _metadata_ok then '{"requires_location_selection":true,"location_confirmed":false}'::jsonb else '{"requires_location_selection":false,"location_confirmed":true}'::jsonb end);
  perform pg_temp.ok(ch.external_id='accounts/200' and ch.metadata->>'location_confirmed'='false');return true;end $$;
create function pg_temp.gbp_enqueue(_bound boolean) returns boolean language plpgsql as $$
declare f record;ch public.channels;j public.scheduler_jobs;
begin select * into f from qa5;
  if _bound then ch:=public.bind_google_business_location(f.ws,f.owner_id,f.gbp,(select token_version from public.oauth_tokens where channel_id=f.gbp),'accounts/100/locations/200','QA Bound Before Schedule',null);end if;
  select * into j from public.enqueue_publication(f.content_id,array[f.gbp],clock_timestamp()+interval '30 days');
  perform pg_temp.ok(j.channel_id=f.gbp and j.workspace_id=f.ws and j.status='pending');return true;end $$;
create function pg_temp.gbp_duplicate() returns boolean language plpgsql as $$
declare f record;ch public.channels;
begin select * into f from qa5;ch:=public.bind_google_business_location(f.ws,f.owner_id,f.gbp,(select token_version from public.oauth_tokens where channel_id=f.gbp),'accounts/100/locations/300','QA Duplicate',null);return true;end $$;
select pg_temp.probe('owner_initial_unit_binding_is_allowed','select pg_temp.bind()');
select pg_temp.probe('admin_initial_unit_binding_is_allowed','select pg_temp.bind(''admin'')');
select pg_temp.probe('current_unit_confirmation_is_idempotent','select pg_temp.bind(''same_unit'')');
select pg_temp.probe('editor_cannot_bind_even_through_trusted_rpc','select pg_temp.bind(''editor'')','42501');
select pg_temp.probe('viewer_cannot_bind_even_through_trusted_rpc','select pg_temp.bind(''viewer'')','42501');
select pg_temp.probe('foreign_actor_cannot_bind','select pg_temp.bind(''foreign_actor'')','42501');
select pg_temp.probe('stale_discovery_version_cannot_bind','select pg_temp.bind(''wrong_version'')','40001');
select pg_temp.probe('disconnected_channel_cannot_bind','select pg_temp.bind(''disconnected'')','P0001');
select pg_temp.probe('wrong_platform_cannot_bind','select pg_temp.bind(''wrong_platform'')','P0001');
select pg_temp.probe('different_business_account_cannot_be_bound','select pg_temp.bind(''other_account'')','23514');
select pg_temp.probe('established_unit_cannot_be_retargeted','select pg_temp.bind(''other_unit'')','23514');
select pg_temp.probe('any_delivery_history_blocks_initial_identity_change','select pg_temp.bind(''history'')','23514');
select pg_temp.probe('any_analytics_history_blocks_initial_identity_change','select pg_temp.bind(''analytics'')','23514');
select pg_temp.probe('duplicate_established_unit_cannot_be_merged','select pg_temp.gbp_duplicate()','23505');
select pg_temp.probe('bound_unit_reconnect_preserves_channel_and_identity','select pg_temp.gbp_reconnect(true)');
select pg_temp.probe('bound_unit_reconnect_cannot_clear_verified_binding','select pg_temp.gbp_reconnect(false)','23514');
select pg_temp.probe('initial_gbp_oauth_keeps_selection_pending','select pg_temp.gbp_initial(true)');
select pg_temp.probe('initial_gbp_oauth_cannot_claim_unit_selection','select pg_temp.gbp_initial(false)','23514');
select pg_temp.probe('pending_gbp_selection_cannot_be_enqueued_via_rpc','select pg_temp.gbp_enqueue(false)','23514');
select pg_temp.probe('explicit_bound_gbp_can_enqueue_future_job','select pg_temp.gbp_enqueue(true)');
select pg_temp.probe('malformed_location_resource_rejected','select public.bind_google_business_location(ws,owner_id,gbp,(select token_version from public.oauth_tokens where channel_id=gbp),''https://example.invalid'',''QA'',null) from qa5','23514');
set local role authenticated;
select pg_temp.probe('client_cannot_call_privileged_binding_rpc','select public.bind_google_business_location(ws,owner_id,gbp,gen_random_uuid(),''accounts/100/locations/200'',''QA'',null) from qa5','42501');
select pg_temp.probe('client_cannot_change_external_id_directly','update public.channels set external_id=''accounts/100/locations/200'' where id=(select gbp from qa5)','23514');
select pg_temp.probe('client_cannot_forge_location_metadata','update public.channels set metadata=''{"location_confirmed":true}'' where id=(select gbp from qa5)','23514');
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.probe('legacy_service_identity_update_does_not_bypass_binding','update public.channels set external_id=''accounts/100/locations/200'' where id=(select gbp from qa5)','23514');
select pg_temp.probe('legacy_service_metadata_update_does_not_fake_binding','update public.channels set metadata=''{"location_confirmed":true}'' where id=(select gbp from qa5)','23514');
reset role;

select jsonb_build_object('all_passed',bool_and(passed),'passed',count(*) filter(where passed),'failed',count(*) filter(where not passed),'total',count(*),'results',jsonb_agg(to_jsonb(r) order by name)) as result from qa5_results r;
rollback;
