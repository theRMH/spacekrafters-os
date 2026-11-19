-- Run in the Supabase SQL Editor.
-- 1) The project coordinator converts a lead to a project and that writes the first payment milestone and (if an
--    advance was taken) its receipt. Only owner/accounts could insert those, so they silently failed.
--    This lets the PC INSERT only — reading/updating finance rows stays owner/accounts.
DROP POLICY IF EXISTS "authenticated write payment milestones" ON sks_payment_milestones;
CREATE POLICY "authenticated write payment milestones" ON sks_payment_milestones
  FOR INSERT TO authenticated
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts') OR sks_has_role('project_coordinator'));

DROP POLICY IF EXISTS "authenticated write receipts" ON sks_receipts;
CREATE POLICY "authenticated write receipts" ON sks_receipts
  FOR INSERT TO authenticated
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts') OR sks_has_role('project_coordinator'));

-- 2) Any signed-in user can notify another (hand-offs to the PC / MD / next person). Re-create it so it exists.
DROP POLICY IF EXISTS "authenticated insert notifications" ON sks_notifications;
CREATE POLICY "authenticated insert notifications" ON sks_notifications
  FOR INSERT TO authenticated WITH CHECK (true);
