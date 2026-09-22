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
