import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CLEOTILDA_VIA } from "@/lib/cleotilda-shared";

// Cleotilda - the workspace AI assistant, powered by Kimi (Moonshot AI's
// OpenAI-compatible API). Triggered when a message mentions @cleotilda; it can
// create tasks, look up projects/members, and always replies into the room via
// the cleotilda_post_message RPC.

export const CLEOTILDA_ID = "c1e0711d-a000-4000-a000-000000000001";
export const CLEOTILDA_HANDLE = "cleotilda";

const KIMI_URL =
  process.env.KIMI_BASE_URL?.replace(/\/$/, "") ?? "https://api.moonshot.ai/v1";
const MODEL = process.env.KIMI_MODEL ?? "moonshot-v1-auto";

export function cleotildaEnabled(): boolean {
  return !!process.env.KIMI_API_KEY;
}

type RoomTarget = {
  workspaceId: string;
  channelId?: string;
  conversationId?: string;
};

type SbClient = Awaited<ReturnType<typeof createClient>>;

// OpenAI-compatible chat types (the subset Kimi uses).
type ChatToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_projects",
      description:
        "List the projects in this workspace with their id, name, status and kanban columns. Call this before creating a task so you can pick the right project (and column) by name.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_members",
      description:
        "List workspace members with their id, name and email. Call this when you need to resolve a person's name to assign a task.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_dm",
      description:
        "Send a direct message to a workspace member on behalf of the requesting user. The message is delivered into the 1:1 DM between the requester and that member, posted by you (Cleotilda) with attribution. Call list_members first to resolve the person's name to a member_id.",
      parameters: {
        type: "object",
        properties: {
          member_id: {
            type: "string",
            description: "Profile id of the recipient, from list_members",
          },
          message: { type: "string", description: "The message text to send" },
        },
        required: ["member_id", "message"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description:
        "Create a new project (kanban board) in this workspace. The requester becomes the owner automatically. Use member_ids (from list_members) only when the user names people to add.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Project name" },
          description: { type: "string", description: "Optional short description" },
          priority: {
            type: "string",
            enum: ["none", "low", "medium", "high", "urgent"],
            description: "Project priority, defaults to none",
          },
          member_ids: {
            type: "array",
            items: { type: "string" },
            description: "Profile ids from list_members to add as project members",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_group",
      description:
        "Create a new group (chat channel) in this workspace. The requester becomes a member automatically. Use member_ids (from list_members) only when the user names people to add.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Group name, short and lowercase like a Slack channel",
          },
          description: { type: "string", description: "Optional topic description" },
          member_ids: {
            type: "array",
            items: { type: "string" },
            description: "Profile ids from list_members to add to the group",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description:
        "Create a task on a project's board. Call list_projects first to get a valid project_id (and optionally a column_id - if omitted the task lands in the project's first column). Use assignee_ids only with ids from list_members.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Project id from list_projects" },
          title: { type: "string", description: "Short task title" },
          description: { type: "string", description: "Optional longer detail" },
          column_id: {
            type: "string",
            description: "Kanban column id from list_projects; omit for the first column",
          },
          priority: {
            type: "string",
            enum: ["none", "low", "medium", "high", "urgent"],
            description: "Task priority, defaults to none",
          },
          due_date: {
            type: "string",
            description: "Due date as YYYY-MM-DD, omit if not mentioned",
          },
          assignee_ids: {
            type: "array",
            items: { type: "string" },
            description: "Profile ids from list_members to assign",
          },
        },
        required: ["project_id", "title"],
      },
    },
  },
];

async function runTool(
  supabase: SbClient,
  target: RoomTarget,
  userId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "list_projects") {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, status, kanban_columns(id, name, position)")
      .eq("workspace_id", target.workspaceId)
      .is("deleted_at", null);
    return JSON.stringify(projects ?? []);
  }

  if (name === "list_members") {
    const { data: rows } = await supabase
      .from("workspace_members")
      .select("profiles(id, full_name, email)")
      .eq("workspace_id", target.workspaceId)
      .is("deleted_at", null);
    const members = (rows ?? []).map((r) => r.profiles).filter(Boolean);
    return JSON.stringify(members);
  }

  if (name === "create_project") {
    const projectName = String(input.name ?? "").trim();
    if (projectName.length < 2) {
      return JSON.stringify({ error: "project name must be at least 2 characters" });
    }
    const priorities = ["none", "low", "medium", "high", "urgent"] as const;
    const priority = priorities.includes(
      input.priority as (typeof priorities)[number],
    )
      ? (input.priority as (typeof priorities)[number])
      : "none";
    const memberIds = Array.isArray(input.member_ids)
      ? (input.member_ids as string[]).filter((id) => id !== CLEOTILDA_ID).slice(0, 20)
      : [];

    const { data: projectId, error } = await supabase.rpc("create_project", {
      p_workspace_id: target.workspaceId,
      p_name: projectName,
      p_description: String(input.description ?? "") || undefined,
      p_priority: priority,
      p_member_ids: memberIds,
    });
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ ok: true, project_id: projectId, name: projectName });
  }

  if (name === "create_group") {
    const groupName = String(input.name ?? "")
      .trim()
      .replace(/^#/, "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (groupName.length < 2) {
      return JSON.stringify({ error: "group name must be at least 2 characters" });
    }
    const memberIds = Array.isArray(input.member_ids)
      ? (input.member_ids as string[]).filter((id) => id !== CLEOTILDA_ID).slice(0, 50)
      : [];

    const { data: channelId, error } = await supabase.rpc("create_channel", {
      p_workspace_id: target.workspaceId,
      p_name: groupName,
      p_description: String(input.description ?? "") || undefined,
      p_member_ids: memberIds,
    });
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ ok: true, channel_id: channelId, name: groupName });
  }

  if (name === "send_dm") {
    const memberId = String(input.member_id ?? "");
    const message = String(input.message ?? "").trim();
    if (!memberId || !message) {
      return JSON.stringify({ error: "member_id and message are required" });
    }
    if (memberId === userId) {
      return JSON.stringify({ error: "cannot DM the requester themselves" });
    }
    if (memberId === CLEOTILDA_ID) {
      return JSON.stringify({ error: "cannot DM Cleotilda" });
    }

    // Open (or reuse) the 1:1 DM between the requester and the recipient.
    const { data: convId, error: dmErr } = await supabase.rpc(
      "get_or_create_dm",
      { p_workspace_id: target.workspaceId, p_other_user_id: memberId },
    );
    if (dmErr || !convId) {
      return JSON.stringify({ error: dmErr?.message ?? "could not open DM" });
    }

    // Sent AS the requesting user (their name/avatar), tagged with the via
    // marker so the UI shows a small "via Cleotilda" logo beside their name.
    const { error: postErr } = await supabase.from("messages").insert({
      workspace_id: target.workspaceId,
      conversation_id: convId,
      user_id: userId,
      body: `${CLEOTILDA_VIA} ${message}`,
    });
    if (postErr) return JSON.stringify({ error: postErr.message });

    return JSON.stringify({ ok: true, conversation_id: convId });
  }

  if (name === "create_task") {
    const projectId = String(input.project_id ?? "");
    const title = String(input.title ?? "").trim();
    if (!projectId || !title) {
      return JSON.stringify({ error: "project_id and title are required" });
    }

    // Resolve target column: given one, or the project's first column.
    let columnId = (input.column_id as string) || null;
    if (!columnId) {
      const { data: col } = await supabase
        .from("kanban_columns")
        .select("id")
        .eq("project_id", projectId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      columnId = col?.id ?? null;
    }

    let position = 1024;
    if (columnId) {
      const { data: last } = await supabase
        .from("tasks")
        .select("position")
        .eq("column_id", columnId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (last?.position ?? 0) + 1024;
    }

    const priorities = ["none", "low", "medium", "high", "urgent"] as const;
    const priority = priorities.includes(
      input.priority as (typeof priorities)[number],
    )
      ? (input.priority as (typeof priorities)[number])
      : "none";
    const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.due_date ?? ""))
      ? String(input.due_date)
      : null;

    // created_by is the requesting user (RLS: created_by = auth.uid()); the
    // task is attributed to whoever asked Cleotilda for it.
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        column_id: columnId,
        title,
        description: String(input.description ?? "") || null,
        priority,
        due_date: dueDate,
        position,
        created_by: userId,
      })
      .select("id, title")
      .single();

    if (error) return JSON.stringify({ error: error.message });

    const assigneeIds = Array.isArray(input.assignee_ids)
      ? (input.assignee_ids as string[]).slice(0, 10)
      : [];
    if (assigneeIds.length > 0 && task) {
      await supabase.from("task_assignees").insert(
        assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid })),
      );
    }

    return JSON.stringify({ ok: true, task_id: task?.id, title: task?.title });
  }

  return JSON.stringify({ error: `unknown tool: ${name}` });
}

async function kimiChat(messages: ChatMessage[]): Promise<{
  content: string | null;
  tool_calls?: ChatToolCall[];
}> {
  const res = await fetch(`${KIMI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.KIMI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      // Large enough to hold a big batch of tool calls in one response (e.g.
      // "create 20 tasks" emits 20 create_task calls at once). At 1024 the
      // response was truncated mid-JSON, corrupting a call's arguments so the
      // tool saw empty input and reported a bogus "project_id/title required".
      max_tokens: 8192,
      // No temperature: kimi-k2.x models reject anything but the default.
      messages,
      tools: TOOLS,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Kimi API ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content: string | null; tool_calls?: ChatToolCall[] } }[];
  };
  const msg = data.choices?.[0]?.message;
  return { content: msg?.content ?? null, tool_calls: msg?.tool_calls };
}

const RULES = (
  today: string,
) => `- Be brief and friendly, like a helpful coworker on chat. A few sentences at most.
- You have tools that ACT: create_project (new kanban board), create_group (new chat channel), create_task (work item on a project), send_dm (message a member), plus list_projects and list_members for lookups. Use them to actually do things instead of describing how the user could do them. Never say you can't create something that one of your tools creates.
- Pick the right tool: "make/create a project X" means create_project. "Make a group/channel X" means create_group. "Send a message to X" / "X ko msg karo" means send_dm. Only create_task when they ask for a task, todo, or work item.
- Call list_projects before create_task (real project id), and list_members before send_dm or adding/assigning people by name.
- When you act, confirm in one line what you did (project/group created, task created on which project, message sent to whom).
- If the request is ambiguous (e.g. multiple matching projects or people), ask one short clarifying question instead of guessing.
- If something is truly outside your tools (deleting things, editing settings), say so briefly.
- Today's date is ${today}. Resolve relative dates like "tomorrow" or "Friday" to YYYY-MM-DD yourself.
- Write in the language the user wrote in.`;

// Direct 1:1 chat with Cleotilda (the assistant panel). The caller supplies
// the running conversation; nothing is posted to any room - the reply is
// returned to render in the panel. Same tools as the in-room assistant.
// `mutated` tells the caller whether any create/send tool actually ran, so
// the UI can refresh server-rendered data (sidebar lists etc.).
export async function chatWithCleotilda(args: {
  workspaceId: string;
  userId: string;
  userName: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<{ reply: string; mutated: boolean }> {
  if (!cleotildaEnabled()) {
    return {
      reply: "Cleotilda isn't configured yet (missing API key).",
      mutated: false,
    };
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are Cleotilda, the built-in AI teammate of TasKing, a team collaboration app (chat + kanban projects). You are chatting 1:1 with ${args.userName} in your assistant panel.

Rules:
${RULES(today)}`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...args.history.slice(-16).map((m): ChatMessage =>
      m.role === "user"
        ? { role: "user", content: m.content }
        : { role: "assistant", content: m.content },
    ),
  ];

  const target: RoomTarget = { workspaceId: args.workspaceId };
  const MUTATING = new Set(["create_project", "create_group", "create_task", "send_dm"]);

  let reply = "";
  let mutated = false;
  for (let i = 0; i < 10; i++) {
    const msg = await kimiChat(messages);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      reply = (msg.content ?? "").trim();
      break;
    }

    messages.push({
      role: "assistant",
      content: msg.content,
      tool_calls: msg.tool_calls,
    });

    for (const tc of msg.tool_calls) {
      let input: Record<string, unknown> | null = null;
      try {
        input = JSON.parse(tc.function.arguments || "{}");
      } catch {
        // Malformed arguments (usually a truncated batch) - tell the model so
        // it retries this call instead of running with empty input and
        // surfacing a misleading "field required" error.
      }
      const result =
        input === null
          ? JSON.stringify({
              error:
                "your tool call arguments were malformed or truncated; retry this call by itself",
            })
          : await runTool(
              supabase,
              target,
              args.userId,
              tc.function.name,
              input,
            );
      if (MUTATING.has(tc.function.name) && result.includes('"ok":true')) {
        mutated = true;
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  return {
    reply: reply || "Sorry, I couldn't finish that one. Try rephrasing?",
    mutated,
  };
}

// Fire-and-forget entry point. Called from sendMessage after the user's
// message lands; posts Cleotilda's reply into the same room via RPC (realtime
// then delivers it to everyone). Never throws - assistant failures must not
// break normal messaging.
export async function respondAsCleotilda(args: {
  target: RoomTarget;
  userId: string;
  userName: string;
  prompt: string;
}): Promise<void> {
  try {
    if (!cleotildaEnabled()) return;
    const supabase = await createClient();

    // Recent room context so follow-ups ("make a task for that") make sense.
    let historyQuery = supabase
      .from("messages")
      .select("body, user_id, kind, sender:profiles!messages_user_id_fkey(full_name)")
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    historyQuery = args.target.channelId
      ? historyQuery.eq("channel_id", args.target.channelId)
      : historyQuery.eq("conversation_id", args.target.conversationId ?? "");
    const { data: history } = await historyQuery;

    type HistoryRow = {
      body: string;
      user_id: string;
      kind: string;
      sender: { full_name: string | null } | null;
    };
    const transcript = ((history as HistoryRow[] | null) ?? [])
      .reverse()
      .filter((m) => m.kind === "user")
      .map((m) => {
        const who =
          m.user_id === CLEOTILDA_ID
            ? "Cleotilda"
            : (m.sender?.full_name ?? "Someone");
        return `${who}: ${m.body}`;
      })
      .join("\n");

    const today = new Date().toISOString().slice(0, 10);

    const system = `You are Cleotilda, the built-in AI teammate of TasKing, a team collaboration app (chat + kanban projects). You are talking inside a chat room; your reply is posted as a normal chat message visible to the room.

Rules:
${RULES(today)}`;

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: `Recent conversation:\n${transcript}\n\n${args.userName} just said (mentioning you): ${args.prompt}`,
      },
    ];

    // Small manual tool loop, capped so a confused model can't spin.
    let reply = "";
    for (let i = 0; i < 10; i++) {
      const msg = await kimiChat(messages);

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        reply = (msg.content ?? "").trim();
        break;
      }

      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        let input: Record<string, unknown> | null = null;
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // Malformed arguments (usually a truncated batch) - tell the model so
          // it retries this call instead of running with empty input and
          // surfacing a misleading "field required" error.
        }
        const result =
          input === null
            ? JSON.stringify({
                error:
                  "your tool call arguments were malformed or truncated; retry this call by itself",
              })
            : await runTool(
                supabase,
                args.target,
                args.userId,
                tc.function.name,
                input,
              );
        messages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
    }

    if (!reply) reply = "Sorry, I couldn't finish that one. Try rephrasing?";

    await supabase.rpc("cleotilda_post_message", {
      p_body: reply,
      p_channel_id: args.target.channelId ?? undefined,
      p_conversation_id: args.target.conversationId ?? undefined,
    });
  } catch (err) {
    // Assistant is best-effort; log and swallow.
    console.error("[cleotilda]", err);
  }
}
