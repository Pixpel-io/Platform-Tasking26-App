-- =============================================================================
-- 0037 — Image attachment thumbnails
--
-- Chat bubbles used to load the full-resolution upload (multi-MB for photos).
-- The composer now also uploads a small WebP thumbnail (client-side canvas
-- downscale) and the bubble renders that instead - the HD original loads only
-- when the viewer is opened. Old attachments have no thumb_path and keep
-- rendering the original.
-- =============================================================================

alter table public.message_attachments
  add column if not exists thumb_path text;
