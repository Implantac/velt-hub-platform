-- All analytics writes now require commit_analytics_observation and its receipt.
-- Retain the old SQL signature for history, but remove every REST execution path.
-- A superseded service caller must get permission_denied before executing it.
revoke all on function public.record_analytics_snapshot(uuid,uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
