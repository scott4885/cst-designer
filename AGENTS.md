# Schedule Template Designer — Development Guide

## Project Overview
Internal web app for dental schedule template creation. See PRD.md for full spec.

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS + shadcn/ui (dark mode default)
- PostgreSQL (local dev, Supabase later)
- Prisma ORM
- exceljs for Excel export
- TanStack Table for schedule grid
- React Hook Form + Zod for forms
- Zustand for state management

## Key Domain Concepts
- **Office**: A dental practice with providers, goals, block types
- **Provider**: Doctor or Hygienist with daily goals, operatories, working hours
- **Block Type**: Schedule slot category (HP, NP, SRP, ER, MP, etc.) with $ minimums
- **Schedule Template**: Generated schedule grid (time × providers) for each weekday
- **Matrixing**: D/A/H staffing codes showing who's in each time slot
- **75% Rule**: 75% of daily goal distributed across block minimums

## Database
- Local PostgreSQL for dev (connection: postgresql://localhost:5432/schedule_designer)
- Prisma for schema + migrations
- See PRD.md Section 5 for full data model

## UI Requirements
- Dark mode by default (Linear/Obsidian aesthetic)
- 3-panel layout: Intake (left) | Grid (center) | Summary (right)
- Color-coded by provider
- Keyboard shortcuts (Cmd+S save, Cmd+G generate, Cmd+E export)

## Testing
- Vitest for unit tests
- Playwright for E2E tests
- Test production calculations, block placement, Excel export format

## Deploy
- Netlify (site will be created)
- PostgreSQL via Supabase (later)
