-- SpaceKrafters OS — full database setup for a NEW Supabase project (schema + RLS + PC quotation policy).
-- Paste into SQL Editor and Run ONCE. Order matters: tables, then security functions/policies, then the PC fix.

-- ===== PART 1: schema.sql =====
-- SpaceKrafters OS — base schema
-- Pattern copied from Fenster (supabase/schema.sql): every table stores a
-- typed `data` JSONB column for flexibility, plus a few indexed columns used
-- for filtering and RLS scoping. RLS is enabled here with NO policies —
-- policies live in rls-policies.sql and must be applied together with this
-- file, otherwise every table is locked to nobody (fail-closed default).
-- Run via the Supabase SQL editor or `supabase db execute -f schema.sql`.

-- ─── Managed Users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_managed_users (
  id           TEXT        PRIMARY KEY,
  email        TEXT        NOT NULL UNIQUE,
  full_name    TEXT        NOT NULL DEFAULT '',
  role         TEXT        NOT NULL DEFAULT 'admin',
  status       TEXT        NOT NULL DEFAULT 'active',
  auth_user_id UUID        UNIQUE REFERENCES auth.users(id),
  data         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_managed_users ENABLE ROW LEVEL SECURITY;

-- ─── CRM ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_leads (
  id         TEXT        PRIMARY KEY,
  owner_id   TEXT        REFERENCES sks_managed_users(id),
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_leads_owner_id_idx ON sks_leads(owner_id);
ALTER TABLE sks_leads ENABLE ROW LEVEL SECURITY;

-- Lead IDs (SK001, FGD001, …) must never repeat. The unique index is the real
-- guarantee (two users saving at the same instant can't both win); the client
-- retries with a fresh number if it loses that race.
CREATE UNIQUE INDEX IF NOT EXISTS sks_leads_lead_number_uniq
  ON sks_leads ((data->>'leadNumber')) WHERE data->>'leadNumber' IS NOT NULL;

-- Next number for a prefix = highest existing + 1, computed server-side across
-- ALL leads (SECURITY DEFINER bypasses RLS, so a user who can only see some
-- leads still gets the true next number). SK and FGD are independent.
CREATE OR REPLACE FUNCTION sks_next_lead_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INT;
BEGIN
  IF p_prefix NOT IN ('SK', 'FGD') THEN
    RAISE EXCEPTION 'Invalid lead prefix: %', p_prefix;
  END IF;
  SELECT COALESCE(MAX(substring(data->>'leadNumber' FROM length(p_prefix) + 1)::INT), 0)
    INTO v_max
    FROM sks_leads
   WHERE data->>'leadNumber' ~ ('^' || p_prefix || '[0-9]+$');
  RETURN p_prefix || lpad((v_max + 1)::TEXT, 3, '0');
END;
$$;
REVOKE ALL ON FUNCTION sks_next_lead_number(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sks_next_lead_number(TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS sks_lead_activities (
  id         TEXT        PRIMARY KEY,
  lead_id    TEXT        NOT NULL REFERENCES sks_leads(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_by TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_lead_activities_lead_id_idx ON sks_lead_activities(lead_id);
ALTER TABLE sks_lead_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_appointments (
  id         TEXT        PRIMARY KEY,
  lead_id    TEXT        REFERENCES sks_leads(id) ON DELETE CASCADE,
  owner_id   TEXT        REFERENCES sks_managed_users(id),
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_appointments_lead_id_idx ON sks_appointments(lead_id);
ALTER TABLE sks_appointments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_follow_ups (
  id         TEXT        PRIMARY KEY,
  lead_id    TEXT        REFERENCES sks_leads(id) ON DELETE CASCADE,
  owner_id   TEXT        REFERENCES sks_managed_users(id),
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_follow_ups_lead_id_idx ON sks_follow_ups(lead_id);
ALTER TABLE sks_follow_ups ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_site_visits (
  id         TEXT        PRIMARY KEY,
  lead_id    TEXT        REFERENCES sks_leads(id) ON DELETE CASCADE,
  project_id TEXT,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_site_visits_lead_id_idx ON sks_site_visits(lead_id);
CREATE INDEX IF NOT EXISTS sks_site_visits_project_id_idx ON sks_site_visits(project_id);
ALTER TABLE sks_site_visits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_requirements (
  id            TEXT        PRIMARY KEY,
  site_visit_id TEXT        REFERENCES sks_site_visits(id) ON DELETE CASCADE,
  project_id    TEXT,
  data          JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_requirements_project_id_idx ON sks_requirements(project_id);
ALTER TABLE sks_requirements ENABLE ROW LEVEL SECURITY;

-- ─── Projects & Execution ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_projects (
  id            TEXT        PRIMARY KEY,
  owner_id      TEXT        REFERENCES sks_managed_users(id),
  status        TEXT        NOT NULL DEFAULT '',
  current_stage TEXT,
  data          JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_projects_owner_id_idx ON sks_projects(owner_id);
ALTER TABLE sks_projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_tasks (
  id              TEXT        PRIMARY KEY,
  project_id      TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  parent_task_id  TEXT        REFERENCES sks_tasks(id) ON DELETE CASCADE,
  assignee_id     TEXT        REFERENCES sks_managed_users(id),
  status          TEXT        NOT NULL DEFAULT '',
  data            JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_tasks_project_id_idx ON sks_tasks(project_id);
CREATE INDEX IF NOT EXISTS sks_tasks_parent_task_id_idx ON sks_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS sks_tasks_assignee_id_idx ON sks_tasks(assignee_id);
ALTER TABLE sks_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_task_dependencies (
  id               TEXT        PRIMARY KEY,
  task_id          TEXT        NOT NULL REFERENCES sks_tasks(id) ON DELETE CASCADE,
  depends_on_id    TEXT        NOT NULL REFERENCES sks_tasks(id) ON DELETE CASCADE,
  project_id       TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  data             JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_task_dependencies_project_id_idx ON sks_task_dependencies(project_id);
ALTER TABLE sks_task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_daily_diary (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  created_by TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_daily_diary_project_id_idx ON sks_daily_diary(project_id);
ALTER TABLE sks_daily_diary ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_project_stages (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_project_stages_project_id_idx ON sks_project_stages(project_id);
ALTER TABLE sks_project_stages ENABLE ROW LEVEL SECURITY;

-- ─── Commercial ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_quotations (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        REFERENCES sks_projects(id) ON DELETE CASCADE,
  lead_id    TEXT        REFERENCES sks_leads(id),
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_quotations_project_id_idx ON sks_quotations(project_id);
ALTER TABLE sks_quotations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_boq_sections (
  id            TEXT        PRIMARY KEY,
  quotation_id  TEXT        NOT NULL REFERENCES sks_quotations(id) ON DELETE CASCADE,
  data          JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_boq_sections_quotation_id_idx ON sks_boq_sections(quotation_id);
ALTER TABLE sks_boq_sections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_boq_items (
  id         TEXT        PRIMARY KEY,
  section_id TEXT        NOT NULL REFERENCES sks_boq_sections(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_boq_items_section_id_idx ON sks_boq_items(section_id);
ALTER TABLE sks_boq_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_design_packages (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        REFERENCES sks_projects(id) ON DELETE CASCADE,
  lead_id    TEXT        REFERENCES sks_leads(id),
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_design_packages_project_id_idx ON sks_design_packages(project_id);
CREATE INDEX IF NOT EXISTS sks_design_packages_lead_id_idx ON sks_design_packages(lead_id);
ALTER TABLE sks_design_packages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_design_versions (
  id                 TEXT        PRIMARY KEY,
  design_package_id  TEXT        NOT NULL REFERENCES sks_design_packages(id) ON DELETE CASCADE,
  data               JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_design_versions_package_id_idx ON sks_design_versions(design_package_id);
ALTER TABLE sks_design_versions ENABLE ROW LEVEL SECURITY;

-- ─── Procurement ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_vendors (
  id         TEXT        PRIMARY KEY,
  status     TEXT        NOT NULL DEFAULT 'active',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_vendors ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_clients (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE sks_projects ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES sks_clients(id);
CREATE INDEX IF NOT EXISTS sks_projects_client_id_idx ON sks_projects(client_id);

CREATE TABLE IF NOT EXISTS sks_punch_list_items (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'open',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_punch_list_items_project_id_idx ON sks_punch_list_items(project_id);
ALTER TABLE sks_punch_list_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_purchase_requests (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        REFERENCES sks_projects(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_purchase_requests_project_id_idx ON sks_purchase_requests(project_id);
ALTER TABLE sks_purchase_requests ENABLE ROW LEVEL SECURITY;

-- Material Request Form: Project raises -> QS drafts details/notes/dates ->
-- Project Coordinator approves/rejects -> Procurement receives it. One row per request.
CREATE TABLE IF NOT EXISTS sks_mrfs (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_mrfs_project_id_idx ON sks_mrfs(project_id);
ALTER TABLE sks_mrfs ENABLE ROW LEVEL SECURITY;

-- Simple standalone roster (name/nature of work/number) — separate from the
-- full sks_vendors master, which carries GSTIN/address/contact fields this
-- listing doesn't need.
CREATE TABLE IF NOT EXISTS sks_vendor_labour (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_vendor_labour ENABLE ROW LEVEL SECURITY;

-- Site Engineer Daily Report: locked once submitted; editing requires an
-- LO-approved edit request (see editRequestStatus in the app's DailyReport type).
CREATE TABLE IF NOT EXISTS sks_daily_reports (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_daily_reports_project_id_idx ON sks_daily_reports(project_id);
ALTER TABLE sks_daily_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_vendor_quotes (
  id                    TEXT        PRIMARY KEY,
  purchase_request_id   TEXT        NOT NULL REFERENCES sks_purchase_requests(id) ON DELETE CASCADE,
  vendor_id             TEXT        REFERENCES sks_vendors(id),
  data                  JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_vendor_quotes_pr_id_idx ON sks_vendor_quotes(purchase_request_id);
ALTER TABLE sks_vendor_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_purchase_orders (
  id                   TEXT        PRIMARY KEY,
  purchase_request_id  TEXT        REFERENCES sks_purchase_requests(id),
  vendor_id            TEXT        REFERENCES sks_vendors(id),
  project_id           TEXT        REFERENCES sks_projects(id),
  status               TEXT        NOT NULL DEFAULT '',
  data                 JSONB       NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_purchase_orders_project_id_idx ON sks_purchase_orders(project_id);
CREATE INDEX IF NOT EXISTS sks_purchase_orders_vendor_id_idx ON sks_purchase_orders(vendor_id);
ALTER TABLE sks_purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_goods_receipts (
  id                  TEXT        PRIMARY KEY,
  purchase_order_id   TEXT        NOT NULL REFERENCES sks_purchase_orders(id) ON DELETE CASCADE,
  data                JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_goods_receipts_po_id_idx ON sks_goods_receipts(purchase_order_id);
ALTER TABLE sks_goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_vendor_bills (
  id                  TEXT        PRIMARY KEY,
  vendor_id           TEXT        REFERENCES sks_vendors(id),
  purchase_order_id   TEXT        REFERENCES sks_purchase_orders(id),
  status              TEXT        NOT NULL DEFAULT '',
  data                JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_vendor_bills_vendor_id_idx ON sks_vendor_bills(vendor_id);
ALTER TABLE sks_vendor_bills ENABLE ROW LEVEL SECURITY;

-- ─── Finance ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_expense_requests (
  id           TEXT        PRIMARY KEY,
  project_id   TEXT        REFERENCES sks_projects(id),
  requested_by TEXT        REFERENCES sks_managed_users(id),
  status       TEXT        NOT NULL DEFAULT '',
  data         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_expense_requests_project_id_idx ON sks_expense_requests(project_id);
CREATE INDEX IF NOT EXISTS sks_expense_requests_requested_by_idx ON sks_expense_requests(requested_by);
ALTER TABLE sks_expense_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_company_accounts (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_company_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_company_transactions (
  id         TEXT        PRIMARY KEY,
  account_id TEXT        REFERENCES sks_company_accounts(id),
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_company_transactions_account_id_idx ON sks_company_transactions(account_id);
ALTER TABLE sks_company_transactions ENABLE ROW LEVEL SECURITY;

-- One cash movement (one sks_company_transactions row) can be split across
-- multiple projects here instead of being duplicated into multiple rows (Finance Rule 3).
CREATE TABLE IF NOT EXISTS sks_transaction_allocations (
  id             TEXT        PRIMARY KEY,
  transaction_id TEXT        NOT NULL REFERENCES sks_company_transactions(id) ON DELETE CASCADE,
  project_id     TEXT        REFERENCES sks_projects(id),
  amount         NUMERIC     NOT NULL,
  data           JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_transaction_allocations_transaction_id_idx ON sks_transaction_allocations(transaction_id);
CREATE INDEX IF NOT EXISTS sks_transaction_allocations_project_id_idx ON sks_transaction_allocations(project_id);
ALTER TABLE sks_transaction_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_payment_milestones (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES sks_projects(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_payment_milestones_project_id_idx ON sks_payment_milestones(project_id);
ALTER TABLE sks_payment_milestones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_receipts (
  id           TEXT        PRIMARY KEY,
  project_id   TEXT        REFERENCES sks_projects(id),
  milestone_id TEXT        REFERENCES sks_payment_milestones(id),
  data         JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_receipts_project_id_idx ON sks_receipts(project_id);
ALTER TABLE sks_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_payables (
  id             TEXT        PRIMARY KEY,
  vendor_id      TEXT        REFERENCES sks_vendors(id),
  vendor_bill_id TEXT        REFERENCES sks_vendor_bills(id),
  status         TEXT        NOT NULL DEFAULT '',
  data           JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_payables ADD COLUMN IF NOT EXISTS vendor_bill_id TEXT REFERENCES sks_vendor_bills(id);
CREATE INDEX IF NOT EXISTS sks_payables_vendor_id_idx ON sks_payables(vendor_id);
CREATE INDEX IF NOT EXISTS sks_payables_vendor_bill_id_idx ON sks_payables(vendor_bill_id);
ALTER TABLE sks_payables ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_payments (
  id         TEXT        PRIMARY KEY,
  payable_id TEXT        REFERENCES sks_payables(id),
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_payments_payable_id_idx ON sks_payments(payable_id);
ALTER TABLE sks_payments ENABLE ROW LEVEL SECURITY;

-- ─── HR ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_attendance (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES sks_managed_users(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS sks_attendance_user_id_idx ON sks_attendance(user_id);
ALTER TABLE sks_attendance ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_leave_applications (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES sks_managed_users(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'pending',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_leave_applications_user_id_idx ON sks_leave_applications(user_id);
ALTER TABLE sks_leave_applications ENABLE ROW LEVEL SECURITY;

-- One row per person per day. Unlike attendance/leave (self-or-owner/admin
-- visibility), this is deliberately team-wide read for everyone — see RLS.
CREATE TABLE IF NOT EXISTS sks_weekly_plans (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES sks_managed_users(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS sks_weekly_plans_user_id_idx ON sks_weekly_plans(user_id);
ALTER TABLE sks_weekly_plans ENABLE ROW LEVEL SECURITY;

-- One-directional: MD assigns a task TO an employee (not self-authored, unlike
-- sks_weekly_plans above). No UNIQUE(assignee_id, date) — an employee can have
-- several tasks assigned for the same day.
CREATE TABLE IF NOT EXISTS sks_daily_tasks (
  id          TEXT        PRIMARY KEY,
  assignee_id TEXT        NOT NULL REFERENCES sks_managed_users(id) ON DELETE CASCADE,
  date        DATE        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_daily_tasks_assignee_id_idx ON sks_daily_tasks(assignee_id);
ALTER TABLE sks_daily_tasks ENABLE ROW LEVEL SECURITY;

-- ─── System ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sks_documents (
  id         TEXT        PRIMARY KEY,
  project_id TEXT        REFERENCES sks_projects(id),
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_documents_project_id_idx ON sks_documents(project_id);
ALTER TABLE sks_documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_document_versions (
  id          TEXT        PRIMARY KEY,
  document_id TEXT        NOT NULL REFERENCES sks_documents(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_document_versions_document_id_idx ON sks_document_versions(document_id);
ALTER TABLE sks_document_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_notifications (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES sks_managed_users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_notifications_user_id_idx ON sks_notifications(user_id);
ALTER TABLE sks_notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_audit_log (
  id              TEXT        PRIMARY KEY,
  project_id      TEXT,
  action          TEXT        NOT NULL DEFAULT '',
  description     TEXT        NOT NULL DEFAULT '',
  data            JSONB       NOT NULL DEFAULT '{}',
  created_by      TEXT        NOT NULL DEFAULT '',
  created_by_role TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_audit_log_project_id_idx ON sks_audit_log(project_id);
ALTER TABLE sks_audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_push_subscriptions (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES sks_managed_users(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_push_subscriptions_user_id_idx ON sks_push_subscriptions(user_id);
ALTER TABLE sks_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_integration_settings (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_integration_settings ENABLE ROW LEVEL SECURITY;

-- ─── Personal Finance (Owner-only; ported model from spacekrafter-personal-finance-tracker) ─
CREATE TABLE IF NOT EXISTS sks_personal_accounts (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_personal_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_personal_categories (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_personal_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_personal_subcategories (
  id          TEXT        PRIMARY KEY,
  category_id TEXT        NOT NULL REFERENCES sks_personal_categories(id) ON DELETE CASCADE,
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_personal_subcategories_category_id_idx ON sks_personal_subcategories(category_id);
ALTER TABLE sks_personal_subcategories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_personal_transactions (
  id         TEXT        PRIMARY KEY,
  account_id TEXT        NOT NULL REFERENCES sks_personal_accounts(id),
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sks_personal_transactions_account_id_idx ON sks_personal_transactions(account_id);
ALTER TABLE sks_personal_transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_personal_commitments (
  id         TEXT        PRIMARY KEY,
  status     TEXT        NOT NULL DEFAULT '',
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_personal_commitments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_personal_plans (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_personal_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS sks_personal_investments (
  id         TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sks_personal_investments ENABLE ROW LEVEL SECURITY;

-- ===== PART 2: rls-policies.sql =====
-- SpaceKrafters OS — RLS policies
-- Pattern copied from Fenster (supabase/rls-authenticated-policies.sql):
-- SQL helper functions drive per-table policies for the `authenticated` role.
-- Unlike Fenster's migration history, SKS is greenfield — there is no legacy
-- anon-key frontend to keep working, so this is the ONLY policy set ever
-- applied (no separate "drop anon" step). Run this together with schema.sql;
-- every table has RLS enabled with no policies until this file runs.

-- ─── Helpers ─────────────────────────────────────────────────────────────────

-- The managed-user id (sks_managed_users.id) linked to the calling session.
CREATE OR REPLACE FUNCTION sks_my_id() RETURNS TEXT AS $$
  SELECT id FROM sks_managed_users WHERE auth_user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Every role the calling session holds (mirrors src/utils/permissions.ts
-- hasRole, which checks `user.roles ?? [user.role]`).
CREATE OR REPLACE FUNCTION sks_my_roles() RETURNS TEXT[] AS $$
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(u.data->'roles') = 'array' AND jsonb_array_length(u.data->'roles') > 0
           THEN u.data->'roles'
           ELSE to_jsonb(ARRAY[u.role])
      END
    )
    FROM sks_managed_users u
    WHERE u.auth_user_id = auth.uid()
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION sks_has_role(want TEXT) RETURNS BOOLEAN AS $$
  SELECT want = ANY(sks_my_roles())
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Project visibility: owner/admin/accounts see everything; project_coordinator
-- sees projects they own; site_engineer/designer/qs/purchase see projects they
-- have a task or PO assigned on. Simpler than Fenster's stage-bucket model
-- since SKS has no production-line flow-stage concept.
CREATE OR REPLACE FUNCTION sks_can_see_project(p_project_id TEXT) RETURNS BOOLEAN AS $$
  SELECT
    CASE
      WHEN sks_has_role('owner') THEN true
      WHEN sks_has_role('admin') THEN true
      WHEN sks_has_role('accounts') THEN true
      WHEN sks_has_role('project_coordinator') THEN
        EXISTS (SELECT 1 FROM sks_projects p WHERE p.id = p_project_id AND p.owner_id = sks_my_id())
      WHEN sks_has_role('qs') THEN true
      ELSE EXISTS (
        SELECT 1 FROM sks_tasks t WHERE t.project_id = p_project_id AND t.assignee_id = sks_my_id()
      ) OR EXISTS (
        SELECT 1 FROM sks_purchase_orders po WHERE po.project_id = p_project_id AND sks_has_role('purchase')
      )
    END
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ─── sks_managed_users ───────────────────────────────────────────────────────
-- Own row always readable; owner can read/write every row (User Management).
-- Self UPDATE is allowed but a trigger below blocks changes to role/status —
-- otherwise a user could grant themselves 'owner' by editing their own row.
CREATE POLICY "authenticated select own or owner all" ON sks_managed_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR sks_has_role('owner'));

CREATE POLICY "authenticated insert owner only" ON sks_managed_users
  FOR INSERT TO authenticated
  WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated update own or owner" ON sks_managed_users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR sks_has_role('owner'))
  WITH CHECK (auth_user_id = auth.uid() OR sks_has_role('owner'));

CREATE POLICY "authenticated delete owner only" ON sks_managed_users
  FOR DELETE TO authenticated
  USING (sks_has_role('owner'));

CREATE OR REPLACE FUNCTION sks_protect_privileged_user_fields() RETURNS TRIGGER AS $$
BEGIN
  IF sks_has_role('owner') THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR (NEW.data->'roles') IS DISTINCT FROM (OLD.data->'roles')
     OR (NEW.data->>'role') IS DISTINCT FROM (OLD.data->>'role')
     OR (NEW.data->>'status') IS DISTINCT FROM (OLD.data->>'status') THEN
    RAISE EXCEPTION 'Only an owner can change role or status.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sks_managed_users_protect_privileged ON sks_managed_users;
CREATE TRIGGER sks_managed_users_protect_privileged
  BEFORE UPDATE ON sks_managed_users
  FOR EACH ROW EXECUTE FUNCTION sks_protect_privileged_user_fields();

-- Safe, password-free directory of every user (name/role/status only) — for
-- populating "assign a person" dropdowns. sks_managed_users' own SELECT policy
-- above only allows reading your own row or every row as an owner, so this
-- goes through a SECURITY DEFINER function instead, callable by any
-- authenticated role. Mobile/email/password aren't returned — never add them.
CREATE OR REPLACE FUNCTION sks_managed_users_directory()
RETURNS TABLE (
  id            TEXT,
  full_name     TEXT,
  role          TEXT,
  status        TEXT,
  display_role  TEXT,
  roles         JSONB,
  display_roles JSONB,
  department    TEXT
) AS $$
  SELECT
    id, full_name, role, status,
    data->>'displayRole',
    COALESCE(data->'roles', '[]'::jsonb),
    COALESCE(data->'displayRoles', '[]'::jsonb),
    data->>'department'
  FROM sks_managed_users
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION sks_managed_users_directory() TO authenticated;

-- ─── sks_projects ────────────────────────────────────────────────────────────
CREATE POLICY "authenticated select visible projects" ON sks_projects
  FOR SELECT TO authenticated USING (sks_can_see_project(id));

CREATE POLICY "authenticated insert projects" ON sks_projects
  FOR INSERT TO authenticated
  WITH CHECK (sks_has_role('owner') OR sks_has_role('project_coordinator'));

CREATE POLICY "authenticated update visible projects" ON sks_projects
  FOR UPDATE TO authenticated
  USING (sks_can_see_project(id)) WITH CHECK (sks_can_see_project(id));

CREATE POLICY "authenticated delete owner only" ON sks_projects
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_leads ───────────────────────────────────────────────────────────────
-- site_engineer/designer/accounts also need to see and advance leads at the
-- pipeline stages LeadStatusSheet.tsx's ROLE_FOR_LEAD_STATUS assigns them
-- (site_visit_scheduled / internally_approved+design_in_progress / client_approved)
-- — SELECT/UPDATE previously only recognized owner/admin/project_coordinator,
-- so those stage-owner buttons were unclickable in practice (silent RLS no-op).
CREATE POLICY "authenticated select visible leads" ON sks_leads
  FOR SELECT TO authenticated
  USING (
    sks_has_role('owner') OR sks_has_role('admin')
    OR (sks_has_role('project_coordinator') AND (owner_id = sks_my_id() OR owner_id IS NULL))
    OR sks_has_role('site_engineer') OR sks_has_role('designer') OR sks_has_role('accounts')
  );

CREATE POLICY "authenticated insert leads" ON sks_leads
  FOR INSERT TO authenticated
  WITH CHECK (sks_has_role('owner') OR sks_has_role('admin') OR sks_has_role('project_coordinator'));

-- The last OR clause (added later) additionally lets whoever is personally
-- assigned to a lead's own appointment (Appointment.assignedToIds, set
-- independently of the lead's PC/MD owner in AppointmentsScreen.tsx) advance
-- it through the 'qualified'/'site_visit_scheduled' stages they're actually
-- responsible for — e.g. a Designer attending a site-visit appointment, who
-- otherwise has no role-based write access to the lead at all at that status.
CREATE POLICY "authenticated update leads" ON sks_leads
  FOR UPDATE TO authenticated
  USING (
    sks_has_role('owner')
    OR (sks_has_role('project_coordinator') AND (owner_id = sks_my_id() OR owner_id IS NULL))
    OR (sks_has_role('site_engineer') AND status = 'site_visit_scheduled')
    OR (sks_has_role('designer') AND status IN ('internally_approved', 'design_in_progress'))
    OR (sks_has_role('accounts') AND status = 'client_approved')
    OR (status IN ('qualified', 'site_visit_scheduled') AND EXISTS (
      SELECT 1 FROM sks_appointments a
      WHERE a.lead_id = id
      AND a.data->'assignedToIds' ? sks_my_id()
    ))
  )
  WITH CHECK (
    sks_has_role('owner')
    OR (sks_has_role('project_coordinator') AND (owner_id = sks_my_id() OR owner_id IS NULL))
    OR sks_has_role('site_engineer') OR sks_has_role('designer') OR sks_has_role('accounts')
    OR (status IN ('qualified', 'site_visit_scheduled') AND EXISTS (
      SELECT 1 FROM sks_appointments a
      WHERE a.lead_id = id
      AND a.data->'assignedToIds' ? sks_my_id()
    ))
  );

CREATE POLICY "authenticated delete leads owner only" ON sks_leads
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_lead_activities / sks_appointments / sks_follow_ups ────────────────
-- Scoped transitively through the parent lead's visibility.
CREATE POLICY "authenticated select lead activities" ON sks_lead_activities
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM sks_leads l WHERE l.id = lead_id));
CREATE POLICY "authenticated write lead activities" ON sks_lead_activities
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM sks_leads l WHERE l.id = lead_id));

CREATE POLICY "authenticated select appointments" ON sks_appointments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write appointments" ON sks_appointments
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('admin') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated update appointments" ON sks_appointments
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete appointments owner only" ON sks_appointments
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

CREATE POLICY "authenticated select follow ups" ON sks_follow_ups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write follow ups" ON sks_follow_ups
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('admin') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated update follow ups" ON sks_follow_ups
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete follow ups owner only" ON sks_follow_ups
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_site_visits / sks_requirements ──────────────────────────────────────
CREATE POLICY "authenticated select site visits" ON sks_site_visits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write site visits" ON sks_site_visits
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update site visits" ON sks_site_visits
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete site visits owner only" ON sks_site_visits
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

CREATE POLICY "authenticated select requirements" ON sks_requirements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write requirements" ON sks_requirements
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update requirements" ON sks_requirements
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated delete requirements owner only" ON sks_requirements
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_tasks / sks_task_dependencies / sks_daily_diary / sks_project_stages ─
-- Scoped through parent project's visibility.
CREATE POLICY "authenticated select tasks on visible projects" ON sks_tasks
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated insert tasks on visible projects" ON sks_tasks
  FOR INSERT TO authenticated WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated update tasks on visible projects" ON sks_tasks
  FOR UPDATE TO authenticated USING (sks_can_see_project(project_id)) WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated delete tasks owner only" ON sks_tasks
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

CREATE POLICY "authenticated select task deps on visible projects" ON sks_task_dependencies
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated write task deps on visible projects" ON sks_task_dependencies
  FOR INSERT TO authenticated WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated delete task deps on visible projects" ON sks_task_dependencies
  FOR DELETE TO authenticated USING (sks_can_see_project(project_id));

CREATE POLICY "authenticated select diary on visible projects" ON sks_daily_diary
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated write diary on visible projects" ON sks_daily_diary
  FOR INSERT TO authenticated WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated update diary on visible projects" ON sks_daily_diary
  FOR UPDATE TO authenticated USING (sks_can_see_project(project_id)) WITH CHECK (sks_can_see_project(project_id));

CREATE POLICY "authenticated select stages on visible projects" ON sks_project_stages
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated write stages on visible projects" ON sks_project_stages
  FOR INSERT TO authenticated WITH CHECK (sks_can_see_project(project_id));

-- ─── sks_quotations / sks_boq_sections / sks_boq_items ──────────────────────
CREATE POLICY "authenticated select quotations" ON sks_quotations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write quotations" ON sks_quotations
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('qs') OR sks_has_role('project_coordinator'));
-- MD approval (internally_approved / MD-rejected) and the client-facing transitions
-- (send_to_client / client_approved / revision_requested / rejected) are owner-only
-- (approve_quotation_internal / send_quotation_client in src/data/permissions.ts) —
-- the UI hides those actions from qs/project_coordinator, so RLS must enforce the
-- same boundary rather than trusting the client. qs/project_coordinator can still
-- create quotations and edit them (an edit sends it back to internal_review).
CREATE POLICY "authenticated update quotations" ON sks_quotations
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('qs') OR sks_has_role('project_coordinator'))
  WITH CHECK (
    sks_has_role('owner')
    OR (
      (sks_has_role('qs') OR sks_has_role('project_coordinator'))
      AND status NOT IN ('internally_approved', 'sent_to_client', 'client_approved', 'revision_requested', 'rejected')
    )
  );
CREATE POLICY "authenticated delete quotations owner only" ON sks_quotations
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

CREATE POLICY "authenticated select boq sections" ON sks_boq_sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write boq sections" ON sks_boq_sections
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('qs'));
CREATE POLICY "authenticated update boq sections" ON sks_boq_sections
  FOR UPDATE TO authenticated USING (sks_has_role('owner') OR sks_has_role('qs')) WITH CHECK (sks_has_role('owner') OR sks_has_role('qs'));

CREATE POLICY "authenticated select boq items" ON sks_boq_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write boq items" ON sks_boq_items
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('qs'));
CREATE POLICY "authenticated update boq items" ON sks_boq_items
  FOR UPDATE TO authenticated USING (sks_has_role('owner') OR sks_has_role('qs')) WITH CHECK (sks_has_role('owner') OR sks_has_role('qs'));

-- ─── sks_design_packages / sks_design_versions ──────────────────────────────
-- project_id is null for packages linked to a pre-project Lead; fall through to
-- visible in that case (matches sks_documents' project_id IS NULL convention).
CREATE POLICY "authenticated select design packages on visible projects" ON sks_design_packages
  FOR SELECT TO authenticated USING (project_id IS NULL OR sks_can_see_project(project_id));
CREATE POLICY "authenticated write design packages on visible projects" ON sks_design_packages
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('designer'));
CREATE POLICY "authenticated update design packages" ON sks_design_packages
  FOR UPDATE TO authenticated
  USING (project_id IS NULL OR sks_can_see_project(project_id))
  WITH CHECK (project_id IS NULL OR sks_can_see_project(project_id));

CREATE POLICY "authenticated select design versions" ON sks_design_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write design versions" ON sks_design_versions
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('designer'));

-- ─── sks_vendors / sks_purchase_requests / sks_vendor_quotes ────────────────
CREATE POLICY "authenticated select vendors" ON sks_vendors
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write vendors" ON sks_vendors
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase'));
CREATE POLICY "authenticated update vendors" ON sks_vendors
  FOR UPDATE TO authenticated USING (sks_has_role('owner') OR sks_has_role('purchase')) WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase'));
CREATE POLICY "authenticated delete vendors" ON sks_vendors
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_clients ─────────────────────────────────────────────────────────────
CREATE POLICY "authenticated select clients" ON sks_clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write clients" ON sks_clients
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated update clients" ON sks_clients
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('project_coordinator'))
  WITH CHECK (sks_has_role('owner') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated delete clients" ON sks_clients
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_punch_list_items ────────────────────────────────────────────────────
CREATE POLICY "authenticated select punch list on visible projects" ON sks_punch_list_items
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated insert punch list on visible projects" ON sks_punch_list_items
  FOR INSERT TO authenticated WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated update punch list on visible projects" ON sks_punch_list_items
  FOR UPDATE TO authenticated USING (sks_can_see_project(project_id)) WITH CHECK (sks_can_see_project(project_id));

CREATE POLICY "authenticated select purchase requests on visible projects" ON sks_purchase_requests
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated write purchase requests on visible projects" ON sks_purchase_requests
  FOR INSERT TO authenticated WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated update purchase requests on visible projects" ON sks_purchase_requests
  FOR UPDATE TO authenticated USING (sks_can_see_project(project_id)) WITH CHECK (sks_can_see_project(project_id));
CREATE POLICY "authenticated delete purchase requests" ON sks_purchase_requests
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_mrfs ─────────────────────────────────────────────────────────────────
-- Visible to everyone who can act on some stage of the flow (PC raises + later
-- approves, QS drafts details/notes/dates, Purchase receives the completed MRF)
-- — checked by role rather than sks_can_see_project since the responsible
-- person for a given stage isn't always someone who'd otherwise have project
-- visibility (e.g. Purchase has no task/PO yet at the point an MRF first
-- reaches them).
CREATE POLICY "authenticated select mrfs" ON sks_mrfs
  FOR SELECT TO authenticated USING (
    sks_has_role('owner') OR sks_has_role('project_coordinator') OR sks_has_role('qs')
    OR sks_has_role('purchase') OR sks_has_role('designer')
  );
CREATE POLICY "authenticated insert mrfs" ON sks_mrfs
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated update mrfs" ON sks_mrfs
  FOR UPDATE TO authenticated
  USING (
    sks_has_role('owner') OR sks_has_role('project_coordinator') OR sks_has_role('qs')
    OR sks_has_role('purchase') OR sks_has_role('designer')
  )
  WITH CHECK (
    sks_has_role('owner') OR sks_has_role('project_coordinator') OR sks_has_role('qs')
    OR sks_has_role('purchase') OR sks_has_role('designer')
  );
CREATE POLICY "authenticated delete mrfs" ON sks_mrfs
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_vendor_labour ────────────────────────────────────────────────────────
CREATE POLICY "authenticated select vendor labour" ON sks_vendor_labour
  FOR SELECT TO authenticated USING (
    sks_has_role('owner') OR sks_has_role('project_coordinator') OR sks_has_role('qs')
    OR sks_has_role('designer') OR sks_has_role('site_engineer') OR sks_has_role('accounts')
  );
CREATE POLICY "authenticated write vendor labour" ON sks_vendor_labour
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated update vendor labour" ON sks_vendor_labour
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('project_coordinator'))
  WITH CHECK (sks_has_role('owner') OR sks_has_role('project_coordinator'));
CREATE POLICY "authenticated delete vendor labour" ON sks_vendor_labour
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_daily_reports ────────────────────────────────────────────────────────
-- RLS checks role-level write access only; the submit-lock / edit-request /
-- LO-approval state machine itself is enforced in the app (same convention
-- already used for sks_appointments/sks_site_visits/sks_requirements).
CREATE POLICY "authenticated select daily reports" ON sks_daily_reports
  FOR SELECT TO authenticated USING (
    sks_has_role('owner') OR sks_has_role('site_engineer') OR sks_has_role('qs')
    OR sks_has_role('project_coordinator') OR sks_has_role('designer')
  );
CREATE POLICY "authenticated insert daily reports" ON sks_daily_reports
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('site_engineer'));
CREATE POLICY "authenticated update daily reports" ON sks_daily_reports
  FOR UPDATE TO authenticated
  USING (
    sks_has_role('owner') OR sks_has_role('site_engineer') OR sks_has_role('project_coordinator') OR sks_has_role('designer')
  )
  WITH CHECK (
    sks_has_role('owner') OR sks_has_role('site_engineer') OR sks_has_role('project_coordinator') OR sks_has_role('designer')
  );
CREATE POLICY "authenticated delete daily reports" ON sks_daily_reports
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

CREATE POLICY "authenticated select vendor quotes" ON sks_vendor_quotes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write vendor quotes" ON sks_vendor_quotes
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase'));

-- ─── sks_purchase_orders / sks_goods_receipts / sks_vendor_bills ────────────
CREATE POLICY "authenticated select purchase orders" ON sks_purchase_orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write purchase orders" ON sks_purchase_orders
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase'));
CREATE POLICY "authenticated update purchase orders" ON sks_purchase_orders
  FOR UPDATE TO authenticated USING (sks_has_role('owner') OR sks_has_role('purchase')) WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase'));

CREATE POLICY "authenticated select goods receipts" ON sks_goods_receipts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write goods receipts" ON sks_goods_receipts
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase') OR sks_has_role('site_engineer'));

CREATE POLICY "authenticated select vendor bills" ON sks_vendor_bills
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts') OR sks_has_role('purchase'));
CREATE POLICY "authenticated write vendor bills" ON sks_vendor_bills
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('purchase'));
CREATE POLICY "authenticated update vendor bills" ON sks_vendor_bills
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('accounts') OR sks_has_role('purchase'))
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts') OR sks_has_role('purchase'));

-- ─── sks_expense_requests ────────────────────────────────────────────────────
CREATE POLICY "authenticated select expense requests" ON sks_expense_requests
  FOR SELECT TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('accounts') OR requested_by = sks_my_id());
CREATE POLICY "authenticated insert expense requests" ON sks_expense_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = sks_my_id() OR sks_has_role('owner'));
CREATE POLICY "authenticated update expense requests" ON sks_expense_requests
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('accounts') OR requested_by = sks_my_id())
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts') OR requested_by = sks_my_id());

-- ─── sks_company_accounts / sks_company_transactions ────────────────────────
-- Company finance is owner + accounts only — never exposed to other roles.
CREATE POLICY "authenticated select company accounts" ON sks_company_accounts
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated write company accounts" ON sks_company_accounts
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated update company accounts" ON sks_company_accounts
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('accounts'))
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated delete company accounts" ON sks_company_accounts
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

CREATE POLICY "authenticated select company transactions" ON sks_company_transactions
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated write company transactions" ON sks_company_transactions
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));

CREATE POLICY "authenticated select transaction allocations" ON sks_transaction_allocations
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated write transaction allocations" ON sks_transaction_allocations
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));

-- ─── sks_payment_milestones / sks_receipts / sks_payables / sks_payments ────
CREATE POLICY "authenticated select payment milestones on visible projects" ON sks_payment_milestones
  FOR SELECT TO authenticated USING (sks_can_see_project(project_id));
CREATE POLICY "authenticated write payment milestones" ON sks_payment_milestones
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated update payment milestones" ON sks_payment_milestones
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('accounts'))
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));

CREATE POLICY "authenticated select receipts" ON sks_receipts
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated write receipts" ON sks_receipts
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));

CREATE POLICY "authenticated select payables" ON sks_payables
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated write payables" ON sks_payables
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated update payables" ON sks_payables
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('accounts'))
  WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));

CREATE POLICY "authenticated select payments" ON sks_payments
  FOR SELECT TO authenticated USING (sks_has_role('owner') OR sks_has_role('accounts'));
CREATE POLICY "authenticated write payments" ON sks_payments
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner') OR sks_has_role('accounts'));

-- ─── sks_attendance / sks_leave_applications ─────────────────────────────────
CREATE POLICY "authenticated select attendance own or owner/admin" ON sks_attendance
  FOR SELECT TO authenticated
  USING (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));
CREATE POLICY "authenticated insert own attendance" ON sks_attendance
  FOR INSERT TO authenticated WITH CHECK (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));
CREATE POLICY "authenticated update own attendance" ON sks_attendance
  FOR UPDATE TO authenticated
  USING (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'))
  WITH CHECK (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));

-- GPS/photo capture tamper-resistance: once startTime/startCapture (or
-- endTime/endCapture) are set on a row, a regular employee can no longer
-- rewrite them — RLS above only checks row ownership, not which JSONB
-- sub-keys changed, so this needs a real trigger. Owner/admin are exempt
-- (genuine corrections still need to be possible).
CREATE OR REPLACE FUNCTION sks_protect_attendance_capture() RETURNS TRIGGER AS $$
BEGIN
  IF sks_has_role('owner') OR sks_has_role('admin') THEN
    RETURN NEW;
  END IF;
  IF OLD.data->>'startTime' IS NOT NULL AND (
    NEW.data->>'startTime' IS DISTINCT FROM OLD.data->>'startTime' OR
    NEW.data->'startCapture' IS DISTINCT FROM OLD.data->'startCapture'
  ) THEN
    RAISE EXCEPTION 'startTime/startCapture cannot be modified once captured';
  END IF;
  IF OLD.data->>'endTime' IS NOT NULL AND (
    NEW.data->>'endTime' IS DISTINCT FROM OLD.data->>'endTime' OR
    NEW.data->'endCapture' IS DISTINCT FROM OLD.data->'endCapture'
  ) THEN
    RAISE EXCEPTION 'endTime/endCapture cannot be modified once captured';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS sks_attendance_protect_capture ON sks_attendance;
CREATE TRIGGER sks_attendance_protect_capture
  BEFORE UPDATE ON sks_attendance
  FOR EACH ROW EXECUTE FUNCTION sks_protect_attendance_capture();

CREATE POLICY "authenticated select leave own or owner/admin" ON sks_leave_applications
  FOR SELECT TO authenticated
  USING (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));
CREATE POLICY "authenticated insert own leave" ON sks_leave_applications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));
CREATE POLICY "authenticated update leave own or owner/admin approval" ON sks_leave_applications
  FOR UPDATE TO authenticated
  USING (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'))
  WITH CHECK (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));

-- Weekly Planner: MD/Admin see the whole team's plans; everyone else only
-- their own row. (Previously team-wide SELECT for everyone — reverted per
-- explicit requirement that regular employees must not be able to read
-- other people's plans, enforced here at the RLS level, not just in the UI.)
CREATE POLICY "authenticated select weekly plans own or owner/admin" ON sks_weekly_plans
  FOR SELECT TO authenticated USING (user_id = sks_my_id() OR sks_has_role('owner') OR sks_has_role('admin'));
CREATE POLICY "authenticated insert own weekly plan" ON sks_weekly_plans
  FOR INSERT TO authenticated
  WITH CHECK (user_id = sks_my_id() OR sks_has_role('owner'));
CREATE POLICY "authenticated update own weekly plan" ON sks_weekly_plans
  FOR UPDATE TO authenticated
  USING (user_id = sks_my_id() OR sks_has_role('owner'))
  WITH CHECK (user_id = sks_my_id() OR sks_has_role('owner'));
CREATE POLICY "authenticated delete own weekly plan" ON sks_weekly_plans
  FOR DELETE TO authenticated USING (user_id = sks_my_id() OR sks_has_role('owner'));

-- Daily Tasks: deliberately MD (owner) only for assigning/seeing the whole
-- team — client was explicit this is an MD-only capability, unlike Weekly
-- Planner/Attendance above which also grant admin equal visibility. An
-- employee can only ever see and flip the status of their own assigned task,
-- never its title/notes, never anyone else's, never create/delete one.
CREATE POLICY "authenticated select daily tasks own or MD" ON sks_daily_tasks
  FOR SELECT TO authenticated USING (assignee_id = sks_my_id() OR sks_has_role('owner'));
CREATE POLICY "authenticated insert daily tasks MD only" ON sks_daily_tasks
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner'));
CREATE POLICY "authenticated update daily tasks own status or MD" ON sks_daily_tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = sks_my_id() OR sks_has_role('owner'))
  WITH CHECK (assignee_id = sks_my_id() OR sks_has_role('owner'));
CREATE POLICY "authenticated delete daily tasks MD only" ON sks_daily_tasks
  FOR DELETE TO authenticated USING (sks_has_role('owner'));

-- ─── sks_documents / sks_document_versions ──────────────────────────────────
CREATE POLICY "authenticated select documents on visible projects" ON sks_documents
  FOR SELECT TO authenticated USING (project_id IS NULL OR sks_can_see_project(project_id));
CREATE POLICY "authenticated write documents on visible projects" ON sks_documents
  FOR INSERT TO authenticated WITH CHECK (project_id IS NULL OR sks_can_see_project(project_id));
CREATE POLICY "authenticated update documents on visible projects" ON sks_documents
  FOR UPDATE TO authenticated
  USING (project_id IS NULL OR sks_can_see_project(project_id))
  WITH CHECK (project_id IS NULL OR sks_can_see_project(project_id));

CREATE POLICY "authenticated select document versions" ON sks_document_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write document versions" ON sks_document_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── sks_notifications / sks_push_subscriptions ─────────────────────────────
CREATE POLICY "authenticated select own notifications" ON sks_notifications
  FOR SELECT TO authenticated USING (user_id = sks_my_id());
CREATE POLICY "authenticated update own notifications" ON sks_notifications
  FOR UPDATE TO authenticated USING (user_id = sks_my_id()) WITH CHECK (user_id = sks_my_id());
-- Any signed-in user can notify any other signed-in user (assigning an
-- appointment/task, an MD approval, etc.) — same "true" write-check already
-- used for sks_site_visits/sks_requirements/sks_document_versions. SELECT
-- stays locked to the recipient's own rows, so this only ever lets someone
-- create a notification for someone else, never read one.
CREATE POLICY "authenticated insert notifications" ON sks_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated select own push subscriptions" ON sks_push_subscriptions
  FOR SELECT TO authenticated USING (user_id = sks_my_id());
CREATE POLICY "authenticated write own push subscriptions" ON sks_push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = sks_my_id());
CREATE POLICY "authenticated delete own push subscriptions" ON sks_push_subscriptions
  FOR DELETE TO authenticated USING (user_id = sks_my_id());

-- ─── sks_audit_log ───────────────────────────────────────────────────────────
CREATE POLICY "authenticated select audit log on visible projects" ON sks_audit_log
  FOR SELECT TO authenticated USING (project_id IS NULL OR sks_can_see_project(project_id));
CREATE POLICY "authenticated write audit log" ON sks_audit_log
  FOR INSERT TO authenticated WITH CHECK (project_id IS NULL OR sks_can_see_project(project_id));

-- ─── sks_integration_settings ────────────────────────────────────────────────
-- Single global config — any authenticated user can read it, only owner sets it.
CREATE POLICY "authenticated select integration settings" ON sks_integration_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write integration settings owner only" ON sks_integration_settings
  FOR INSERT TO authenticated WITH CHECK (sks_has_role('owner'));
CREATE POLICY "authenticated update integration settings owner only" ON sks_integration_settings
  FOR UPDATE TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

-- ─── sks_personal_* ──────────────────────────────────────────────────────────
-- Personal Finance is Owner-only — never visible to any other role (Finance Rule 1).
CREATE POLICY "authenticated all personal accounts owner only" ON sks_personal_accounts
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated all personal categories owner only" ON sks_personal_categories
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated all personal subcategories owner only" ON sks_personal_subcategories
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated all personal transactions owner only" ON sks_personal_transactions
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated all personal commitments owner only" ON sks_personal_commitments
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated all personal plans owner only" ON sks_personal_plans
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

CREATE POLICY "authenticated all personal investments owner only" ON sks_personal_investments
  FOR ALL TO authenticated USING (sks_has_role('owner')) WITH CHECK (sks_has_role('owner'));

-- ===== PART 3: pc-send-quotation-to-client.sql =====
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
