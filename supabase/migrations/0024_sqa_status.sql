-- =============================================================================
-- 0024 — SQA Approval column on tasks
--
-- QA sign-off tracked separately from the workflow status: every task is
-- 'pending' until QA picks it up ('in_testing') and approves it ('done').
-- Plain text + check constraint (not an enum) so adding stages later is a
-- one-line migration.
-- =============================================================================

alter table public.tasks
  add column if not exists sqa_status text not null default 'pending'
    check (sqa_status in ('pending', 'in_testing', 'done'));
