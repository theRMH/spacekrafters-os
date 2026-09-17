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

CREATE POLICY "authenticated update leads" ON sks_leads
  FOR UPDATE TO authenticated
  USING (
    sks_has_role('owner')
    OR (sks_has_role('project_coordinator') AND (owner_id = sks_my_id() OR owner_id IS NULL))
    OR (sks_has_role('site_engineer') AND status = 'site_visit_scheduled')
    OR (sks_has_role('designer') AND status IN ('internally_approved', 'design_in_progress'))
    OR (sks_has_role('accounts') AND status = 'client_approved')
  )
  WITH CHECK (
    sks_has_role('owner')
    OR (sks_has_role('project_coordinator') AND (owner_id = sks_my_id() OR owner_id IS NULL))
    OR sks_has_role('site_engineer') OR sks_has_role('designer') OR sks_has_role('accounts')
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
-- Client-facing transitions (send_to_client / client_approved / revision_requested /
-- rejected) require the send_quotation_client permission, which only 'owner' holds
-- (see src/data/permissions.ts) — the UI hides those actions from qs/project_coordinator,
-- so RLS must enforce the same boundary rather than trusting the client.
CREATE POLICY "authenticated update quotations" ON sks_quotations
  FOR UPDATE TO authenticated
  USING (sks_has_role('owner') OR sks_has_role('qs') OR sks_has_role('project_coordinator'))
  WITH CHECK (
    sks_has_role('owner')
    OR (
      (sks_has_role('qs') OR sks_has_role('project_coordinator'))
      AND status NOT IN ('sent_to_client', 'client_approved', 'revision_requested', 'rejected')
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
