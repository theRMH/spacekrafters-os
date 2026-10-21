-- The PC now sends an approved quotation to the client and records the client's decision
-- (send_quotation_client in src/data/permissions.ts). Before this, RLS let only the owner
-- write those statuses. MD approval (internally_approved) and dropping a lead (rejected)
-- stay owner-only.
DROP POLICY IF EXISTS "authenticated update quotations" ON sks_quotations;
CREATE POLICY "authenticated update quotations" ON sks_quotations
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('qs') OR sks_has_role('project_coordinator'))
  WITH CHECK (
    sks_has_role('owner')
    OR (sks_has_role('project_coordinator') AND status <> 'internally_approved' AND status <> 'rejected')
    OR (sks_has_role('qs') AND status NOT IN ('internally_approved', 'sent_to_client', 'client_approved', 'revision_requested', 'rejected'))
  );
