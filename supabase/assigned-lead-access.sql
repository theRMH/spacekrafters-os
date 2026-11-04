-- Whoever a lead is assigned to (Assign To / Assign Site Visit) must be able to see it and use Update Status,
-- whatever their role. Before this, leads were only readable/writable by owner, admin, the PC who owns the lead and
-- a few fixed roles, so a person assigned a site visit saw the task but not the lead's name, and Update Status did nothing.
-- These policies ADD to the existing ones (policies are OR-ed). Run once in the Supabase SQL editor.

DROP POLICY IF EXISTS "assigned person selects lead" ON sks_leads;
CREATE POLICY "assigned person selects lead" ON sks_leads
  FOR SELECT TO authenticated
  USING (
    owner_id = sks_my_id()
    OR data->>'assignedToId' = sks_my_id()
    OR EXISTS (SELECT 1 FROM sks_site_visits sv WHERE sv.lead_id = sks_leads.id AND sv.data->'teamMemberIds' ? sks_my_id())
  );

-- WITH CHECK is open on purpose: the assignee hands the lead on (back to the PC) when they finish their step, which
-- changes the assigned person on the new row. USING still limits which existing rows they can touch.
DROP POLICY IF EXISTS "assigned person updates lead" ON sks_leads;
CREATE POLICY "assigned person updates lead" ON sks_leads
  FOR UPDATE TO authenticated
  USING (
    owner_id = sks_my_id()
    OR data->>'assignedToId' = sks_my_id()
    OR EXISTS (SELECT 1 FROM sks_site_visits sv WHERE sv.lead_id = sks_leads.id AND sv.data->'teamMemberIds' ? sks_my_id())
  )
  WITH CHECK (true);
