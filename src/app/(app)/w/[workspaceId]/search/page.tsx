import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/projects";
import type {
  Channel,
  Conversation,
  Message,
  Profile,
  Task,
} from "@/lib/supabase/types";

type MessageHit = Message & {
  profiles: Profile | null;
  channels: Pick<Channel, "id" | "name"> | null;
  conversations: Pick<Conversation, "id"> | null;
};

type TaskHit = Task & {
  projects: { id: string; name: string } | null;
};

// messages.user_id and messages.pinned_by both reference profiles, so the
// sender embed must name the FK explicitly or it resolves to null.
const MESSAGE_SELECT =
  "*, profiles:profiles!messages_user_id_fkey(*), channels(id, name), conversations(id)";

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/w/[workspaceId]/search">) {
  const { workspaceId } = await params;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  await requireUser();

  let messageHits: MessageHit[] = [];
  let taskHits: TaskHit[] = [];

  if (query.length >= 2) {
    const supabase = await createClient();

    // Case-insensitive partial match so typing a fragment surfaces results
    // (tsvector only matches whole word stems, which misses partial queries).
    const like = `%${escapeLike(query)}%`;
    const messagesP = supabase
      .from("messages")
      .select(MESSAGE_SELECT)
      .eq("workspace_id", workspaceId)
      .eq("kind", "user")
      .is("deleted_at", null)
      .ilike("body", like)
      .order("created_at", { ascending: false })
      .limit(50);

    // Tasks have no tsvector — scope to accessible projects (RLS-filtered) and
    // match title/description with a case-insensitive LIKE.
    const projects = await getProjects(workspaceId);
    const projectIds = projects.map((p) => p.id);

    const tasksP =
      projectIds.length > 0
        ? supabase
            .from("tasks")
            .select("*, projects(id, name)")
            .in("project_id", projectIds)
            .is("deleted_at", null)
            .or(`title.ilike.${like},description.ilike.${like}`)
            .order("updated_at", { ascending: false })
            .limit(50)
        : null;

    const [{ data: msgs }, tasksRes] = await Promise.all([
      messagesP,
      tasksP ?? Promise.resolve({ data: null }),
    ]);

    messageHits = (msgs as unknown as MessageHit[] | null) ?? [];
    taskHits = (tasksRes.data as unknown as TaskHit[] | null) ?? [];
  }

  const total = messageHits.length + taskHits.length;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Search</h1>
        <p className="mt-1 text-muted">
          Find messages and tasks across the workspace you can access.
        </p>
      </header>

      <form className="mb-6">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Search messages and tasks…"
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
        </div>
      </form>

      {query.length >= 2 && (
        <p className="mb-3 text-xs text-muted">
          {total} result{total === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
        </p>
      )}

      {taskHits.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Tasks
          </h2>
          <div className="space-y-2">
            {taskHits.map((t) => (
              <Link
                key={t.id}
                href={`/w/${workspaceId}/projects/${t.project_id}`}
                className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-2"
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  <span>in {t.projects?.name ?? "Project"}</span>
                  {t.due_date && (
                    <>
                      <span>·</span>
                      <span>
                        due {new Date(t.due_date).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {t.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {messageHits.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Messages
          </h2>
          <div className="space-y-2">
            {messageHits.map((m) => {
              const href = m.channel_id
                ? `/w/${workspaceId}/c/${m.channel_id}`
                : `/w/${workspaceId}/dm/${m.conversation_id}`;
              const where = m.channels?.name
                ? `# ${m.channels.name}`
                : "Direct message";
              return (
                <Link
                  key={m.id}
                  href={href}
                  className="block rounded-xl border border-border bg-surface p-4 hover:bg-surface-2"
                >
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-foreground">
                      {m.profiles?.full_name ?? m.profiles?.email ?? "Unknown"}
                    </span>
                    <span>in {where}</span>
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground">{m.body}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {query.length >= 2 && total === 0 && (
        <p className="text-sm text-muted">Nothing matched your search.</p>
      )}
    </div>
  );
}
