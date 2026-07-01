"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProjects } from "@/lib/projects";
import {
  getChannels,
  getConversations,
  getWorkspaceMembersForChat,
  dmCounterpart,
} from "@/lib/chat";

export type SearchMessageHit = {
  kind: "message";
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  where: string;
  href: string;
};

export type SearchTaskHit = {
  kind: "task";
  id: string;
  title: string;
  description: string | null;
  projectName: string;
  href: string;
};

export type SearchChannelHit = {
  kind: "channel";
  id: string;
  name: string;
  subtitle: string;
  href: string;
};

export type SearchDmHit = {
  kind: "dm";
  id: string;
  name: string;
  subtitle: string;
  href: string;
};

export type SearchPersonHit = {
  kind: "person";
  id: string;
  name: string;
  subtitle: string;
  href: string;
};

export type SearchProjectHit = {
  kind: "project";
  id: string;
  name: string;
  subtitle: string;
  href: string;
};

export type SearchHit =
  | SearchMessageHit
  | SearchTaskHit
  | SearchChannelHit
  | SearchDmHit
  | SearchPersonHit
  | SearchProjectHit;

export type SearchResults = {
  channels: SearchChannelHit[];
  dms: SearchDmHit[];
  people: SearchPersonHit[];
  projects: SearchProjectHit[];
  tasks: SearchTaskHit[];
  messages: SearchMessageHit[];
};

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

const EMPTY: SearchResults = {
  channels: [],
  dms: [],
  people: [],
  projects: [],
  tasks: [],
  messages: [],
};

// Broad, partial-match search across everything the user can reach in a
// workspace: groups (channels), DMs, people, projects, tasks, and messages.
// Message bodies use a case-insensitive LIKE (not tsvector) so partial words
// match as the user types. Reused by the header command palette.
export async function searchWorkspace(
  workspaceId: string,
  rawQuery: string,
): Promise<SearchResults> {
  const user = await requireUser();
  const query = rawQuery.trim();
  if (query.length < 1) return EMPTY;

  const supabase = await createClient();
  const q = query.toLowerCase();
  const like = `%${escapeLike(query)}%`;

  // These local collections come from cached, RLS-filtered loaders; filter
  // in-memory for partial matches on names/people (cheap, already fetched).
  const [channels, conversations, members, projects] = await Promise.all([
    getChannels(workspaceId),
    getConversations(workspaceId),
    getWorkspaceMembersForChat(workspaceId),
    getProjects(workspaceId),
  ]);

  const channelHits: SearchChannelHit[] = channels
    .filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 8)
    .map((c) => ({
      kind: "channel",
      id: c.id,
      name: c.name,
      subtitle: c.description || "Group",
      href: `/w/${workspaceId}/c/${c.id}`,
    }));

  const dmHits: SearchDmHit[] = conversations
    .map((conv) => {
      if (conv.is_group) {
        const names = conv.conversation_participants
          .map((p) => p.profiles?.full_name ?? p.profiles?.email ?? "")
          .filter(Boolean);
        const label = names.join(", ");
        return { conv, label, subtitle: "Group message" };
      }
      const other = dmCounterpart(conv, user.id);
      const label = other?.full_name ?? other?.email ?? "Direct message";
      return { conv, label, subtitle: "Direct message" };
    })
    .filter(({ label }) => label.toLowerCase().includes(q))
    .slice(0, 8)
    .map(({ conv, label, subtitle }) => ({
      kind: "dm",
      id: conv.id,
      name: label,
      subtitle,
      href: `/w/${workspaceId}/dm/${conv.id}`,
    }));

  const peopleHits: SearchPersonHit[] = members
    .filter(
      (p) =>
        (p.full_name?.toLowerCase().includes(q) ?? false) ||
        p.email.toLowerCase().includes(q) ||
        (p.title?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 8)
    .map((p) => ({
      kind: "person",
      id: p.id,
      name: p.full_name ?? p.email,
      subtitle: p.title || p.email,
      href: `/w/${workspaceId}/members`,
    }));

  const projectHits: SearchProjectHit[] = projects
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    )
    .slice(0, 8)
    .map((p) => ({
      kind: "project",
      id: p.id,
      name: p.name,
      subtitle: p.description || "Project",
      href: `/w/${workspaceId}/projects/${p.id}`,
    }));

  const projectIds = projects.map((p) => p.id);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  const channelNameById = new Map(channels.map((c) => [c.id, c.name]));

  const messagesP = supabase
    .from("messages")
    .select(
      "id, body, created_at, channel_id, conversation_id, profiles:profiles!messages_user_id_fkey(full_name, email)",
    )
    .eq("workspace_id", workspaceId)
    .eq("kind", "user")
    .is("deleted_at", null)
    .ilike("body", like)
    .order("created_at", { ascending: false })
    .limit(20);

  const tasksP =
    projectIds.length > 0
      ? supabase
          .from("tasks")
          .select("id, title, description, project_id")
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .or(`title.ilike.${like},description.ilike.${like}`)
          .order("updated_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: null });

  const [{ data: msgs }, { data: tasksData }] = await Promise.all([
    messagesP,
    tasksP,
  ]);

  type MsgRow = {
    id: string;
    body: string;
    created_at: string;
    channel_id: string | null;
    conversation_id: string | null;
    profiles: { full_name: string | null; email: string } | null;
  };
  type TaskRow = {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
  };

  const messageRows = (msgs as unknown as MsgRow[] | null) ?? [];
  const taskRows = (tasksData as unknown as TaskRow[] | null) ?? [];

  const messages: SearchMessageHit[] = messageRows.map((m) => ({
    kind: "message",
    id: m.id,
    body: m.body,
    createdAt: m.created_at,
    authorName: m.profiles?.full_name ?? m.profiles?.email ?? "Unknown",
    where: m.channel_id
      ? `# ${channelNameById.get(m.channel_id) ?? "group"}`
      : "Direct message",
    href: m.channel_id
      ? `/w/${workspaceId}/c/${m.channel_id}`
      : `/w/${workspaceId}/dm/${m.conversation_id}`,
  }));

  const tasks: SearchTaskHit[] = taskRows.map((t) => ({
    kind: "task",
    id: t.id,
    title: t.title,
    description: t.description,
    projectName: projectNameById.get(t.project_id) ?? "Project",
    href: `/w/${workspaceId}/projects/${t.project_id}`,
  }));

  return {
    channels: channelHits,
    dms: dmHits,
    people: peopleHits,
    projects: projectHits,
    tasks,
    messages,
  };
}
