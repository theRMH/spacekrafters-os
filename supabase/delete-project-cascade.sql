-- Deleting a project failed with: update or delete on table "sks_projects" violates foreign key constraint
-- "sks_receipts_project_id_fkey". These tables point at a project (or at a purchase order of one) without
-- ON DELETE CASCADE, so a project that has receipts, expenses, purchase orders, bills or documents could not
-- be deleted. After this runs, deleting a project also deletes those records. Run once in the Supabase SQL editor.

ALTER TABLE sks_receipts DROP CONSTRAINT IF EXISTS sks_receipts_project_id_fkey;
ALTER TABLE sks_receipts ADD CONSTRAINT sks_receipts_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES sks_projects(id) ON DELETE CASCADE;

ALTER TABLE sks_expense_requests DROP CONSTRAINT IF EXISTS sks_expense_requests_project_id_fkey;
ALTER TABLE sks_expense_requests ADD CONSTRAINT sks_expense_requests_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES sks_projects(id) ON DELETE CASCADE;

ALTER TABLE sks_documents DROP CONSTRAINT IF EXISTS sks_documents_project_id_fkey;
ALTER TABLE sks_documents ADD CONSTRAINT sks_documents_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES sks_projects(id) ON DELETE CASCADE;

ALTER TABLE sks_purchase_orders DROP CONSTRAINT IF EXISTS sks_purchase_orders_project_id_fkey;
ALTER TABLE sks_purchase_orders ADD CONSTRAINT sks_purchase_orders_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES sks_projects(id) ON DELETE CASCADE;

-- Vendor bills hang off purchase orders, which now cascade.
ALTER TABLE sks_vendor_bills DROP CONSTRAINT IF EXISTS sks_vendor_bills_purchase_order_id_fkey;
ALTER TABLE sks_vendor_bills ADD CONSTRAINT sks_vendor_bills_purchase_order_id_fkey
  FOREIGN KEY (purchase_order_id) REFERENCES sks_purchase_orders(id) ON DELETE CASCADE;

-- A company-transaction allocation to the project is just detached, not deleted.
ALTER TABLE sks_transaction_allocations DROP CONSTRAINT IF EXISTS sks_transaction_allocations_project_id_fkey;
ALTER TABLE sks_transaction_allocations ADD CONSTRAINT sks_transaction_allocations_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES sks_projects(id) ON DELETE SET NULL;
