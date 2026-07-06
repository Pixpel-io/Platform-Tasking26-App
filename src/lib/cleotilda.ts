import "server-only";
import { createClient } from "@/lib/supabase/server";

// Cleotilda - the workspace AI assistant, powered by Kimi (Moonshot AI's
// OpenAI-compatible API). Triggered when a message mentions @cleotilda; it can
// create tasks, look up projects/members, and always replies into the room via
// the cleotilda_post_message RPC.

export const CLEOTILDA_ID = "c1e0711d-a000-4000-a000-000000000001";
export const CLEOTILDA_HANDLE = "cleotilda";

const KIMI_URL =
  process.env.KIMI_BASE_URL?.replace(/\/$/, "") ?? "https://api.moonshot.ai/v1";
const MODEL = process.env.KIMI_MODEL ?? "kimi-k2-turbo-preview";

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
      max_tokens: 1024,
      temperature: 0.3,
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
- Be brief and friendly, like a helpful coworker on chat. A few sentences at most.
- Use the tools to actually do things (create tasks, look up projects/members) instead of describing how the user could do them. Call list_projects before create_task so you use a real project id.
- When you create a task, confirm it in one line: what you created, on which project, and any assignee/due date.
- If the request is ambiguous (e.g. multiple matching projects), ask one short clarifying question instead of guessing.
- If you cannot do something with your tools (you can only create tasks and answer from chat context), say so briefly.
- Today's date is ${today}. Resolve relative dates like "tomorrow" or "Friday" to YYYY-MM-DD yourself.
- Write in the language the user wrote in.`;

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: `Recent conversation:\n${transcript}\n\n${args.userName} just said (mentioning you): ${args.prompt}`,
      },
    ];

    // Small manual tool loop, capped so a confused model can't spin.
    let reply = "";
    for (let i = 0; i < 5; i++) {
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
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // leave input empty; the tool will report what's missing
        }
        const result = await runTool(
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
