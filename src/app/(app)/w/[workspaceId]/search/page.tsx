import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Channel, Conversation, Message, Profile } from "@/lib/supabase/types";

type Hit = Message & {
  profiles: Profile | null;
  channels: Pick<Channel, "id" | "name"> | null;
  conversations: Pick<Conversation, "id"> | null;
};

export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/w/[workspaceId]/search">) {
  const { workspaceId } = await params;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  await requireUser();

  let hits: Hit[] = [];
  if (query.length >= 2) {
    const supabase = await createClient();
    // websearch_to_tsquery handles quoted phrases and operators safely.
    const { data } = await supabase
      .from("messages")
      .select(
        "*, profiles(*), channels(id, name), conversations(id)",
      )
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .textSearch("body_tsv", query, { type: "websearch", config: "english" })
      .order("created_at", { ascending: false })
      .limit(50);
    hits = (data as unknown as Hit[] | null) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Search</h1>
        <p className="mt-1 text-muted">
          Find messages across groups and direct messages you can access.
        </p>
      </header>

      <form className="mb-6">
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            autoFocus
            placeholder="Search messages…"
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
          {hits.length} result{hits.length === 1 ? "" : "s"} for &ldquo;{query}
          &rdquo;
        </p>
      )}

      <div className="space-y-2">
        {hits.map((m) => {
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

      {query.length >= 2 && hits.length === 0 && (
        <p className="text-sm text-muted">No messages matched your search.</p>
      )}
    </div>
  );
}
