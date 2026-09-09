# Spacekrafters Operations Management System

A full-stack OMS built for Spacekrafters — managing the complete fenestration workflow from lead to installation.

## Tech Stack
- **Next.js 16** (App Router, TypeScript)
- **Supabase** (PostgreSQL, Auth, RLS, Storage)
- **Tailwind CSS**

## Features
- Role-based access: Owner, Sales, Site Engineer, Cold Call Leader, Production Admin, Production Manager
- Lead management → Project pipeline → Quotations → Order confirmation
- Production tracking (Kanban board)
- Payment recording & balance tracking
- Installation management
- Telegram notifications
- Activity history on all entities

## Setup
1. Copy `.env.example` to `.env.local` and fill in Supabase credentials
2. Run SQL migrations in `src/lib/supabase/migrations/` in order
3. `npm install && npm run dev`

## Routes
| Route | Access |
|-------|--------|
| `/dashboard` | All roles |
| `/leads` | Owner, Sales, Cold Call Leader |
| `/projects` | Owner, Sales, Site Engineer, Production |
| `/quotations` | Owner, Sales |
| `/site-visits` | Owner, Sales, Site Engineer |
| `/production` | Owner, Production Admin/Manager |
| `/payments` | Owner, Sales |
| `/installation` | Owner, Sales, Site Engineer |
| `/reports` | Owner |
| `/import` | Owner, Production Admin |
| `/users` | Owner |
