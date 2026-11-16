-- VELT only. Synthetic fixtures, no network/provider call. Everything rolls back.
-- Local PGlite is a focused schema/Auth harness, not real Auth or distributed concurrency.
-- Remote administrative execution tests SQL/RLS; HTTP/process evidence is separate.
begin;
set local statement_timeout='60s';
create temporary table qa6 as select gen_random_uuid() owner_id,gen_random_uuid() admin_id,gen_random_uuid() editor_id,gen_random_uuid() viewer_id,gen_random_uuid() other_id,
  gen_random_uuid() ws,gen_random_uuid() foreign_ws,gen_random_uuid() channel_id,gen_random_uuid() second_channel,gen_random_uuid() foreign_channel,gen_random_uuid() manual_channel,
  gen_random_uuid() content_id,gen_random_uuid() other_content,gen_random_uuid() foreign_content,gen_random_uuid() job_id,gen_random_uuid() second_job,gen_random_uuid() cross_job,
  gen_random_uuid() collision_job,gen_random_uuid() foreign_job,gen_random_uuid() pending_job,gen_random_uuid() unconfirmed_job,gen_random_uuid() legacy_id,
  gen_random_uuid() version,gen_random_uuid() second_version,gen_random_uuid() foreign_version;
create temporary table qa6_results(name text,passed boolean,expected text,actual text,affected bigint,detail text);
grant select on qa6 to anon,authenticated,service_role;
grant select,insert on qa6_results to anon,authenticated,service_role;
insert into auth.users(id,email,raw_user_meta_data) select u,'qa-r6-sql-'||u||'@example.invalid','{}' from qa6 cross join lateral unnest(array[owner_id,admin_id,editor_id,viewer_id,other_id]) u;
insert into public.workspaces(id,owner_id,slug,name) select ws,owner_id,'qa-r6-'||ws,'QA R6 transaction A' from qa6 union all select foreign_ws,other_id,'qa-r6-'||foreign_ws,'QA R6 transaction B' from qa6;
insert into public.workspace_members(workspace_id,user_id,role) select ws,admin_id,'admin'::public.app_role from qa6 union all select ws,editor_id,'editor' from qa6 union all select ws,viewer_id,'viewer' from qa6;
insert into public.channels(id,workspace_id,platform,status,external_id,last_synced_at)
  select channel_id,ws,'facebook'::public.social_platform,'connected'::public.channel_status,'QA_R6_ACCOUNT_A',clock_timestamp()-interval '2 days' from qa6 union all
  select second_channel,ws,'facebook','connected','QA_R6_ACCOUNT_A2',null from qa6 union all
  select foreign_channel,foreign_ws,'facebook','connected','QA_R6_ACCOUNT_B',null from qa6 union all
  select manual_channel,ws,'youtube','disconnected',null,null from qa6;
insert into public.oauth_tokens(channel_id,access_token_ciphertext,token_version,expires_at)
  select channel_id,'QA_R6_SYNTHETIC_CIPHERTEXT_NEVER_SENT',version,clock_timestamp()+interval '1 hour' from qa6 union all
  select second_channel,'QA_R6_SYNTHETIC_CIPHERTEXT_NEVER_SENT',second_version,clock_timestamp()+interval '1 hour' from qa6 union all
  select foreign_channel,'QA_R6_SYNTHETIC_CIPHERTEXT_NEVER_SENT',foreign_version,clock_timestamp()+interval '1 hour' from qa6;
insert into public.content(id,workspace_id,title,status) select content_id,ws,'QA R6 reused content','published'::public.content_status from qa6 union all select other_content,ws,'QA R6 other content','draft' from qa6 union all select foreign_content,foreign_ws,'QA R6 foreign content','published' from qa6;
insert into public.scheduler_jobs(id,workspace_id,channel_id,content_id,status,external_post_id,scheduled_at)
  select job_id,ws,channel_id,content_id,'succeeded'::public.job_status,'QA_R6_POST_1',clock_timestamp()-interval '1 hour' from qa6 union all
  select second_job,ws,channel_id,content_id,'succeeded','QA_R6_POST_2',clock_timestamp()-interval '1 hour' from qa6 union all
  select cross_job,ws,second_channel,content_id,'succeeded','QA_R6_POST_1',clock_timestamp()-interval '1 hour' from qa6 union all
  select collision_job,ws,channel_id,other_content,'succeeded','QA_R6_POST_1',clock_timestamp()-interval '1 hour' from qa6 union all
  select foreign_job,foreign_ws,foreign_channel,foreign_content,'succeeded','QA_R6_FOREIGN_POST',clock_timestamp()-interval '1 hour' from qa6 union all
  select pending_job,ws,channel_id,other_content,'pending','QA_R6_PENDING',clock_timestamp()-interval '1 hour' from qa6 union all
  select unconfirmed_job,ws,channel_id,other_content,'dead_letter','QA_R6_UNCONFIRMED',clock_timestamp()-interval '1 hour' from qa6;
insert into public.analytics_snapshots(id,workspace_id,channel_id,content_id,captured_at,metrics)
  select legacy_id,ws,channel_id,content_id,clock_timestamp()-interval '2 days','{"impressions":17,"post_id":"QA_R6_POST_1","source":"legacy-kept"}' from qa6;
create function pg_temp.ok(_value boolean) returns boolean language plpgsql as $$begin if _value is distinct from true then raise exception 'assertion failed';end if;return true;end $$;
create function pg_temp.probe(_name text,_sql text,_expected text default '00000',_rows bigint default 1) returns void language plpgsql as $$
declare n bigint:=0;code text:='00000';msg text:='probe rolled back';
begin
  begin execute _sql;get diagnostics n=row_count;raise exception using errcode='ZQ006',message='rollback probe';
  exception when sqlstate 'ZQ006' then null;when others then code:=sqlstate;msg:=sqlerrm;n:=0;end;
  insert into qa6_results values(_name,code=_expected and (code<>'00000' or _rows is null or n=_rows),_expected,code,n,msg);
end $$;
create function pg_temp.metrics(_impressions numeric default 100,_engagement numeric default 10) returns jsonb language sql as $$
  select jsonb_build_object('impressions',_impressions,'reach',0,'engagement',_engagement,'likes',_engagement,'comments',0,'shares',0,'saves',0,'clicks',0,'video_views',0,'followers',0,'engagement_rate',0);
$$;
create function pg_temp.observe(_job uuid default null,_channel uuid default null,_version uuid default null,_post text default 'QA_R6_POST_1',_metrics jsonb default pg_temp.metrics()) returns jsonb language sql as $$
  select public.commit_analytics_observation(coalesce(_channel,channel_id),coalesce(_version,version),coalesce(_job,job_id),_post,_metrics) from qa6;
$$;
create function pg_temp.check_commit(_mode text default 'insert') returns boolean language plpgsql as $$
declare f record;a jsonb;b jsonb;s public.analytics_snapshots;old_stamp timestamptz;old_legacy jsonb;
begin
  if _mode='timezone' then perform set_config('TimeZone','Pacific/Auckland',true);end if;
  select * into f from qa6;select last_synced_at into old_stamp from public.channels where id=f.channel_id;
  select to_jsonb(x) into old_legacy from public.analytics_snapshots x where id=f.legacy_id;
  a:=pg_temp.observe();perform pg_temp.ok(a->>'accepted'='true' and (a->>'snapshot_id')::uuid is not null and (a->>'captured_at')::timestamptz is not null);
  select * into s from public.analytics_snapshots where id=(a->>'snapshot_id')::uuid;
  perform pg_temp.ok(s.workspace_id=f.ws and s.channel_id=f.channel_id and s.content_id=f.content_id and s.collection_day=(s.captured_at at time zone 'UTC')::date);
  perform pg_temp.ok(s.metrics->>'post_id'='QA_R6_POST_1' and s.metrics->>'job_id'=f.job_id::text and s.metrics->>'source'='sync' and (s.metrics->>'collected_at')::timestamptz=s.captured_at);
  perform pg_temp.ok(s.captured_at>old_stamp and s.captured_at=(a->>'captured_at')::timestamptz and (select last_synced_at=s.captured_at from public.channels where id=f.channel_id));
  perform pg_temp.ok(s.metrics->>'impressions'='100' and (s.metrics->>'engagement_rate')::numeric=0.1 and (select count(*)=15 from jsonb_object_keys(s.metrics)));
  if _mode='repeat' then
    b:=pg_temp.observe(_metrics=>pg_temp.metrics(200,5));perform pg_temp.ok(a->>'snapshot_id'=b->>'snapshot_id');
    b:=pg_temp.observe(_metrics=>pg_temp.metrics(150,20));
    select * into s from public.analytics_snapshots where id=(b->>'snapshot_id')::uuid;
    perform pg_temp.ok(s.metrics->>'impressions'='200' and s.metrics->>'engagement'='20' and (s.metrics->>'engagement_rate')::numeric=0.1);
    perform pg_temp.ok(s.captured_at>=(a->>'captured_at')::timestamptz and (s.metrics->>'collected_at')::timestamptz=s.captured_at and (select last_synced_at=s.captured_at from public.channels where id=f.channel_id));
    perform pg_temp.ok((select count(*)=1 from public.analytics_snapshots where channel_id=f.channel_id and collection_day is not null));
  elsif _mode='reused_content' then
    b:=pg_temp.observe(_job=>f.second_job,_post=>'QA_R6_POST_2');perform pg_temp.ok(b->>'accepted'='true' and b->>'snapshot_id'<>a->>'snapshot_id');
    perform pg_temp.ok((select count(*)=2 from public.analytics_snapshots where content_id=f.content_id and channel_id=f.channel_id and collection_day is not null));
  elsif _mode='different_channel' then
    b:=pg_temp.observe(f.cross_job,f.second_channel,f.second_version);perform pg_temp.ok(b->>'accepted'='true' and b->>'snapshot_id'<>a->>'snapshot_id');
  elsif _mode='collision' then
    b:=pg_temp.observe(_job=>f.collision_job);perform pg_temp.ok(b->>'accepted'='false' and b->>'reason'='publication_changed');
    perform pg_temp.ok((select count(*)=1 from public.analytics_snapshots where channel_id=f.channel_id and collection_day is not null));
  end if;
  perform pg_temp.ok((select to_jsonb(x)=old_legacy from public.analytics_snapshots x where id=f.legacy_id));
  return true;
end $$;
create function pg_temp.check_rejected(_mode text) returns boolean language plpgsql as $$
declare f record;r jsonb;old_stamp timestamptz;
begin select * into f from qa6;select last_synced_at into old_stamp from public.channels where id=f.channel_id;
  if _mode='changed_version' then update public.oauth_tokens set token_version=gen_random_uuid() where channel_id=f.channel_id;
  elsif _mode='uncertain' then update public.oauth_tokens set refresh_uncertain=true where channel_id=f.channel_id;
  elsif _mode='missing_token' then delete from public.oauth_tokens where channel_id=f.channel_id;
  elsif _mode='disconnected' then perform public.disconnect_oauth_channel(f.channel_id);
  elsif _mode='expired' then update public.channels set status='expired' where id=f.channel_id;
  end if;
  if _mode='foreign_job' then r:=pg_temp.observe(_job=>f.foreign_job,_post=>'QA_R6_FOREIGN_POST');
  elsif _mode='pending_job' then r:=pg_temp.observe(_job=>f.pending_job,_post=>'QA_R6_PENDING');
  elsif _mode='unconfirmed_job' then r:=pg_temp.observe(_job=>f.unconfirmed_job,_post=>'QA_R6_UNCONFIRMED');
  elsif _mode='wrong_post' then r:=pg_temp.observe(_post=>'QA_R6_WRONG');
  elsif _mode='missing_job' then r:=pg_temp.observe(_job=>gen_random_uuid());
  else r:=pg_temp.observe();end if;
  perform pg_temp.ok(r->>'accepted'='false' and r->>'reason'=case when _mode in ('foreign_job','pending_job','unconfirmed_job','wrong_post','missing_job') then 'publication_changed' else 'authorization_changed' end);
  perform pg_temp.ok(not exists(select 1 from public.analytics_snapshots where channel_id=f.channel_id and collection_day is not null));
  perform pg_temp.ok((select last_synced_at is not distinct from old_stamp from public.channels where id=f.channel_id));return true;
end $$;
create function pg_temp.reject_write() returns trigger language plpgsql as $$begin raise exception 'QA R6 deliberately injected write failure';end $$;
create function pg_temp.check_atomic_rollback(_target text) returns boolean language plpgsql as $$
declare f record;old_stamp timestamptz;caught boolean:=false;
begin select * into f from qa6;select last_synced_at into old_stamp from public.channels where id=f.channel_id;
  if _target='stamp' then create trigger qa6_fault before update of last_synced_at on public.channels for each row execute function pg_temp.reject_write();
  else create trigger qa6_fault before insert on public.analytics_snapshots for each row execute function pg_temp.reject_write();end if;
  begin perform pg_temp.observe();exception when raise_exception then caught:=true;end;
  perform pg_temp.ok(caught and not exists(select 1 from public.analytics_snapshots where channel_id=f.channel_id and collection_day is not null));
  perform pg_temp.ok((select last_synced_at is not distinct from old_stamp from public.channels where id=f.channel_id));return true;
end $$;
create function pg_temp.check_previous_day() returns boolean language plpgsql as $$
declare f record;r jsonb;
begin select * into f from qa6;
  insert into public.analytics_snapshots(workspace_id,channel_id,content_id,captured_at,collection_day,metrics)
    values(f.ws,f.channel_id,f.content_id,clock_timestamp()-interval '1 day',((clock_timestamp()-interval '1 day') at time zone 'UTC')::date,pg_temp.metrics(500,50)||'{"source":"sync","post_id":"QA_R6_POST_1"}'::jsonb);
  r:=pg_temp.observe(_metrics=>pg_temp.metrics(100,10));perform pg_temp.ok(r->>'accepted'='true');
  perform pg_temp.ok((select count(*)=2 from public.analytics_snapshots where channel_id=f.channel_id and collection_day is not null));
  perform pg_temp.ok((select metrics->>'impressions'='100' from public.analytics_snapshots where id=(r->>'snapshot_id')::uuid));return true;
end $$;
create function pg_temp.check_corruption_rollback() returns boolean language plpgsql as $$
declare f record;r jsonb;old_stamp timestamptz;caught boolean:=false;
begin select * into f from qa6;r:=pg_temp.observe();update public.analytics_snapshots set metrics=jsonb_set(metrics,'{impressions}','-1') where id=(r->>'snapshot_id')::uuid;
  select last_synced_at into old_stamp from public.channels where id=f.channel_id;
  begin perform pg_temp.observe();exception when check_violation then caught:=true;end;
  perform pg_temp.ok(caught and (select metrics->>'impressions'='-1' from public.analytics_snapshots where id=(r->>'snapshot_id')::uuid));
  perform pg_temp.ok((select last_synced_at=old_stamp from public.channels where id=f.channel_id));return true;
end $$;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.probe('service_rpc_commits_snapshot_and_stamp','select pg_temp.check_commit()');
select pg_temp.probe('service_rpc_merges_same_day_without_sum','select pg_temp.check_commit(''repeat'')');
select pg_temp.probe('service_rpc_keeps_reused_content_posts_separate','select pg_temp.check_commit(''reused_content'')');
select pg_temp.probe('service_rpc_keeps_channels_separate','select pg_temp.check_commit(''different_channel'')');
select pg_temp.probe('service_rpc_rejects_content_identity_collision','select pg_temp.check_commit(''collision'')');
select pg_temp.probe('service_rpc_day_is_UTC_not_session_timezone','select pg_temp.check_commit(''timezone'')');
select pg_temp.probe('service_direct_snapshot_insert_denied','insert into public.analytics_snapshots(workspace_id,channel_id,content_id) select ws,channel_id,content_id from qa6','42501');
select pg_temp.probe('service_direct_snapshot_update_denied','update public.analytics_snapshots set metrics=''{}''','42501');
select pg_temp.probe('service_direct_snapshot_delete_denied','delete from public.analytics_snapshots','42501');
select pg_temp.probe('service_direct_snapshot_truncate_denied','truncate public.analytics_snapshots','42501');
select pg_temp.probe('service_direct_stamp_update_denied','update public.channels set last_synced_at=clock_timestamp() where id=(select channel_id from qa6)','23514');
select pg_temp.probe('service_stamp_insert_denied','insert into public.channels(workspace_id,platform,last_synced_at) select ws,''linkedin'',clock_timestamp() from qa6','23514');
select pg_temp.probe('service_legacy_recorder_fails_closed','select public.record_analytics_snapshot(ws,channel_id,content_id,pg_temp.metrics()) from qa6','42501');
select pg_temp.probe('service_cannot_call_merge_helper','select public.merge_analytics_observation_metrics(''{}'',pg_temp.metrics())','42501');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from qa6),'role','authenticated')::text,true);
select pg_temp.probe('previous_days_are_preserved_and_new_day_can_decrease','select pg_temp.check_previous_day()');
select pg_temp.probe('snapshot_failure_cannot_advance_stamp','select pg_temp.check_atomic_rollback(''snapshot'')');
select pg_temp.probe('stamp_failure_rolls_back_snapshot','select pg_temp.check_atomic_rollback(''stamp'')');
select pg_temp.probe('invalid_stored_counter_rolls_back_merge_and_stamp','select pg_temp.check_corruption_rollback()');
do $$declare mode text;begin
  foreach mode in array array['changed_version','uncertain','missing_token','disconnected','expired','foreign_job','pending_job','unconfirmed_job','wrong_post','missing_job'] loop
    perform pg_temp.probe('late_or_invalid_'||mode,format('select pg_temp.check_rejected(%L)',mode));
  end loop;
end $$;
do $$declare payload jsonb;counter_name text;bad jsonb;begin
  foreach counter_name in array array['impressions','reach','engagement','likes','comments','shares','saves','clicks','video_views','followers'] loop
    perform pg_temp.probe('missing_counter_'||counter_name,format('select pg_temp.observe(_metrics=>%L::jsonb)',(pg_temp.metrics()-counter_name)::text),'23514');
  end loop;
  for bad in select value from jsonb_array_elements('[-1,1.5,9007199254740992,"12",true,null]'::jsonb) loop
    payload:=jsonb_set(pg_temp.metrics(),'{impressions}',bad);
    perform pg_temp.probe('invalid_counter_'||bad::text,format('select pg_temp.observe(_metrics=>%L::jsonb)',payload::text),'23514');
  end loop;
  for bad in select value from jsonb_array_elements('[null,[],1,"text"]'::jsonb) loop
    perform pg_temp.probe('nonobject_metrics_'||bad::text,format('select pg_temp.observe(_metrics=>%L::jsonb)',bad::text),'23514');
  end loop;
  for bad in select value from jsonb_array_elements('[-1,9007199254740992,"0.1",null]'::jsonb) loop
    perform pg_temp.probe('invalid_rate_'||bad::text,format('select pg_temp.observe(_metrics=>%L::jsonb)',jsonb_set(pg_temp.metrics(),'{engagement_rate}',bad)::text),'23514');
  end loop;
end $$;
select pg_temp.probe('extra_payload_fields_denied','select pg_temp.observe(_metrics=>pg_temp.metrics()||''{"access_token":"QA_NEVER_SENT"}''::jsonb)','23514');
select pg_temp.probe('sql_null_payload_denied','select pg_temp.observe(_metrics=>null)','23514');
select pg_temp.probe('missing_rate_denied','select pg_temp.observe(_metrics=>pg_temp.metrics()-''engagement_rate'')','23514');
select pg_temp.probe('empty_post_denied','select pg_temp.observe(_post=>'''')','23514');
select pg_temp.probe('post_whitespace_denied','select pg_temp.observe(_post=>'' QA_R6_POST_1'')','23514');
select pg_temp.probe('simulated_post_denied','select pg_temp.observe(_post=>''sim_QA_R6'')','23514');
select pg_temp.probe('oversized_post_denied_by_bytes','select pg_temp.observe(_post=>repeat(''é'',1025))','23514');
select pg_temp.probe('null_version_denied','select public.commit_analytics_observation(channel_id,null,job_id,''QA_R6_POST_1'',pg_temp.metrics()) from qa6','23514');
select pg_temp.probe('null_channel_denied','select public.commit_analytics_observation(null,version,job_id,''QA_R6_POST_1'',pg_temp.metrics()) from qa6','23514');
select pg_temp.probe('null_job_denied','select public.commit_analytics_observation(channel_id,version,null,''QA_R6_POST_1'',pg_temp.metrics()) from qa6','23514');
select pg_temp.probe('mismatched_workspace_snapshot_fk_still_denied','insert into public.analytics_snapshots(workspace_id,channel_id,content_id) select foreign_ws,channel_id,foreign_content from qa6','23503');
select pg_temp.probe('new_day_requires_valid_source','insert into public.analytics_snapshots(workspace_id,channel_id,content_id,collection_day,metrics) select ws,channel_id,content_id,(clock_timestamp() at time zone ''UTC'')::date,''{"post_id":"QA_R6_POST_1"}'' from qa6','23514');
select pg_temp.probe('new_day_requires_real_post_identity','insert into public.analytics_snapshots(workspace_id,channel_id,content_id,collection_day,metrics) select ws,channel_id,content_id,(clock_timestamp() at time zone ''UTC'')::date,''{"source":"sync"}'' from qa6','23514');
select pg_temp.probe('new_day_must_match_UTC_capture','insert into public.analytics_snapshots(workspace_id,channel_id,content_id,collection_day,metrics) select ws,channel_id,content_id,(clock_timestamp() at time zone ''UTC'')::date-1,''{"source":"sync","post_id":"QA_R6_POST_1"}'' from qa6','23514');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select owner_id from qa6),'role','authenticated')::text,true);
select pg_temp.probe('owner_cannot_forge_collection_stamp','update public.channels set last_synced_at=clock_timestamp()+interval ''30 days'' where id=(select channel_id from qa6)','23514');
select pg_temp.probe('owner_cannot_clear_collection_stamp','update public.channels set last_synced_at=null where id=(select channel_id from qa6)','23514');
select pg_temp.probe('owner_cannot_insert_collection_stamp','insert into public.channels(workspace_id,platform,last_synced_at) select ws,''linkedin'',clock_timestamp() from qa6','23514');
select pg_temp.probe('owner_can_still_edit_channel_label','update public.channels set handle=''QA R6 safe label'' where id=(select channel_id from qa6)');
select pg_temp.probe('owner_can_keep_existing_stamp_in_noop_update','update public.channels set last_synced_at=last_synced_at where id=(select channel_id from qa6)');
select pg_temp.probe('owner_can_register_unconnected_channel','insert into public.channels(workspace_id,platform,handle) select ws,''linkedin'',''QA R6 manual only'' from qa6');
select pg_temp.probe('owner_can_read_own_legacy_snapshot','select id from public.analytics_snapshots where workspace_id=(select ws from qa6)');
select pg_temp.probe('client_cannot_call_commit','select pg_temp.observe()','42501');
select pg_temp.probe('client_cannot_call_legacy_recorder','select public.record_analytics_snapshot(ws,channel_id,content_id,pg_temp.metrics()) from qa6','42501');
select pg_temp.probe('client_cannot_call_merge_helper','select public.merge_analytics_observation_metrics(''{}'',pg_temp.metrics())','42501');
select pg_temp.probe('client_cannot_insert_snapshots','insert into public.analytics_snapshots(workspace_id,channel_id,content_id) select ws,channel_id,content_id from qa6','42501');
select pg_temp.probe('client_cannot_update_snapshots','update public.analytics_snapshots set metrics=''{}''','42501');
select pg_temp.probe('client_cannot_delete_snapshots','delete from public.analytics_snapshots','42501');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select admin_id from qa6),'role','authenticated')::text,true);
select pg_temp.probe('admin_cannot_forge_collection_stamp','update public.channels set last_synced_at=clock_timestamp() where id=(select channel_id from qa6)','23514');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select editor_id from qa6),'role','authenticated')::text,true);
select pg_temp.probe('editor_cannot_edit_channel_stamp','update public.channels set last_synced_at=clock_timestamp() where id=(select channel_id from qa6)','00000',0);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select viewer_id from qa6),'role','authenticated')::text,true);
select pg_temp.probe('viewer_can_read_own_metrics','select id from public.analytics_snapshots where workspace_id=(select ws from qa6)');
select pg_temp.probe('viewer_cannot_edit_channel_stamp','update public.channels set last_synced_at=clock_timestamp() where id=(select channel_id from qa6)','00000',0);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select other_id from qa6),'role','authenticated')::text,true);
select pg_temp.probe('other_workspace_cannot_read_metrics','select id from public.analytics_snapshots where workspace_id=(select ws from qa6)','00000',0);
select pg_temp.probe('other_workspace_cannot_edit_stamp','update public.channels set last_synced_at=clock_timestamp() where id=(select channel_id from qa6)','00000',0);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.probe('anon_cannot_call_commit','select pg_temp.observe()','42501');
select pg_temp.probe('anon_cannot_read_snapshots','select id from public.analytics_snapshots','42501');
reset role;
select jsonb_build_object('all_passed',bool_and(passed),'passed',count(*) filter(where passed),'failed',count(*) filter(where not passed),'total',count(*),'results',jsonb_agg(to_jsonb(r) order by name)) result from qa6_results r;
rollback;
