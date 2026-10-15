-- ─── MD (owner) edit/delete everywhere — PROPOSED, NOT YET APPLIED ───────────
-- Review before running. Adds owner-only policies; existing policies are
-- untouched and Postgres OR-s permissive policies together, so no other role
-- gains anything.
--
-- UPDATE (owner): tables that had no UPDATE policy at all.
-- DELETE (owner): non-financial records only. Financial records (receipts,
-- payments, payables, POs, vendor bills, expense requests) get UPDATE only —
-- corrected, never silently removed. sks_audit_log stays append-only on purpose.
-- Safe to re-run.

DROP POLICY IF EXISTS "owner update sks_project_stages" ON sks_project_stages;
CREATE POLICY "owner update sks_project_stages" ON sks_project_stages
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_design_versions" ON sks_design_versions;
CREATE POLICY "owner update sks_design_versions" ON sks_design_versions
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_vendor_quotes" ON sks_vendor_quotes;
CREATE POLICY "owner update sks_vendor_quotes" ON sks_vendor_quotes
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_goods_receipts" ON sks_goods_receipts;
CREATE POLICY "owner update sks_goods_receipts" ON sks_goods_receipts
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_company_transactions" ON sks_company_transactions;
CREATE POLICY "owner update sks_company_transactions" ON sks_company_transactions
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_transaction_allocations" ON sks_transaction_allocations;
CREATE POLICY "owner update sks_transaction_allocations" ON sks_transaction_allocations
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_receipts" ON sks_receipts;
CREATE POLICY "owner update sks_receipts" ON sks_receipts
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_payments" ON sks_payments;
CREATE POLICY "owner update sks_payments" ON sks_payments
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner update sks_document_versions" ON sks_document_versions;
CREATE POLICY "owner update sks_document_versions" ON sks_document_versions
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner delete sks_design_packages" ON sks_design_packages;
CREATE POLICY "owner delete sks_design_packages" ON sks_design_packages
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner delete sks_daily_diary" ON sks_daily_diary;
CREATE POLICY "owner delete sks_daily_diary" ON sks_daily_diary
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner delete sks_boq_sections" ON sks_boq_sections;
CREATE POLICY "owner delete sks_boq_sections" ON sks_boq_sections
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner delete sks_boq_items" ON sks_boq_items;
CREATE POLICY "owner delete sks_boq_items" ON sks_boq_items
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner delete sks_punch_list_items" ON sks_punch_list_items;
CREATE POLICY "owner delete sks_punch_list_items" ON sks_punch_list_items
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

DROP POLICY IF EXISTS "owner delete sks_documents" ON sks_documents;
CREATE POLICY "owner delete sks_documents" ON sks_documents
  FOR DELETE TO authenticated USING (sks_has_role('owner'));
