-- Delivered in-project vendor orders become payables automatically. The person who marks the order delivered is the
-- procurer (or whoever the PC named), not Accounts, so they need to be able to INSERT that one kind of payable.
-- Limited to ids that start with 'pay_vo_' (the ones the app generates); reading and paying payables stays with
-- owner/accounts. Safe to re-run.

DROP POLICY IF EXISTS "authenticated insert vendor-order payables" ON sks_payables;
CREATE POLICY "authenticated insert vendor-order payables" ON sks_payables
  FOR INSERT TO authenticated WITH CHECK (id LIKE 'pay\_vo\_%');
