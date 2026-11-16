-- Confirmed observations, not a best-effort SELECT/INSERT pair. Legacy rows are
-- retained unchanged; the nullable day marks the new atomic collection protocol.
-- No provider call, token grant, real owner/workspace or historic metric rewrite.
alter table public.analytics_snapshots add column collection_day date;
alter table public.analytics_snapshots add constraint analytics_collection_day_integrity check (
  collection_day is null or (channel_id is not null and content_id is not null and
    collection_day=(captured_at at time zone 'UTC')::date and (metrics->>'source') is not distinct from 'sync' and
    jsonb_typeof(metrics->'post_id') is not distinct from 'string' and nullif(btrim(metrics->>'post_id'),'') is not null and octet_length(metrics->>'post_id')<=2048)
);
create unique index analytics_atomic_daily_observation
  on public.analytics_snapshots(workspace_id,channel_id,collection_day,(metrics->>'post_id'))
  where collection_day is not null;

-- Client RLS already denied snapshot INSERT. Also close direct trusted REST
-- writes: a stale service worker must use the versioned transaction below.
revoke all on public.analytics_snapshots from public,anon,authenticated,service_role;
grant select on public.analytics_snapshots to authenticated,service_role;
create or replace function public.record_analytics_snapshot(_workspace_id uuid,_channel_id uuid,_content_id uuid,_metrics jsonb)
returns public.analytics_snapshots language plpgsql security definer set search_path=public as $$
begin
  raise exception using errcode='40001',message='Use the versioned analytics observation transaction';
end $$;
revoke all on function public.record_analytics_snapshot(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_analytics_snapshot(uuid,uuid,uuid,jsonb) to service_role;

-- A connection label may be edited manually; a claimed collection date may not.
create or replace function public.guard_channel_collection_stamp()
returns trigger language plpgsql set search_path=public as $$
begin
  if current_user not in ('postgres','supabase_admin') and (
    (tg_op='INSERT' and new.last_synced_at is not null) or
    (tg_op='UPDATE' and new.last_synced_at is distinct from old.last_synced_at)
  ) then
    raise exception using errcode='23514',message='Collection dates require a confirmed server observation';
  end if;
  return new;
end $$;
revoke all on function public.guard_channel_collection_stamp() from public,anon,authenticated,service_role;
create trigger guard_channel_collection_stamp before insert or update on public.channels
  for each row execute function public.guard_channel_collection_stamp();

-- Same conservative, daily cumulative semantics as mergeCumulative in the app:
-- max per counter, never sum repeated reads; derive the ratio after the merge.
-- No arbitrary provider fields, secrets or error bodies are carried into metrics.
create or replace function public.merge_analytics_observation_metrics(_previous jsonb,_next jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare key text; prior numeric; incoming numeric; merged jsonb:='{}'; rate numeric;
begin
  if jsonb_typeof(coalesce(_previous,'{}'::jsonb)) is distinct from 'object' or jsonb_typeof(_next) is distinct from 'object' then
    raise exception using errcode='23514',message='Observation counters must be an object';
  end if;
  foreach key in array array['impressions','reach','engagement','likes','comments','shares','saves','clicks','video_views','followers'] loop
    if jsonb_typeof(_next->key) is distinct from 'number' then
      raise exception using errcode='23514',message='Observation counters must be safe nonnegative integers';
    end if;
    incoming:=(_next->>key)::numeric;
    if incoming<0 or incoming>9007199254740991 or incoming<>trunc(incoming) then
      raise exception using errcode='23514',message='Observation counters must be safe nonnegative integers';
    end if;
    prior:=0;
    if coalesce(_previous,'{}'::jsonb) ? key then
      if jsonb_typeof(_previous->key) is distinct from 'number' then
        raise exception using errcode='23514',message='The stored observation contains an invalid counter';
      end if;
      prior:=(_previous->>key)::numeric;
      if prior<0 or prior>9007199254740991 or prior<>trunc(prior) then
        raise exception using errcode='23514',message='The stored observation contains an invalid counter';
      end if;
    end if;
    merged:=merged||jsonb_build_object(key,greatest(prior,incoming));
  end loop;
  rate:=case when coalesce(nullif((merged->>'impressions')::numeric,0),(merged->>'reach')::numeric,0)>0
    then round((merged->>'engagement')::numeric/coalesce(nullif((merged->>'impressions')::numeric,0),(merged->>'reach')::numeric)*10000)/10000
    else 0 end;
  return merged||jsonb_build_object('engagement_rate',rate);
end $$;
revoke all on function public.merge_analytics_observation_metrics(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.commit_analytics_observation(
  _channel_id uuid,_expected_version uuid,_job_id uuid,_external_post_id text,_metrics jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare channel public.channels; job public.scheduler_jobs; stamp timestamptz; observed public.analytics_snapshots; payload jsonb;
begin
  if _channel_id is null or _expected_version is null or _job_id is null or
    nullif(btrim(_external_post_id),'') is null or _external_post_id<>btrim(_external_post_id) or octet_length(_external_post_id)>2048 or starts_with(_external_post_id,'sim_') then
    raise exception using errcode='23514',message='A confirmed publication identity is required for collection';
  end if;
  if jsonb_typeof(_metrics) is distinct from 'object' then
    raise exception using errcode='23514',message='Only validated canonical observation counters are accepted';
  end if;
  if exists(select 1 from jsonb_object_keys(_metrics) k where k not in ('impressions','reach','engagement','likes','comments','shares','saves','clicks','video_views','followers','engagement_rate')) or
    jsonb_typeof(_metrics->'engagement_rate') is distinct from 'number' or
    (_metrics->>'engagement_rate')::numeric<0 or (_metrics->>'engagement_rate')::numeric>9007199254740991 then
    raise exception using errcode='23514',message='Only validated canonical observation counters are accepted';
  end if;
  payload:=public.merge_analytics_observation_metrics('{}',_metrics);

  -- Pin the parent rows before any child mutation. Content -> channel agrees
  -- with scheduling; channel -> token agrees with OAuth refresh/disconnect.
  -- Re-read and lock the publication after the authorization has been locked.
  select * into job from public.scheduler_jobs where id=_job_id and channel_id=_channel_id
    and status='succeeded' and external_post_id=_external_post_id;
  if job.id is null then return jsonb_build_object('accepted',false,'reason','publication_changed'); end if;
  perform 1 from public.workspaces where id=job.workspace_id for key share;
  if not found then return jsonb_build_object('accepted',false,'reason','publication_changed'); end if;
  perform 1 from public.content where id=job.content_id and workspace_id=job.workspace_id for key share;
  if not found then return jsonb_build_object('accepted',false,'reason','publication_changed'); end if;
  select * into channel from public.channels where id=_channel_id and workspace_id=job.workspace_id and status='connected' for update;
  if channel.id is null then return jsonb_build_object('accepted',false,'reason','authorization_changed'); end if;
  perform 1 from public.oauth_tokens where channel_id=_channel_id and token_version=_expected_version and not refresh_uncertain for share;
  if not found then return jsonb_build_object('accepted',false,'reason','authorization_changed'); end if;
  select j.* into job from public.scheduler_jobs j where j.id=_job_id and j.channel_id=channel.id and j.workspace_id=channel.workspace_id
    and j.content_id=job.content_id and j.status='succeeded' and j.external_post_id=_external_post_id for share;
  if job.id is null then return jsonb_build_object('accepted',false,'reason','publication_changed'); end if;

  stamp:=clock_timestamp();
  payload:=payload||jsonb_build_object('source','sync','post_id',job.external_post_id,'job_id',job.id,'collected_at',stamp);
  insert into public.analytics_snapshots(workspace_id,channel_id,content_id,captured_at,collection_day,metrics)
    values(channel.workspace_id,channel.id,job.content_id,stamp,(stamp at time zone 'UTC')::date,payload)
    on conflict(workspace_id,channel_id,collection_day,(metrics->>'post_id')) where collection_day is not null
    do update set
      metrics=public.merge_analytics_observation_metrics(analytics_snapshots.metrics,excluded.metrics)||
        jsonb_build_object('source','sync','post_id',job.external_post_id,'job_id',job.id,
          'collected_at',greatest(analytics_snapshots.captured_at,excluded.captured_at)),
      captured_at=greatest(analytics_snapshots.captured_at,excluded.captured_at)
    where analytics_snapshots.content_id=excluded.content_id
    returning * into observed;
  if observed.id is null then return jsonb_build_object('accepted',false,'reason','publication_changed'); end if;
  -- This update and the observation either both commit or both roll back.
  update public.channels set last_synced_at=observed.captured_at where id=channel.id;
  return jsonb_build_object('accepted',true,'snapshot_id',observed.id,'captured_at',observed.captured_at);
end $$;
revoke all on function public.commit_analytics_observation(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_analytics_observation(uuid,uuid,uuid,text,jsonb) to service_role;
