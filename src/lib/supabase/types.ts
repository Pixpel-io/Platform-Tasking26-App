// Hand-written to match supabase/migrations/0000_phase0_foundation.sql.
// Shaped like `supabase gen types typescript` output so the supabase-js
// client infers Row/Insert/Update and rpc() arg/return types correctly.

export type WorkspaceRole = "owner" | "admin" | "member";
export type PresenceStatus = "online" | "offline" | "busy" | "away" | "in_call";
export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
export type MessageKind = "user" | "system" | "call_event";
export type AttachmentKind = "file" | "image" | "video" | "voice";
export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "archived";
export type PriorityLevel = "none" | "low" | "medium" | "high" | "urgent";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Organization =
  Database["public"]["Tables"]["organizations"]["Row"];
export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceMember =
  Database["public"]["Tables"]["workspace_members"]["Row"];
export type Invite = Database["public"]["Tables"]["invites"]["Row"];
export type Channel = Database["public"]["Tables"]["channels"]["Row"];
export type ChannelMember =
  Database["public"]["Tables"]["channel_members"]["Row"];
export type Conversation =
  Database["public"]["Tables"]["conversations"]["Row"];
export type ConversationParticipant =
  Database["public"]["Tables"]["conversation_participants"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type MessageReaction =
  Database["public"]["Tables"]["message_reactions"]["Row"];
export type MessageAttachment =
  Database["public"]["Tables"]["message_attachments"]["Row"];
export type MessageMention =
  Database["public"]["Tables"]["message_mentions"]["Row"];
export type ReadState = Database["public"]["Tables"]["read_state"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectMember =
  Database["public"]["Tables"]["project_members"]["Row"];
export type Label = Database["public"]["Tables"]["labels"]["Row"];
export type KanbanColumn =
  Database["public"]["Tables"]["kanban_columns"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskAssignee =
  Database["public"]["Tables"]["task_assignees"]["Row"];
export type TaskWatcher =
  Database["public"]["Tables"]["task_watchers"]["Row"];
export type Checklist = Database["public"]["Tables"]["checklists"]["Row"];
export type ChecklistItem =
  Database["public"]["Tables"]["checklist_items"]["Row"];
export type TaskComment =
  Database["public"]["Tables"]["task_comments"]["Row"];
export type TaskAttachment =
  Database["public"]["Tables"]["task_attachments"]["Row"];
export type TaskTimeEntry =
  Database["public"]["Tables"]["task_time_entries"]["Row"];
export type ActivityLog =
  Database["public"]["Tables"]["activity_logs"]["Row"];
export type Notification =
  Database["public"]["Tables"]["notifications"]["Row"];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          title: string | null;
          avatar_url: string | null;
          status_emoji: string | null;
          status_text: string | null;
          status_expires_at: string | null;
          presence: PresenceStatus;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          title?: string | null;
          avatar_url?: string | null;
          status_emoji?: string | null;
          status_text?: string | null;
          status_expires_at?: string | null;
          presence?: PresenceStatus;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          title?: string | null;
          avatar_url?: string | null;
          status_emoji?: string | null;
          status_text?: string | null;
          status_expires_at?: string | null;
          presence?: PresenceStatus;
          last_seen_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          owner_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          owner_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          slug?: string | null;
          owner_id?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      app_admins: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      workspace_creators: {
        Row: {
          id: string;
          email: string;
          added_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          added_by?: string | null;
          created_at?: string;
        };
        Update: {
          email?: string;
        };
        Relationships: [];
      };
      workspace_requests: {
        Row: {
          id: string;
          requested_by: string;
          workspace_name: string;
          organization_name: string | null;
          color: string | null;
          status: "pending" | "approved" | "rejected";
          decided_by: string | null;
          decided_at: string | null;
          workspace_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          requested_by: string;
          workspace_name: string;
          organization_name?: string | null;
          color?: string | null;
          status?: "pending" | "approved" | "rejected";
          decided_by?: string | null;
          decided_at?: string | null;
          workspace_id?: string | null;
          created_at?: string;
        };
        Update: {
          status?: "pending" | "approved" | "rejected";
          decided_by?: string | null;
          decided_at?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "workspace_requests_requested_by_fkey";
            columns: ["requested_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      workspaces: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string | null;
          icon_url: string | null;
          color: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug?: string | null;
          icon_url?: string | null;
          color?: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          slug?: string | null;
          icon_url?: string | null;
          color?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role?: WorkspaceRole;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          role?: WorkspaceRole;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      dm_blocks: {
        Row: {
          user_id: string;
          blocked_user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          blocked_user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          blocked_user_id?: string;
        };
        Relationships: [];
      };
      dm_hidden_contacts: {
        Row: {
          user_id: string;
          hidden_user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          hidden_user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          hidden_user_id?: string;
        };
        Relationships: [];
      };
      dm_connections: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_a: string;
          user_b: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [];
      };
      dm_invites: {
        Row: {
          id: string;
          email: string;
          invited_by: string;
          token: string;
          status: InviteStatus;
          expires_at: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          invited_by: string;
          token?: string;
          status?: InviteStatus;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          invited_by?: string;
          token?: string;
          status?: InviteStatus;
          expires_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          workspace_id: string;
          email: string;
          role: WorkspaceRole;
          token: string;
          status: InviteStatus;
          invited_by: string;
          accepted_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          email: string;
          role?: WorkspaceRole;
          token?: string;
          status?: InviteStatus;
          invited_by: string;
          accepted_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          email?: string;
          role?: WorkspaceRole;
          token?: string;
          status?: InviteStatus;
          invited_by?: string;
          accepted_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      channel_members: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          channel_id: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          workspace_id: string | null;
          is_group: boolean;
          dm_key: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          is_group?: boolean;
          dm_key?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          is_group?: boolean;
          dm_key?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      conversation_participants: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          workspace_id: string | null;
          channel_id: string | null;
          conversation_id: string | null;
          parent_id: string | null;
          user_id: string;
          kind: MessageKind;
          body: string;
          edited_at: string | null;
          pinned_at: string | null;
          pinned_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id?: string | null;
          channel_id?: string | null;
          conversation_id?: string | null;
          parent_id?: string | null;
          user_id: string;
          kind?: MessageKind;
          body?: string;
          edited_at?: string | null;
          pinned_at?: string | null;
          pinned_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          body?: string;
          kind?: MessageKind;
          edited_at?: string | null;
          pinned_at?: string | null;
          pinned_by?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      message_reactions: {
        Row: {
          id: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          emoji?: string;
        };
        Relationships: [];
      };
      message_attachments: {
        Row: {
          id: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          kind: AttachmentKind;
          width: number | null;
          height: number | null;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          kind?: AttachmentKind;
          width?: number | null;
          height?: number | null;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: {
          file_name?: string;
          mime_type?: string | null;
        };
        Relationships: [];
      };
      message_mentions: {
        Row: {
          id: string;
          message_id: string;
          mentioned_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          mentioned_id: string;
          created_at?: string;
        };
        Update: {
          mentioned_id?: string;
        };
        Relationships: [];
      };
      read_state: {
        Row: {
          id: string;
          user_id: string;
          channel_id: string | null;
          conversation_id: string | null;
          last_read_at: string;
          last_read_message_id: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          channel_id?: string | null;
          conversation_id?: string | null;
          last_read_at?: string;
          last_read_message_id?: string | null;
          updated_at?: string;
        };
        Update: {
          last_read_at?: string;
          last_read_message_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          priority: PriorityLevel;
          start_date: string | null;
          due_date: string | null;
          owner_id: string;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          priority?: PriorityLevel;
          start_date?: string | null;
          due_date?: string | null;
          owner_id: string;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          status?: ProjectStatus;
          priority?: PriorityLevel;
          start_date?: string | null;
          due_date?: string | null;
          owner_id?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      labels: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          color: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          color?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          color?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      project_labels: {
        Row: { project_id: string; label_id: string };
        Insert: { project_id: string; label_id: string };
        Update: { project_id?: string; label_id?: string };
        Relationships: [];
      };
      kanban_columns: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          position: number;
          is_done: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          position?: number;
          is_done?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          position?: number;
          is_done?: boolean;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          column_id: string | null;
          parent_id: string | null;
          title: string;
          description: string | null;
          priority: PriorityLevel;
          start_date: string | null;
          due_date: string | null;
          position: number;
          time_estimate_minutes: number | null;
          sqa_status: "pending" | "in_testing" | "done";
          completed_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          column_id?: string | null;
          parent_id?: string | null;
          title: string;
          description?: string | null;
          priority?: PriorityLevel;
          start_date?: string | null;
          due_date?: string | null;
          position?: number;
          time_estimate_minutes?: number | null;
          sqa_status?: "pending" | "in_testing" | "done";
          completed_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          column_id?: string | null;
          parent_id?: string | null;
          title?: string;
          description?: string | null;
          priority?: PriorityLevel;
          start_date?: string | null;
          due_date?: string | null;
          position?: number;
          time_estimate_minutes?: number | null;
          sqa_status?: "pending" | "in_testing" | "done";
          completed_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      task_assignees: {
        Row: { task_id: string; user_id: string; created_at: string };
        Insert: { task_id: string; user_id: string; created_at?: string };
        Update: { task_id?: string; user_id?: string };
        Relationships: [];
      };
      task_watchers: {
        Row: { task_id: string; user_id: string; created_at: string };
        Insert: { task_id: string; user_id: string; created_at?: string };
        Update: { task_id?: string; user_id?: string };
        Relationships: [];
      };
      task_labels: {
        Row: { task_id: string; label_id: string };
        Insert: { task_id: string; label_id: string };
        Update: { task_id?: string; label_id?: string };
        Relationships: [];
      };
      checklists: {
        Row: {
          id: string;
          task_id: string;
          title: string;
          position: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          title?: string;
          position?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          title?: string;
          position?: number;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      checklist_items: {
        Row: {
          id: string;
          checklist_id: string;
          content: string;
          is_done: boolean;
          position: number;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          checklist_id: string;
          content: string;
          is_done?: boolean;
          position?: number;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          content?: string;
          is_done?: boolean;
          position?: number;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          body: string;
          edited_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          body: string;
          edited_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          body?: string;
          edited_at?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      task_attachments: {
        Row: {
          id: string;
          task_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: {
          file_name?: string;
        };
        Relationships: [];
      };
      task_time_entries: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          duration_minutes: number;
          note: string | null;
          started_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          duration_minutes: number;
          note?: string | null;
          started_at?: string | null;
          created_at?: string;
        };
        Update: {
          duration_minutes?: number;
          note?: string | null;
        };
        Relationships: [];
      };
      activity_logs: {
        Row: {
          id: string;
          workspace_id: string;
          project_id: string | null;
          task_id: string | null;
          actor_id: string | null;
          verb: string;
          meta: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          project_id?: string | null;
          task_id?: string | null;
          actor_id?: string | null;
          verb: string;
          meta?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          verb?: string;
          meta?: Record<string, unknown>;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          workspace_id: string | null;
          user_id: string;
          actor_id: string | null;
          type: string;
          title: string;
          body: string;
          channel_id: string | null;
          conversation_id: string | null;
          message_id: string | null;
          project_id: string | null;
          task_id: string | null;
          meta: Record<string, unknown>;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          actor_id?: string | null;
          type: string;
          title?: string;
          body?: string;
          channel_id?: string | null;
          conversation_id?: string | null;
          message_id?: string | null;
          project_id?: string | null;
          task_id?: string | null;
          meta?: Record<string, unknown>;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_workspace: {
        Args: {
          p_workspace_name: string;
          p_organization_name?: string;
          p_color?: string;
        };
        Returns: string;
      };
      create_workspace_gated: {
        Args: {
          p_workspace_name: string;
          p_organization_name?: string;
          p_color?: string;
        };
        Returns: string;
      };
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      can_create_workspace: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      delete_workspace: {
        Args: { p_workspace_id: string };
        Returns: string | null;
      };
      accept_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      dm_invite_preview: {
        Args: { p_token: string };
        Returns: {
          email: string;
          status: InviteStatus;
          expired: boolean;
          inviter_name: string;
        }[];
      };
      accept_dm_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      is_dm_blocked: {
        Args: { p_a: string; p_b: string };
        Returns: boolean;
      };
      has_dm_connection: {
        Args: { p_a: string; p_b: string };
        Returns: boolean;
      };
      invite_preview: {
        Args: { p_token: string };
        Returns: {
          email: string;
          status: InviteStatus;
          expired: boolean;
          workspace_name: string;
        }[];
      };
      is_workspace_member: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      is_workspace_admin: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      is_workspace_owner: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      workspace_role_of: {
        Args: { p_workspace_id: string };
        Returns: WorkspaceRole;
      };
      create_channel: {
        Args: {
          p_workspace_id: string;
          p_name: string;
          p_description?: string;
          p_member_ids?: string[];
        };
        Returns: string;
      };
      add_channel_members: {
        Args: { p_channel_id: string; p_member_ids: string[] };
        Returns: undefined;
      };
      remove_channel_member: {
        Args: { p_channel_id: string; p_member_id: string };
        Returns: undefined;
      };
      cleotilda_post_message: {
        Args: {
          p_body: string;
          p_channel_id?: string;
          p_conversation_id?: string;
        };
        Returns: string;
      };
      get_or_create_dm: {
        Args: { p_workspace_id: string; p_other_user_id: string };
        Returns: string;
      };
      is_channel_member: {
        Args: { p_channel_id: string };
        Returns: boolean;
      };
      can_access_channel: {
        Args: { p_channel_id: string };
        Returns: boolean;
      };
      is_conversation_participant: {
        Args: { p_conversation_id: string };
        Returns: boolean;
      };
      create_project: {
        Args: {
          p_workspace_id: string;
          p_name: string;
          p_description?: string;
          p_priority?: PriorityLevel;
          p_member_ids?: string[];
        };
        Returns: string;
      };
      ensure_project_member: {
        Args: { p_project_id: string; p_user_id: string };
        Returns: undefined;
      };
      add_project_members: {
        Args: { p_project_id: string; p_member_ids: string[] };
        Returns: undefined;
      };
      is_project_member: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      can_access_project: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      can_access_task: {
        Args: { p_task_id: string };
        Returns: boolean;
      };
      mark_notifications_read: {
        Args: { p_workspace_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      workspace_role: WorkspaceRole;
      presence_status: PresenceStatus;
      invite_status: InviteStatus;
      message_kind: MessageKind;
      attachment_kind: AttachmentKind;
      project_status: ProjectStatus;
      priority_level: PriorityLevel;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
