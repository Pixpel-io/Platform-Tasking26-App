import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CLEOTILDA_VIA, type CleotildaEmailDraft } from "@/lib/cleotilda-shared";
import { listMailAccounts } from "@/lib/mail-server";

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
  inferredSourceMessageId?: string;
  panel?: boolean;
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
      name: "search_workspace",
      description:
        "Search visible tasks and chat messages in the current workspace by a literal phrase. Use this to find context before answering questions like 'where did we discuss X?' or 'is there already a task for X?'.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "A specific phrase, name or keyword to find" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_my_work_summary",
      description:
        "Get the requester's assigned tasks across this workspace, grouped by overdue, due soon, open and completed. Use for daily plans, priorities, workload and 'what should I work on?' questions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_mail_accounts",
      description:
        "List the requester's connected mailboxes. Use this before preparing an email so the user sends from the correct account.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "prepare_email",
      description:
        "Prepare an email for explicit user review in the Cleotilda panel. This DOES NOT send it. Call list_mail_accounts first, then include a complete subject and body. The UI will show a Send email confirmation button.",
      parameters: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Sender mailbox id from list_mail_accounts" },
          to: { type: "string", description: "Recipient email address(es), comma separated" },
          cc: { type: "string", description: "Optional CC address(es), comma separated" },
          subject: { type: "string", description: "Complete email subject" },
          text: { type: "string", description: "Complete plain-text email body" },
        },
        required: ["account_id", "to", "subject", "text"],
      },
    },
  },
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
        "Create a NEW task on a project's board. IMPORTANT: if the user is following up on a task they already created earlier in this conversation (e.g. 'now assign it to Bob', 'change the due date', 'delete that task'), call list_tasks FIRST to find the existing task and then use update_task / assign_task / delete_task instead of creating a new one. Call list_projects first to get a valid project_id (and optionally a column_id - if omitted the task lands in the project's first column). Use assignee_ids only with ids from list_members.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "Project id from list_projects" },
          title: { type: "string", description: "Short task title" },
          description: { type: "string", description: "Optional longer detail" },
          source_message_id: {
            type: "string",
            description:
              "Message id from the recent conversation when this task is based on an issue shared in chat. The complete source message becomes the task description and its attachments are copied to the task.",
          },
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
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description:
        "List tasks in a project so you can pick the right existing task to update, assign, or delete. Call this BEFORE creating a new task when the user's request could plausibly be about a task that already exists. IMPORTANT: `query` is a LITERAL case-insensitive substring match against task titles - it's NOT semantic search. If you want to see every task (e.g. to find duplicates, or when the user's phrasing doesn't map to a title word), OMIT `query` and iterate the full list yourself. Returns each task's id, title, description, priority, due date, completed state, column, and current assignees.",
      parameters: {
        type: "object",
        properties: {
          project_id: {
            type: "string",
            description: "Project id from list_projects",
          },
          query: {
            type: "string",
            description:
              "Optional LITERAL case-insensitive substring that must appear inside a task's title (e.g. 'login' matches 'Login page bug'). Do NOT pass semantic keywords like 'duplicate', 'urgent', or 'overdue' here - those won't be in the title. Omit this to fetch every task on the board.",
          },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description:
        "Update fields on an EXISTING task (title, description, priority, due date, column, completed). Use this - not create_task - when the user asks to change something about a task they already created. Only include the fields the user actually wants changed.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "string",
            description: "Task id from list_tasks",
          },
          title: { type: "string" },
          description: { type: "string" },
          priority: {
            type: "string",
            enum: ["none", "low", "medium", "high", "urgent"],
          },
          due_date: {
            type: "string",
            description:
              "Due date as YYYY-MM-DD, or empty string to clear it",
          },
          column_id: {
            type: "string",
            description: "Kanban column id (to move between columns)",
          },
          completed: {
            type: "boolean",
            description: "true to mark complete, false to reopen",
          },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assign_task",
      description:
        "Add one or more people to an existing task's assignees. Also seats them into the project if they aren't already board members. Use this when the user says 'assign Bob to task X' - do NOT create a new task with assignees for that; find the existing task via list_tasks and then assign it.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          assignee_ids: {
            type: "array",
            items: { type: "string" },
            description: "Profile ids from list_members",
          },
        },
        required: ["task_id", "assignee_ids"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "unassign_task",
      description:
        "Remove one or more people from an existing task's assignees (does not remove them from the board, just this task).",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
          assignee_ids: {
            type: "array",
            items: { type: "string" },
            description: "Profile ids from list_members to unassign",
          },
        },
        required: ["task_id", "assignee_ids"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_task",
      description:
        "Soft-delete an existing task from its board. Only call this when the user explicitly asks to remove or delete a task.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string" },
        },
        required: ["task_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_project_members",
      description:
        "Add one or more people to a project (kanban board) so they can see and work on it. Use this when the user says 'add Alice to the marketing board' - not create_project. Call list_projects and list_members first to resolve names to ids.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          member_ids: {
            type: "array",
            items: { type: "string" },
            description: "Profile ids from list_members to add",
          },
        },
        required: ["project_id", "member_ids"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_project_member",
      description:
        "Remove one person from a project (kanban board). This only removes them from that board - they stay in the workspace and their other boards.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          member_id: {
            type: "string",
            description: "Profile id from list_members",
          },
        },
        required: ["project_id", "member_id"],
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
  // Index of this call within its batch. Batched tool calls run concurrently,
  // so create_task uses it to space positions - every concurrent insert reads
  // the same "last position" and would otherwise collide on the same slot.
  seq = 0,
): Promise<string> {
  if (name === "search_workspace") {
    const phrase = String(input.query ?? "").trim().slice(0, 100);
    if (phrase.length < 2) return JSON.stringify({ error: "search query must be at least 2 characters" });
    const escaped = phrase.replace(/[%_\\]/g, (char) => `\\${char}`);
    const pattern = `%${escaped}%`;
    const [{ data: titleMatches }, { data: descriptionMatches }, { data: messages }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, description, priority, due_date, completed_at, projects!inner(id, name, workspace_id)")
        .eq("projects.workspace_id", target.workspaceId)
        .is("deleted_at", null)
        .ilike("title", pattern)
        .limit(20),
      supabase
        .from("tasks")
        .select("id, title, description, priority, due_date, completed_at, projects!inner(id, name, workspace_id)")
        .eq("projects.workspace_id", target.workspaceId)
        .is("deleted_at", null)
        .ilike("description", pattern)
        .limit(20),
      supabase
        .from("messages")
        .select("id, body, created_at, channel_id, conversation_id, profiles!messages_user_id_fkey(full_name, email)")
        .eq("workspace_id", target.workspaceId)
        .is("deleted_at", null)
        .ilike("body", pattern)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const taskMatches = [...(titleMatches ?? []), ...(descriptionMatches ?? [])];
    const tasks = [...new Map(taskMatches.map((task) => [task.id, task])).values()].slice(0, 20);
    return JSON.stringify({ tasks: tasks ?? [], messages: messages ?? [] });
  }

  if (name === "get_my_work_summary") {
    const [{ data: projects, error: projectsError }, { data: assignments, error: assignmentsError }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name")
        .eq("workspace_id", target.workspaceId)
        .is("deleted_at", null),
      supabase
      .from("task_assignees")
      .select("task_id")
      .eq("user_id", userId)
      .limit(500),
    ]);
    if (projectsError || assignmentsError) {
      return JSON.stringify({ error: projectsError?.message ?? assignmentsError?.message });
    }
    const projectIds = (projects ?? []).map((project) => project.id);
    const taskIds = (assignments ?? []).map((assignment) => assignment.task_id);
    if (projectIds.length === 0 || taskIds.length === 0) {
      return JSON.stringify({ overdue: [], due_soon: [], open_without_due_date: [], recently_completed: [] });
    }
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, project_id, title, priority, due_date, completed_at")
      .in("id", taskIds)
      .in("project_id", projectIds)
      .is("deleted_at", null)
      .limit(200);
    if (tasksError) return JSON.stringify({ error: tasksError.message });
    const projectNames = new Map((projects ?? []).map((project) => [project.id, project.name]));
    const visibleTasks = (tasks ?? []).map((task) => ({ ...task, project_name: projectNames.get(task.project_id) ?? "Unknown board" }));
    const today = new Date().toISOString().slice(0, 10);
    return JSON.stringify({
      overdue: visibleTasks.filter((task) => !task.completed_at && task.due_date && task.due_date < today),
      due_soon: visibleTasks.filter((task) => !task.completed_at && task.due_date && task.due_date >= today),
      open_without_due_date: visibleTasks.filter((task) => !task.completed_at && !task.due_date),
      recently_completed: visibleTasks.filter((task) => task.completed_at).slice(0, 20),
    });
  }

  if (name === "list_mail_accounts") {
    const accounts = await listMailAccounts(userId);
    return JSON.stringify(accounts.map((account) => ({
      id: account.id,
      email: account.email,
      display_name: account.display_name,
    })));
  }

  if (name === "prepare_email") {
    if (!target.panel) {
      return JSON.stringify({ error: "Email sending requires the private Cleotilda assistant panel so the requester can review and confirm the draft." });
    }
    const accountId = String(input.account_id ?? "").trim();
    const to = String(input.to ?? "").trim();
    const cc = String(input.cc ?? "").trim();
    const subject = String(input.subject ?? "").trim();
    const text = String(input.text ?? "").trim();
    if (!accountId || !to || !subject || !text) {
      return JSON.stringify({ error: "account_id, to, subject and text are required" });
    }
    if (to.length > 2000 || cc.length > 2000 || subject.length > 998 || text.length > 900000 || /[\r\n]/.test(subject)) {
      return JSON.stringify({ error: "email fields exceed the allowed size" });
    }
    const account = (await listMailAccounts(userId)).find((item) => item.id === accountId);
    if (!account) return JSON.stringify({ error: "sender mailbox not found; call list_mail_accounts again" });
    return JSON.stringify({ ok: true, draft_ready: true, from: account.email, account_id: accountId, to, cc, subject, text });
  }
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

    // Never trust an id merely because the model supplied it: it must be an
    // active project in the current workspace and visible to the requester.
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("workspace_id", target.workspaceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!project) {
      return JSON.stringify({
        error: "project not found in this workspace; call list_projects again",
      });
    }

    // Resolve target column: a valid column on this project, or its first.
    let columnId = (input.column_id as string) || null;
    if (columnId) {
      const { data: requestedColumn } = await supabase
        .from("kanban_columns")
        .select("id")
        .eq("id", columnId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (!requestedColumn) {
        return JSON.stringify({
          error: "column does not belong to that project; call list_projects again",
        });
      }
    } else {
      const { data: col } = await supabase
        .from("kanban_columns")
        .select("id")
        .eq("project_id", projectId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      columnId = col?.id ?? null;
    }
    if (!columnId) {
      return JSON.stringify({ error: "project has no kanban column" });
    }

    // seq spaces concurrent batch inserts apart so "create 20 tasks" keeps
    // their board order stable (each read sees the same last position).
    let position = 1024 + seq * 1024;
    if (columnId) {
      const { data: last } = await supabase
        .from("tasks")
        .select("position")
        .eq("column_id", columnId)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (last?.position ?? 0) + 1024 + seq * 1024;
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

    // When a task comes from a channel issue, use the source itself rather
    // than relying on the model to reproduce (and potentially shorten) it.
    // The room history only exposes messages the caller can read, so RLS also
    // protects this lookup.
    const sourceMessageId = String(
      input.source_message_id ?? target.inferredSourceMessageId ?? "",
    ).trim();
    let sourceDescription: string | null = null;
    let sourceAttachments: {
      storage_path: string;
      file_name: string;
      mime_type: string | null;
      size_bytes: number | null;
    }[] = [];
    if (sourceMessageId) {
      const { data: source } = await supabase
        .from("messages")
        .select("body, message_attachments(storage_path, file_name, mime_type, size_bytes)")
        .eq("id", sourceMessageId)
        .eq(
          target.channelId ? "channel_id" : "conversation_id",
          target.channelId ?? target.conversationId ?? "",
        )
        .is("deleted_at", null)
        .maybeSingle();
      if (source) {
        sourceDescription = source.body.trim() || null;
        sourceAttachments =
          (source.message_attachments as unknown as typeof sourceAttachments) ?? [];
      }
    }

    // created_by is the requesting user (RLS: created_by = auth.uid()); the
    // task is attributed to whoever asked Cleotilda for it.
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        column_id: columnId,
        title,
        description:
          sourceDescription ?? (String(input.description ?? "").trim() || null),
        priority,
        due_date: dueDate,
        position,
        created_by: userId,
      })
      .select("id, title")
      .single();

    if (error) return JSON.stringify({ error: error.message });

    const requestedAssigneeIds = Array.isArray(input.assignee_ids)
      ? [...new Set((input.assignee_ids as string[]).filter(Boolean))]
          .filter((id) => id !== CLEOTILDA_ID)
          .slice(0, 10)
      : [];
    let assigneeIds: string[] = [];
    if (requestedAssigneeIds.length > 0) {
      const { data: memberships } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", target.workspaceId)
        .is("deleted_at", null)
        .in("user_id", requestedAssigneeIds);
      assigneeIds = (memberships ?? []).map((row) => row.user_id);
    }

    const warnings: string[] = [];
    if (assigneeIds.length !== requestedAssigneeIds.length) {
      warnings.push("Some requested assignees were not workspace members and were skipped.");
    }
    if (assigneeIds.length > 0 && task) {
      // The task_assignees_seat_member trigger (0035) seats each assignee
      // into project_members so their notification opens the board, not 404.
      const { error: assigneeError } = await supabase.from("task_assignees").insert(
        assigneeIds.map((uid) => ({ task_id: task.id, user_id: uid })),
      );
      if (assigneeError) warnings.push(`Assignees could not be added: ${assigneeError.message}`);
    }

    if (sourceAttachments.length > 0 && task) {
      const { error: attachmentError } = await supabase
        .from("task_attachments")
        .insert(
          sourceAttachments.map((attachment) => ({
            task_id: task.id,
            storage_path: attachment.storage_path,
            file_name: attachment.file_name,
            mime_type: attachment.mime_type,
            size_bytes: attachment.size_bytes,
            uploaded_by: userId,
          })),
        );
      if (attachmentError) {
        // The task already exists. Keep ok=true so the model reports the
        // partial result instead of retrying create_task and making a duplicate.
        warnings.push(`Attachments could not be copied: ${attachmentError.message}`);
      }
    }

    return JSON.stringify({
      ok: true,
      task_id: task?.id,
      title: task?.title,
      description_copied: sourceDescription != null,
      attachments_copied: sourceAttachments.length,
      assignees_added: assigneeIds.length,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  }

  if (name === "list_tasks") {
    const projectId = String(input.project_id ?? "");
    if (!projectId) {
      return JSON.stringify({ error: "project_id is required" });
    }
    let query = supabase
      .from("tasks")
      .select(
        "id, title, description, priority, due_date, column_id, completed_at, task_assignees(user_id, profiles(id, full_name, email))",
      )
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .limit(200);
    const q = String(input.query ?? "").trim();
    if (q.length > 0) {
      const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      query = query.ilike("title", like);
    }
    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    // Flatten assignee shape to something the model can reason about easily.
    const rows = (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      due_date: t.due_date,
      column_id: t.column_id,
      completed: t.completed_at != null,
      assignees: (
        t.task_assignees as unknown as {
          user_id: string;
          profiles: { id: string; full_name: string | null; email: string } | null;
        }[]
      )
        .map((a) => a.profiles)
        .filter((p): p is NonNullable<typeof p> => p != null),
    }));
    return JSON.stringify(rows);
  }

  if (name === "update_task") {
    const taskId = String(input.task_id ?? "");
    if (!taskId) return JSON.stringify({ error: "task_id is required" });
    const priorities = ["none", "low", "medium", "high", "urgent"] as const;
    type TaskUpdate = {
      title?: string;
      description?: string | null;
      priority?: (typeof priorities)[number];
      due_date?: string | null;
      column_id?: string;
      completed_at?: string | null;
    };
    const patch: TaskUpdate = {};
    if (typeof input.title === "string" && input.title.trim().length > 0) {
      patch.title = input.title.trim();
    }
    if (typeof input.description === "string") {
      patch.description = input.description || null;
    }
    if (
      typeof input.priority === "string" &&
      priorities.includes(input.priority as (typeof priorities)[number])
    ) {
      patch.priority = input.priority as (typeof priorities)[number];
    }
    if (typeof input.due_date === "string") {
      patch.due_date = /^\d{4}-\d{2}-\d{2}$/.test(input.due_date)
        ? input.due_date
        : null;
    }
    if (typeof input.column_id === "string" && input.column_id) {
      patch.column_id = input.column_id;
    }
    if (typeof input.completed === "boolean") {
      patch.completed_at = input.completed ? new Date().toISOString() : null;
    }
    if (Object.keys(patch).length === 0) {
      return JSON.stringify({ error: "no updatable fields provided" });
    }
    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", taskId)
      .is("deleted_at", null)
      .select("id, title")
      .maybeSingle();
    if (error) return JSON.stringify({ error: error.message });
    if (!data) {
      return JSON.stringify({
        error: "task not found or you don't have permission to update it",
      });
    }
    return JSON.stringify({ ok: true, task_id: data.id, title: data.title });
  }

  if (name === "assign_task") {
    const taskId = String(input.task_id ?? "");
    const assigneeIds = Array.isArray(input.assignee_ids)
      ? (input.assignee_ids as string[])
          .filter((id) => id && id !== CLEOTILDA_ID)
          .slice(0, 10)
      : [];
    if (!taskId || assigneeIds.length === 0) {
      return JSON.stringify({
        error: "task_id and non-empty assignee_ids are required",
      });
    }
    // Confirm the task exists (and RLS lets us see it) so we return a real
    // error instead of silently upserting rows against a bogus id.
    const { data: task } = await supabase
      .from("tasks")
      .select("id, project_id")
      .eq("id", taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!task) {
      return JSON.stringify({ error: "task not found" });
    }
    // Seat each assignee onto the project first so they can actually open
    // the task and get their assignment notification without a 404.
    for (const uid of assigneeIds) {
      await supabase.rpc("ensure_project_member", {
        p_project_id: task.project_id,
        p_user_id: uid,
      });
    }
    // The task_assignees primary key is (task_id, user_id), so ignoreDuplicates
    // makes re-assigning an already-assigned person a no-op instead of an error.
    const { error: assignErr } = await supabase
      .from("task_assignees")
      .upsert(
        assigneeIds.map((uid) => ({ task_id: taskId, user_id: uid })),
        { onConflict: "task_id,user_id", ignoreDuplicates: true },
      );
    if (assignErr) return JSON.stringify({ error: assignErr.message });
    return JSON.stringify({
      ok: true,
      task_id: taskId,
      assigned: assigneeIds.length,
    });
  }

  if (name === "unassign_task") {
    const taskId = String(input.task_id ?? "");
    const assigneeIds = Array.isArray(input.assignee_ids)
      ? (input.assignee_ids as string[]).filter(Boolean).slice(0, 10)
      : [];
    if (!taskId || assigneeIds.length === 0) {
      return JSON.stringify({
        error: "task_id and non-empty assignee_ids are required",
      });
    }
    const { error } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .in("user_id", assigneeIds);
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      ok: true,
      task_id: taskId,
      unassigned: assigneeIds.length,
    });
  }

  if (name === "delete_task") {
    const taskId = String(input.task_id ?? "");
    if (!taskId) return JSON.stringify({ error: "task_id is required" });
    const { data, error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", taskId)
      .is("deleted_at", null)
      .select("id, title")
      .maybeSingle();
    if (error) return JSON.stringify({ error: error.message });
    if (!data) {
      return JSON.stringify({
        error: "task not found or you don't have permission to delete it",
      });
    }
    return JSON.stringify({ ok: true, task_id: data.id, title: data.title });
  }

  if (name === "add_project_members") {
    const projectId = String(input.project_id ?? "");
    const memberIds = Array.isArray(input.member_ids)
      ? (input.member_ids as string[])
          .filter((id) => id && id !== CLEOTILDA_ID)
          .slice(0, 50)
      : [];
    if (!projectId || memberIds.length === 0) {
      return JSON.stringify({
        error: "project_id and non-empty member_ids are required",
      });
    }
    const { error } = await supabase.rpc("add_project_members", {
      p_project_id: projectId,
      p_member_ids: memberIds,
    });
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({
      ok: true,
      project_id: projectId,
      added: memberIds.length,
    });
  }

  if (name === "remove_project_member") {
    const projectId = String(input.project_id ?? "");
    const memberId = String(input.member_id ?? "");
    if (!projectId || !memberId) {
      return JSON.stringify({
        error: "project_id and member_id are required",
      });
    }
    const { error } = await supabase.rpc("remove_project_member", {
      p_project_id: projectId,
      p_user_id: memberId,
    });
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify({ ok: true, project_id: projectId, removed: memberId });
  }

  return JSON.stringify({ error: `unknown tool: ${name}` });
}

async function kimiChat(
  messages: ChatMessage[],
  opts: { withTools?: boolean } = {},
): Promise<{
  content: string | null;
  tool_calls?: ChatToolCall[];
}> {
  const { withTools = true } = opts;
  const res = await fetch(`${KIMI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.KIMI_API_KEY}`,
    },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: MODEL,
      // Large enough to hold a big batch of tool calls in one response (e.g.
      // "create 20 tasks" emits 20 create_task calls at once). At 1024 the
      // response was truncated mid-JSON, corrupting a call's arguments so the
      // tool saw empty input and reported a bogus "project_id/title required".
      max_tokens: 8192,
      // No temperature: kimi-k2.x models reject anything but the default.
      messages,
      ...(withTools ? { tools: TOOLS } : {}),
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

// Kimi models drift into Chinese despite the prompt rule below. Deterministic
// backstop: if the reply contains CJK but the user's message didn't, run one
// tool-less translation pass so the user always gets their own language back.
const CJK_RE = /[぀-ヿ㐀-鿿豈-﫿]/;
async function ensureUserLanguage(
  reply: string,
  userPrompt: string,
): Promise<string> {
  if (!CJK_RE.test(reply) || CJK_RE.test(userPrompt)) return reply;
  try {
    const fixed = await kimiChat(
      [
        {
          role: "system",
          content:
            "Translate the given chat message to English. Keep names, dates and formatting as-is. Output ONLY the translation, nothing else.",
        },
        { role: "user", content: reply },
      ],
      { withTools: false },
    );
    const text = (fixed.content ?? "").trim();
    return text && !CJK_RE.test(text) ? text : reply;
  } catch {
    return reply;
  }
}

const RULES = (
  today: string,
) => `- Be brief and friendly, like a helpful coworker on chat. A few sentences at most.
- Your tools ACT on the workspace. Creation: create_project (new board), create_group (new chat channel), create_task (work item), send_dm. Discovery: list_projects, list_members, list_tasks. Task edits: update_task, assign_task, unassign_task, delete_task. Board membership: add_project_members, remove_project_member. Use them to actually do things instead of describing how the user could do them. Never say you can't do something one of your tools already covers.
- EMAIL: In the private assistant panel you can list connected mailboxes and prepare polished emails. Call list_mail_accounts, resolve recipients from the user's request or list_members, then call prepare_email with the complete draft. Never claim an email was sent when it was only prepared; the user must review it and press the panel's Send email button. In a public room, provide a draft but direct the requester to the private panel to send it.
- CONTEXT AND PLANNING: Use search_workspace before claiming something was never discussed or no related task exists. Use get_my_work_summary for priorities, overdue work, daily plans and workload questions. Base summaries on tool data, clearly distinguish facts from suggestions, and do not invent statuses.
- CRITICAL - avoid duplicates. Before you create_task, ask: is this the same task the user (or you) already mentioned in this conversation? If the user is following up ("assign it to Bob", "change the due date", "delete that report task", "make it urgent"), that is almost certainly an EXISTING task. Call list_tasks (with a query substring if useful) to find the id and use update_task / assign_task / delete_task on it. Only call create_task when the user is asking for a genuinely new work item. The same rule applies to boards: don't create_project if one with that name already exists in list_projects - work with the existing one.
- Pick the right tool: "make/create a project X" means create_project. "Make a group/channel X" means create_group. "Send a message to X" / "X ko msg karo" means send_dm. "Assign X to that task" / "reassign" means assign_task. "Remove X from the task" means unassign_task. "Delete that task" means delete_task. "Add X to the board" means add_project_members. "Remove X from the board" means remove_project_member.
- CLEANING DUPLICATES: When the user asks to "remove duplicate tasks", "delete duplicates", or similar on a board, they mean tasks that LOOK the same to a human reader, NOT tasks whose title contains the word "duplicate". Do not compare titles as raw strings - two titles that only differ in quote style ("Replace 'long dash'" vs "Replace long dash"), case, extra whitespace, or trailing punctuation ARE duplicates.
  Procedure:
  1. Call list_tasks(project_id) WITHOUT any query so you get every task on the board.
  2. Normalise each title before comparing: lower-case, trim, replace curly / straight single and double quotes with nothing, drop other punctuation (colons, semicolons, trailing periods, commas, parentheses), and collapse runs of whitespace to a single space. Numbers and hyphenated prefixes like "V21-1.0.9-16" stay - they are meaningful.
  3. Group tasks by that normalised title. Only groups with 2 or more members are duplicates.
  4. For each duplicate group pick a leader to keep (the older created_at, or the one with more assignees / a description, is a good default) and call delete_task on each of the others.
  5. Confirm afterwards how many duplicates you removed, and name the leader you kept for each group if it helps clarity.
  If no groups have more than one member after this normalisation, tell the user there really are none.
- The list_tasks query parameter is a LITERAL substring match on the title. Never use it for semantic filtering ("urgent", "overdue", "duplicate", "assigned to Bob") - those attributes live in other fields and won't be in the title text. Fetch everything and filter in your own reasoning.
- Always call list_projects before create_task / list_tasks / add_project_members, and list_members before send_dm or resolving people by name to an id.
- When the user asks you to create a task from an issue/message shared earlier in the room, pass that message's [id:...] value as source_message_id. Do not summarize or shorten the issue: the tool will copy the complete message into the description and copy all of its attachments into the task.
- TASK QUALITY: Create a concise, action-oriented title that states the actual work. Preserve every user-provided requirement in description; never replace details with a one-line summary. Do not invent requirements, dates, priority, assignees, or completion. Use the user's explicit project/column when given. If no project is named and exactly one project exists, use it; if several exist, ask which one. Resolve named assignees through list_members. For a new task, perform all requested fields in the same create_task call rather than creating an incomplete task and patching it later.
- TOOL RESULTS: Read every tool result. If it contains warnings, clearly tell the user what succeeded and what did not. Never retry create_task after it returned ok=true, even if it has warnings, because the task already exists.
- When you act, confirm in one line what you did (task assigned to whom, task deleted, member added, etc.).
- If the request is ambiguous (multiple matching tasks / projects / people), ask one short clarifying question instead of guessing.
- Today's date is ${today}. Resolve relative dates like "tomorrow" or "Friday" to YYYY-MM-DD yourself.
- LANGUAGE: Always reply in English by default. Only switch to another language if the user's latest message is clearly written in that language (e.g. Roman Urdu → reply in Roman Urdu). Never reply in Chinese, Japanese, or any language the user did not use.`;

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
}): Promise<{ reply: string; mutated: boolean; pendingEmail?: CleotildaEmailDraft }> {
  if (!cleotildaEnabled()) {
    return {
      reply: "Cleotilda isn't configured yet (missing API key).",
      mutated: false,
    };
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are Cleotilda, the built-in AI teammate of Tasking, a team collaboration app (chat + kanban projects). You are chatting 1:1 with ${args.userName} in your assistant panel.

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

  const target: RoomTarget = { workspaceId: args.workspaceId, panel: true };
  const MUTATING = new Set([
    "create_project",
    "create_group",
    "create_task",
    "send_dm",
    "update_task",
    "assign_task",
    "unassign_task",
    "delete_task",
    "add_project_members",
    "remove_project_member",
  ]);

  let reply = "";
  let mutated = false;
  let pendingEmail: CleotildaEmailDraft | undefined;
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

    // Batched tool calls (e.g. "create 20 tasks" emits 20 create_task calls)
    // run concurrently - serially each insert's round-trips added up and made
    // big batches crawl.
    const results = await Promise.all(
      msg.tool_calls.map(async (tc, seq) => {
        let input: Record<string, unknown> | null = null;
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // Malformed arguments (usually a truncated batch) - tell the model
          // so it retries this call instead of running with empty input and
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
                seq,
              );
        return { id: tc.id, name: tc.function.name, input, result };
      }),
    );
    for (const r of results) {
      if (MUTATING.has(r.name) && r.result.includes('"ok":true')) {
        mutated = true;
      }
      if (r.name === "prepare_email" && r.input && r.result.includes('"draft_ready":true')) {
        const prepared = JSON.parse(r.result) as { from: string };
        pendingEmail = {
          accountId: String(r.input.account_id ?? ""),
          from: prepared.from,
          to: String(r.input.to ?? ""),
          cc: String(r.input.cc ?? ""),
          subject: String(r.input.subject ?? ""),
          text: String(r.input.text ?? ""),
        };
      }
      messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
    }
  }

  reply = reply || "Sorry, I couldn't finish that one. Try rephrasing?";
  const lastUser = args.history[args.history.length - 1]?.content ?? "";
  reply = await ensureUserLanguage(reply, lastUser);
  return { reply, mutated, pendingEmail };
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
      .select("id, body, user_id, kind, message_attachments(id, file_name, kind), sender:profiles!messages_user_id_fkey(full_name)")
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    historyQuery = args.target.channelId
      ? historyQuery.eq("channel_id", args.target.channelId)
      : historyQuery.eq("conversation_id", args.target.conversationId ?? "");
    const { data: history } = await historyQuery;

    type HistoryRow = {
      id: string;
      body: string;
      user_id: string;
      kind: string;
      message_attachments: { id: string; file_name: string; kind: string }[];
      sender: { full_name: string | null } | null;
    };
    const transcript = [...((history as HistoryRow[] | null) ?? [])]
      .reverse()
      .filter((m) => m.kind === "user")
      .map((m) => {
        const who =
          m.user_id === CLEOTILDA_ID
            ? "Cleotilda"
            : (m.sender?.full_name ?? "Someone");
        const attachments = m.message_attachments?.length
          ? ` [attachments: ${m.message_attachments.map((a) => `${a.kind}:${a.file_name}`).join(", ")}]`
          : "";
        return `[id:${m.id}] ${who}: ${m.body}${attachments}`;
      })
      .join("\n");

    // Referential requests such as "make a task for the issue above" should
    // still work if the model forgets source_message_id. Infer only when the
    // wording clearly points backwards; ordinary "create a task" requests
    // must not accidentally absorb an unrelated chat message.
    const refersToEarlierMessage =
      (/\b(?:this|that|above|earlier|previous|shared|yeh?|upar|pehle)\b/i.test(
        args.prompt,
      ) ||
        /\bjo\b.*\b(?:share(?:d)?|bhej[ai])\b/i.test(args.prompt) ||
        /\b(?:screenshot|image|photo)\s+(?:wali|wala|above|shared)\b/i.test(
          args.prompt,
        )) &&
      /\b(?:task|ticket|issue|bug|kaam)\b/i.test(args.prompt);
    const chronologicalHistory = [
      ...((history as HistoryRow[] | null) ?? []),
    ].reverse();
    const currentIndex = chronologicalHistory.findLastIndex(
      (message) => message.user_id === args.userId && message.body === args.prompt,
    );
    const inferredSource = refersToEarlierMessage
      ? chronologicalHistory
          .slice(0, currentIndex >= 0 ? currentIndex : undefined)
          .reverse()
          .find(
            (message) =>
              message.user_id !== CLEOTILDA_ID && message.body.trim().length > 0,
          )
      : undefined;
    const toolTarget: RoomTarget = {
      ...args.target,
      inferredSourceMessageId: inferredSource?.id,
    };

    const today = new Date().toISOString().slice(0, 10);

    const system = `You are Cleotilda, the built-in AI teammate of Tasking, a team collaboration app (chat + kanban projects). You are talking inside a chat room; your reply is posted as a normal chat message visible to the room.

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

      // Batched tool calls run concurrently - see the same pattern in
      // chatWithCleotilda; serial execution made big batches (20 tasks) crawl.
      const results = await Promise.all(
        msg.tool_calls.map(async (tc, seq) => {
          let input: Record<string, unknown> | null = null;
          try {
            input = JSON.parse(tc.function.arguments || "{}");
          } catch {
            // Malformed arguments (usually a truncated batch) - tell the model
            // so it retries this call instead of running with empty input and
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
                  toolTarget,
                  args.userId,
                  tc.function.name,
                  input,
                  seq,
                );
          return { id: tc.id, result };
        }),
      );
      for (const r of results) {
        messages.push({ role: "tool", tool_call_id: r.id, content: r.result });
      }
    }

    if (!reply) reply = "Sorry, I couldn't finish that one. Try rephrasing?";
    reply = await ensureUserLanguage(reply, args.prompt);

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
