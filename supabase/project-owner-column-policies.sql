-- Convert to Project failed for a project coordinator with:
--   new row violates row-level security policy for table "sks_projects"
-- Saving a project is an upsert (INSERT ... ON CONFLICT DO UPDATE), so the SELECT and UPDATE policies are also
-- checked against the new row. Both call sks_can_see_project(id), which for a project coordinator looks the
-- project up in sks_projects — and the row being inserted is not visible to that lookup, so the check fails.
-- Checking the row's own owner_id column directly needs no lookup. Run in the Supabase SQL Editor.

DROP POLICY IF EXISTS "authenticated select visible projects" ON sks_projects;
CREATE POLICY "authenticated select visible projects" ON sks_projects
  FOR SELECT TO authenticated
  USING (sks_can_see_project(id) OR owner_id = sks_my_id());

DROP POLICY IF EXISTS "authenticated update visible projects" ON sks_projects;
CREATE POLICY "authenticated update visible projects" ON sks_projects
  FOR UPDATE TO authenticated
  USING (sks_can_see_project(id) OR owner_id = sks_my_id())
  WITH CHECK (sks_can_see_project(id) OR owner_id = sks_my_id());

-- A project handed to someone by the workflow (assigned architect / QS / site engineer / purchase / PC) was invisible
-- to them unless they were the owner or had a task on it, so it never reached their My Tasks and they could not save
-- their step. Anyone the project is currently assigned to, or who is the architect / QS on its design or shop-drawing
-- work, can now see (and update) it.
CREATE OR REPLACE FUNCTION sks_can_see_project(p_project_id TEXT) RETURNS BOOLEAN AS $$
  SELECT
    CASE
      WHEN sks_has_role('owner') THEN true
      WHEN sks_has_role('admin') THEN true
      WHEN sks_has_role('accounts') THEN true
      WHEN sks_has_role('qs') THEN true
      ELSE false
    END
    OR EXISTS (
      SELECT 1 FROM sks_projects p
      WHERE p.id = p_project_id AND (
        p.owner_id = sks_my_id()
        OR p.data->>'assignedToId' = sks_my_id()
        OR p.data->'designWork'->>'architectId' = sks_my_id()
        OR p.data->'shopDrawingWork'->>'architectId' = sks_my_id()
      )
    )
    OR EXISTS (
      SELECT 1 FROM sks_tasks t WHERE t.project_id = p_project_id AND t.assignee_id = sks_my_id()
    )
    OR (sks_has_role('purchase') AND EXISTS (
      SELECT 1 FROM sks_purchase_orders po WHERE po.project_id = p_project_id
    ))
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
