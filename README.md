# Tasking — Team Collaboration SaaS

Slack-style communication + ClickUp-style project management in one web app.
Built with **Next.js 16 (App Router) + TypeScript + Tailwind v4** on the front,
**Supabase (Postgres, Auth, Storage, Realtime)** on the back.

> Calling/video is intentionally out of scope. The schema and presence are
> designed so it can be layered on later: `presence_status` reserves an
> `in_call` value, and notification/event types leave room for call events.

## Architecture

- The client talks to Supabase **directly** via the SDK for all CRUD + realtime.
- **Row Level Security** is enforced on every table — permissions live in the
  database, not in app code.
- A thin Node/Express layer is reserved for server-only work (invite/notification
  emails, Stripe webhooks, AI). Invite **rows + tokens** are created now; actually
  sending the email is that layer's job.
- No custom WebSocket server — Supabase Realtime (Presence/Broadcast/Postgres
  changes) handles presence, and will handle messaging/typing/notifications.

## Getting started

1. Create a Supabase project at https://supabase.com.
2. Copy env vars:
   ```bash
   cp .env.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
   `NEXT_PUBLIC_SITE_URL` (the service-role key can stay blank until the Node
   layer is added).
3. Run the migration in the Supabase SQL editor (or via the CLI):
   ```
   supabase/migrations/0000_phase0_foundation.sql
   ```
4. In Supabase Auth settings: enable Email + Google providers, and add
   `http://localhost:3000/auth/callback` to the redirect allow-list.
5. Install & run:
   ```bash
   npm install
   npm run dev
   ```

## Phase 0 (this delivery)

- Email/password + Google login, email verification, forgot/reset password.
- Workspace creation, invite by email, accept-invite flow.
- Member profiles (name, email, avatar, role) + presence
  (online/offline/busy/away, `in_call` reserved).
- Presence via Supabase Realtime Presence.
- Slack-style app shell: workspace switcher, sidebar, dashboard, members.
- Dark + light mode, responsive.

### Roadmap

- **Phase 1** — Groups + DMs, realtime chat (edit/delete/pin, reactions,
  threads, mentions, typing, read receipts, search, file sharing).
- **Phase 2** — Projects & tasks; Kanban, List, Calendar views.
- **Phase 3** — Notifications, global search (tsvector), dashboards.

## Key paths

| Path | Purpose |
| --- | --- |
| `src/lib/supabase/client.ts` | Browser Supabase client |
| `src/lib/supabase/server.ts` | Server client (async `cookies()`) |
| `src/proxy.ts` | Session refresh + route gate (Next 16 renamed middleware to proxy) |
| `src/lib/auth.ts` | Data-access helpers (`requireUser`, `getMyWorkspaces`, …) |
| `supabase/migrations/` | SQL schema + RLS |
| `src/app/(auth)/` | Login, signup, password reset |
| `src/app/(app)/w/[workspaceId]/` | Authenticated workspace shell |
