"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui";
import {
  attachmentKind,
  measureDimensions,
  uploadOne,
  uploadThumb,
} from "@/lib/attachment-upload";
import type { PriorityLevel, Profile } from "@/lib/supabase/types";
import {
  formatDuration,
  PRIORITY_META,
  PRIORITY_ORDER,
  type TaskDetail,
} from "@/lib/projects-shared";
import { AttachmentView } from "../../chat/attachment-view";
import {
  addChecklist,
  addChecklistItem,
  addComment,
  deleteChecklistItem,
  logTime,
  setTaskCompleted,
  toggleAssignee,
  toggleChecklistItem,
  updateTask,
  type PendingCommentAttachment,
} from "../task-actions";

const DETAIL_SELECT =
  "*, task_assignees(user_id, profiles(*)), task_labels(label_id, labels(*)), task_watchers(user_id), task_attachments(*), task_comments(*, profiles(*), task_comment_attachments(*)), checklists(*, checklist_items(*))";

export function TaskPanel({
  taskId,
  workspaceId,
  meId,
  members,
  onClose,
}: {
  taskId: string;
  workspaceId: string;
  meId: string;
  members: Profile[];
  onClose: () => void;
}) {
  // Keyed by task id so switching tasks shows "Loading…" (stale result from a
  // previous task never renders) without a setState-in-effect reset.
  const [result, setResult] = useState<{
    id: string;
    task: TaskDetail | null;
  } | null>(null);
  const loading = result?.id !== taskId;
  const task = loading ? null : result.task;
  const [, startTransition] = useTransition();

  // task_comment_attachments has no task_id column, only comment_id, so
  // Supabase's server-side filter can't scope events to this task. We keep
  // the set of comment ids for the currently loaded task in a ref and
  // ignore attachment events for other tasks in the handler below.
  const commentIdsRef = useRef<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("tasks")
      .select(DETAIL_SELECT)
      .eq("id", taskId)
      .single();
    const detail = (data as unknown as TaskDetail | null) ?? null;
    commentIdsRef.current = new Set(
      detail?.task_comments?.map((c) => c.id) ?? [],
    );
    setResult({ id: taskId, task: detail });
  }, [taskId]);

  // Initial fetch happens once the realtime subscription is live, so no
  // comment posted in between is missed. Live updates: another member
  // commenting on this task shows up without reopening the panel. A second
  // subscription on task_comment_attachments catches attachment deletes /
  // moderation hides so the updates feed drops them without a reopen.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`task-panel:${taskId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_attachments",
          filter: `task_id=eq.${taskId}`,
        },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comments",
          filter: `task_id=eq.${taskId}`,
        },
        () => void reload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_comment_attachments",
        },
        (payload) => {
          const row =
            (payload.new as { comment_id?: string } | null) ??
            (payload.old as { comment_id?: string } | null);
          const commentId = row?.comment_id;
          if (commentId && commentIdsRef.current.has(commentId)) {
            void reload();
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void reload();
      });
    // Fallback: don't leave the panel on "Loading…" if realtime is slow or
    // blocked - fetch after a beat regardless.
    const fallback = setTimeout(() => void reload(), 800);
    return () => {
      clearTimeout(fallback);
      supabase.removeChannel(channel);
    };
  }, [taskId, reload]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      await reload();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-2xl sm:h-[calc(100%_-_1rem)] sm:self-center sm:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !task ? (
          <div className="grid flex-1 place-items-center text-muted">
            {loading ? "Loading…" : "Task not found."}
          </div>
        ) : (
          <TaskBody
            task={task}
            members={members}
            workspaceId={workspaceId}
            meId={meId}
            onClose={onClose}
            act={act}
          />
        )}
      </div>
    </div>
  );
}

type Tab = "updates" | "details";

function TaskBody({
  task,
  members,
  workspaceId,
  meId,
  act,
  onClose,
}: {
  task: TaskDetail;
  members: Profile[];
  workspaceId: string;
  meId: string;
  onClose: () => void;
  act: (fn: () => Promise<unknown>) => void;
}) {
  const [tab, setTab] = useState<Tab>("updates");
  const [title, setTitle] = useState(task.title);
  const done = task.completed_at != null;

  const comments = task.task_comments
    .filter((c) => !c.deleted_at)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <>
      {/* Header: close + editable title, Monday-style */}
      <div className="shrink-0 border-b border-border px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          {/* Grid-stack auto-grow: the hidden replica sets the height, so the
              textarea wraps long titles fully instead of clipping like the
              old single-line input. */}
          <div className="grid min-w-0 flex-1">
            <span
              aria-hidden
              className="invisible col-start-1 row-start-1 whitespace-pre-wrap wrap-break-word text-xl font-semibold"
            >
              {title || " "}
            </span>
            <textarea
              value={title}
              rows={1}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => {
                if (title.trim() && title !== task.title) {
                  act(() => updateTask(task.id, { title: title.trim() }));
                }
              }}
              className="col-start-1 row-start-1 h-full resize-none overflow-hidden wrap-break-word bg-transparent text-xl font-semibold text-foreground focus:outline-none"
            />
          </div>
          <button
            onClick={() => act(() => setTaskCompleted(task.id, !done))}
            aria-label={done ? "Mark incomplete" : "Mark complete"}
            title={done ? "Completed" : "Mark complete"}
            className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-2.5 ${
              done
                ? "bg-success/10 text-success"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <span
              className={`grid h-4 w-4 place-items-center rounded-full border ${
                done ? "border-success bg-success text-white" : "border-border"
              }`}
            >
              {done && (
                <svg
                  viewBox="0 0 24 24"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
            {/* Label hides below sm - the icon carries the state, and the
                title gets all the horizontal room the header can offer. */}
            <span className="hidden sm:inline">
              {done ? "Completed" : "Mark complete"}
            </span>
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1">
          {(
            [
              {
                id: "updates" as Tab,
                label: "Updates",
                icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
                count: comments.length,
              },
              {
                id: "details" as Tab,
                label: "Details",
                icon: "M4 6h16M4 12h16M4 18h10",
                count: 0,
              },
            ]
          ).map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={t.icon} />
                </svg>
                {t.label}
                {t.count > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary">
                    {t.count}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "updates" ? (
        <UpdatesTab
          task={task}
          comments={comments}
          workspaceId={workspaceId}
          meId={meId}
          act={act}
        />
      ) : (
        <DetailsTab task={task} members={members} act={act} />
      )}
    </>
  );
}

// =============================================================================
// Updates tab: Monday-style composer on top, update cards below.
// =============================================================================

// A file the user picked but hasn't posted yet. Stays entirely local until
// Update is pressed, mirroring the chat composer.
type StagedFile = {
  id: string;
  file: File;
  fileName: string;
  previewUrl?: string;
  width?: number;
  height?: number;
};

function UpdatesTab({
  task,
  comments,
  workspaceId,
  meId,
  act,
}: {
  task: TaskDetail;
  comments: TaskDetail["task_comments"];
  workspaceId: string;
  meId: string;
  act: (fn: () => Promise<unknown>) => void;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function stageFiles(list: FileList | File[]) {
    const next: StagedFile[] = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
    }));
    setStaged((prev) => [...prev, ...next]);
    // Measure image/video dimensions in the background so the persisted rows
    // carry width/height and the AttachmentView reserves the exact box.
    next.forEach((s) => {
      void measureDimensions(s.file).then((dim) => {
        if (dim.width == null || dim.height == null) return;
        setStaged((prev) =>
          prev.map((x) =>
            x.id === s.id ? { ...x, width: dim.width, height: dim.height } : x,
          ),
        );
      });
    });
  }

  function removeStaged(id: string) {
    setStaged((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((s) => s.id !== id);
    });
  }

  async function send() {
    const value = draft.trim();
    if (!value && staged.length === 0) return;

    // Upload every staged file first, then hand the storage paths to the
    // server action. If any upload fails we surface the error and keep the
    // draft so the user can retry - we don't want to persist a comment that
    // references files that never made it.
    setUploadError(null);
    setUploading(true);
    let attachments: PendingCommentAttachment[] = [];
    try {
      const results: (PendingCommentAttachment | null)[] = await Promise.all(
        staged.map(async (s): Promise<PendingCommentAttachment | null> => {
          const kind = attachmentKind(s.file.type);
          const [path, thumbPath] = await Promise.all([
            uploadOne(workspaceId, meId, s.file, s.id, () => {}),
            kind === "image"
              ? uploadThumb(workspaceId, meId, s.file, s.id)
              : null,
          ]);
          if (!path) return null;
          return {
            storagePath: path,
            thumbPath,
            fileName: s.fileName,
            mimeType: s.file.type || null,
            sizeBytes: s.file.size,
            kind,
            width: s.width ?? null,
            height: s.height ?? null,
            durationMs: null,
          };
        }),
      );
      if (results.some((r) => r === null)) {
        setUploadError("One or more files failed to upload. Try again.");
        return;
      }
      attachments = results.filter(
        (r): r is PendingCommentAttachment => r !== null,
      );
    } finally {
      setUploading(false);
    }

    // Revoke previews now that the store owns the uploaded copies.
    staged.forEach((s) => {
      if (s.previewUrl) URL.revokeObjectURL(s.previewUrl);
    });
    setDraft("");
    setStaged([]);
    act(() => addComment(task.id, value, attachments));
  }

  const canSend = (draft.trim().length > 0 || staged.length > 0) && !uploading;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-4 p-5">
        {/* Composer */}
        <div className="rounded-2xl border border-border bg-background shadow-sm transition-all duration-200 focus-within:shadow-md">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            placeholder="Write an update… Share progress or mention a blocker."
            rows={focused || draft ? 4 : 2}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none"
          />

          {/* Staged files (image thumbs + generic tile) */}
          {staged.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border/60 px-3 py-2">
              {staged.map((s) => {
                const kind = attachmentKind(s.file.type);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    {kind === "image" && s.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.previewUrl}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                    ) : kind === "video" && s.previewUrl ? (
                      <video
                        src={s.previewUrl}
                        className="h-8 w-8 shrink-0 rounded object-cover"
                        muted
                      />
                    ) : (
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-surface-2 text-muted">
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      </span>
                    )}
                    <span className="max-w-40 truncate text-foreground">
                      {s.fileName}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStaged(s.id)}
                      aria-label={`Remove ${s.fileName}`}
                      className="grid h-4 w-4 cursor-pointer place-items-center rounded text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {uploadError && (
            <p className="border-t border-border/60 px-3 py-2 text-xs text-danger">
              {uploadError}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Attach file"
                title="Attach file"
                className="grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/*,video/*,application/pdf,application/*"
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    stageFiles(e.target.files);
                  }
                  e.target.value = "";
                }}
                className="hidden"
              />
              <span className="text-[11px] text-muted">
                {uploading ? "Uploading…" : "Ctrl+Enter to post"}
              </span>
            </div>
            <Button onClick={send} disabled={!canSend}>
              {uploading ? "Posting…" : "Update"}
            </Button>
          </div>
        </div>

        {/* Updates feed */}
        {comments.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <p className="text-base font-semibold text-foreground">
              No updates yet
            </p>
            <p className="mt-1 max-w-60 text-sm text-muted">
              Share progress or mention a teammate to get things moving.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-border bg-background p-4"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar
                    name={c.profiles?.full_name}
                    email={c.profiles?.email}
                    avatarUrl={c.profiles?.avatar_url}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.profiles?.full_name ?? c.profiles?.email ?? "Someone"}
                    </p>
                    <p className="text-[11px] text-muted">
                      {formatWhen(c.created_at)}
                    </p>
                  </div>
                </div>
                {c.body && (
                  <p className="mt-2.5 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
                    {c.body}
                  </p>
                )}
                {c.task_comment_attachments &&
                  c.task_comment_attachments.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {c.task_comment_attachments.map((a) => (
                        <AttachmentView key={a.id} attachment={a} />
                      ))}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date.toDateString() === today.toDateString()) return `Today ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${time}`;
  }
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${time}`;
}

// =============================================================================
// Details tab: description + meta + checklists + time tracking.
// =============================================================================

function DetailsTab({
  task,
  members,
  act,
}: {
  task: TaskDetail;
  members: Profile[];
  act: (fn: () => Promise<unknown>) => void;
}) {
  const [description, setDescription] = useState(task.description ?? "");
  const [checklistItem, setChecklistItem] = useState<Record<string, string>>({});
  const [timeInput, setTimeInput] = useState("");
  const assigneeIds = new Set(task.task_assignees.map((a) => a.user_id));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-6 p-5">
        {/* Meta grid: priority + due date */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Priority
            </p>
            <select
              value={task.priority}
              onChange={(e) =>
                act(() =>
                  updateTask(task.id, {
                    priority: e.target.value as PriorityLevel,
                  }),
                )
              }
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Due date
            </p>
            <input
              type="date"
              defaultValue={task.due_date?.slice(0, 10) ?? ""}
              onChange={(e) =>
                act(() =>
                  updateTask(task.id, {
                    dueDate: e.target.value || null,
                  }),
                )
              }
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Assignees */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Assignees
          </p>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const active = assigneeIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => act(() => toggleAssignee(task.id, m.id))}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-2 text-muted hover:text-foreground"
                  }`}
                >
                  {m.full_name ?? m.email}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Description
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description !== (task.description ?? "")) {
                act(() =>
                  updateTask(task.id, {
                    description: description.trim() || null,
                  }),
                );
              }
            }}
            placeholder="Add a description…"
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>

        {task.task_attachments?.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Attachments
            </p>
            <div className="space-y-2">
              {task.task_attachments.map((attachment) => (
                <AttachmentView
                  key={attachment.id}
                  attachment={{
                    ...attachment,
                    thumb_path: null,
                    kind: attachment.mime_type?.startsWith("image/")
                      ? "image"
                      : attachment.mime_type?.startsWith("video/")
                        ? "video"
                        : attachment.mime_type?.startsWith("audio/")
                          ? "voice"
                          : "file",
                    width: null,
                    height: null,
                    duration_ms: null,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Checklists */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Checklists
            </p>
            <button
              onClick={() => act(() => addChecklist(task.id, "Checklist"))}
              className="cursor-pointer text-xs text-primary hover:underline"
            >
              + Add checklist
            </button>
          </div>
          <div className="space-y-3">
            {task.checklists.map((cl) => {
              const total = cl.checklist_items.filter((i) => !i.deleted_at).length;
              const complete = cl.checklist_items.filter(
                (i) => !i.deleted_at && i.is_done,
              ).length;
              return (
                <div
                  key={cl.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {cl.title}{" "}
                    <span className="text-xs text-muted">
                      {complete}/{total}
                    </span>
                  </p>
                  <div className="mt-2 space-y-1">
                    {cl.checklist_items
                      .filter((i) => !i.deleted_at)
                      .map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={item.is_done}
                            onChange={() =>
                              act(() =>
                                toggleChecklistItem(item.id, !item.is_done),
                              )
                            }
                            className="h-4 w-4 rounded border-border"
                          />
                          <span
                            className={`flex-1 text-sm ${
                              item.is_done
                                ? "text-muted line-through"
                                : "text-foreground"
                            }`}
                          >
                            {item.content}
                          </span>
                          <button
                            onClick={() =>
                              act(() => deleteChecklistItem(item.id))
                            }
                            className="cursor-pointer text-xs text-muted hover:text-danger"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                  </div>
                  <input
                    value={checklistItem[cl.id] ?? ""}
                    onChange={(e) =>
                      setChecklistItem((prev) => ({
                        ...prev,
                        [cl.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const value = (checklistItem[cl.id] ?? "").trim();
                        if (value) {
                          setChecklistItem((prev) => ({ ...prev, [cl.id]: "" }));
                          act(() => addChecklistItem(cl.id, value));
                        }
                      }
                    }}
                    placeholder="Add an item…"
                    className="mt-2 w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Time tracking */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Time
          </p>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>Estimate: {formatDuration(task.time_estimate_minutes)}</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={1}
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              placeholder="Minutes"
              className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <Button
              variant="outline"
              onClick={() => {
                const mins = Number(timeInput);
                if (mins > 0) {
                  setTimeInput("");
                  act(() => logTime(task.id, mins));
                }
              }}
            >
              Log time
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
