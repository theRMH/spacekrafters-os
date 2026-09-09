export type UserRole = 'owner' | 'sales' | 'site_engineer' | 'cold_call_leader' | 'production_admin' | 'production_manager'

export type ProjectStage =
  | 'lead_created'
  | 'requirement_collected'
  | 'site_visit_assigned'
  | 'site_visit_completed'
  | 'quotation_created'
  | 'quotation_approved'
  | 'order_confirmed'
  | 'production_released'
  | 'production_started'
  | 'packing_completed'
  | 'dispatch_ready'
  | 'delivered'
  | 'installation_completed'

export const STAGE_PROGRESS: Record<ProjectStage, number> = {
  lead_created: 5,
  requirement_collected: 10,
  site_visit_assigned: 15,
  site_visit_completed: 20,
  quotation_created: 30,
  quotation_approved: 40,
  order_confirmed: 50,
  production_released: 60,
  production_started: 65,
  packing_completed: 75,
  dispatch_ready: 85,
  delivered: 90,
  installation_completed: 100,
}

export const STAGE_LABELS: Record<ProjectStage, string> = {
  lead_created: 'Lead Created',
  requirement_collected: 'Requirement Collected',
  site_visit_assigned: 'Site Visit Assigned',
  site_visit_completed: 'Site Visit Completed',
  quotation_created: 'Quotation Created',
  quotation_approved: 'Quotation Approved',
  order_confirmed: 'Order Confirmed',
  production_released: 'Production Released',
  production_started: 'Production Started',
  packing_completed: 'Packing Completed',
  dispatch_ready: 'Dispatch Ready',
  delivered: 'Delivered',
  installation_completed: 'Installation Completed',
}

export interface Role {
  id: string
  name: UserRole
  display_name: string
}

export interface User {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export type LeadStatus = 'new' | 'contacted' | 'interested' | 'not_interested' | 'converted' | 'lost'
export type LeadSource = 'referral' | 'walk_in' | 'cold_call' | 'instagram' | 'facebook' | 'website' | 'other'

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  not_interested: 'Not Interested',
  converted: 'Converted',
  lost: 'Lost',
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  interested: 'bg-green-100 text-green-700',
  not_interested: 'bg-red-100 text-red-700',
  converted: 'bg-purple-100 text-purple-700',
  lost: 'bg-slate-100 text-slate-600',
}

export interface Lead {
  id: string
  client_name: string
  phone: string
  email: string | null
  address: string | null
  product_interest: string | null
  source: LeadSource | null
  status: LeadStatus
  notes: string | null
  owner_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  owner?: User
  created_by_user?: User
}

export interface Project {
  id: string
  lead_id: string | null
  client_name: string
  phone: string
  email: string | null
  address: string | null
  project_name: string
  product_type: string | null
  profile_brand: string | null
  current_stage: ProjectStage
  progress_percent: number
  order_value: number
  total_sqft: number | null
  advance_paid: number
  balance_amount: number
  payment_status: 'pending' | 'partial' | 'paid'
  installation_status: 'pending' | 'scheduled' | 'in_progress' | 'completed'
  promised_delivery_date: string | null
  order_confirmed_at: string | null
  completed_at: string | null
  is_imported: boolean
  owner_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  owner?: User
}

export interface ActivityHistory {
  id: string
  entity_type: 'lead' | 'project' | 'quotation' | 'payment' | 'site_visit'
  entity_id: string
  action: string
  description: string
  performed_by: string | null
  created_at: string
  user?: User
}

export interface QuotationLineItem {
  description: string
  qty: number
  unit: string
  rate: number
  amount: number
}

export interface Quotation {
  id: string
  project_id: string
  version: number
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'superseded'
  line_items: QuotationLineItem[]
  subtotal: number
  discount_percent: number
  discount_amount: number
  tax_percent: number
  tax_amount: number
  total_amount: number
  total_sqft: number | null
  notes: string | null
  terms: string | null
  valid_until: string | null
  created_by: string | null
  approved_by: string | null
  rejected_by: string | null
  rejection_reason: string | null
  approved_at: string | null
  rejected_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type QuotationStatus = Quotation['status']

export interface SiteVisit {
  id: string
  project_id: string | null
  lead_id: string | null
  assigned_engineer_id: string | null
  scheduled_date: string
  actual_date: string | null
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
  address: string | null
  gps_lat: number | null
  gps_lng: number | null
  notes: string | null
  measurements_taken: boolean
  measurement_notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  engineer?: User
  project?: Project
}

export interface Payment {
  id: string
  project_id: string
  amount: number
  payment_mode: 'cash' | 'upi' | 'bank_transfer' | 'cheque' | 'other'
  reference: string | null
  notes: string | null
  recorded_by: string | null
  payment_date: string
  created_at: string
  project?: Project
}
