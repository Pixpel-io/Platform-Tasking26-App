"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildBoard, type BoardColumn } from "@/lib/projects-shared";
import type { KanbanColumn } from "@/lib/supabase/types";
import type { TaskWithRelations } from "@/lib/projects-shared";

const TASK_SELECT =
  "*, task_assignees(user_id, profiles(*)), task_labels(label_id, labels(*))";

// Keeps a project's Kanban board live: reacts to task inserts/updates/deletes
// via Supabase Realtime and re-derives the column layout. Reuses the same
// refetch-one strategy as chat to stay cheap.
export function useBoard(projectId: string, initial: BoardColumn[]) {
  const [board, setBoard] = useState<BoardColumn[]>(initial);

  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    setBoard(initialRef.current);
  }, [projectId]);

  // Apply an optimistic local change immediately; realtime later reconciles.
  function applyLocal(updater: (cols: BoardColumn[]) => BoardColumn[]) {
    setBoard((prev) => updater(prev));
  }

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();

    function flatten(cols: BoardColumn[]): {
      columns: KanbanColumn[];
      tasks: TaskWithRelations[];
    } {
      const columns = cols.map(({ tasks: _tasks, ...col }) => col as KanbanColumn);
      const tasks = cols.flatMap((c) => c.tasks);
      return { columns, tasks };
    }

    async function refetchTask(id: string) {
      const { data } = await supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("id", id)
        .single();
      const row = data as unknown as TaskWithRelations | null;
      setBoard((prev) => {
        const { columns, tasks } = flatten(prev);
        const idx = tasks.findIndex((t) => t.id === id);
        let next = tasks;
        if (!row || row.deleted_at || row.parent_id) {
          if (idx !== -1) next = tasks.filter((t) => t.id !== id);
          else return prev;
        } else if (idx === -1) {
          next = [...tasks, row];
        } else {
          next = [...tasks];
          next[idx] = row;
        }
        return buildBoard(columns, next);
      });
    }

    const channel = supabase
      .channel(`board:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const id =
            (payload.new as { id?: string })?.id ??
            (payload.old as { id?: string })?.id;
          if (id) void refetchTask(id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  return { board, setBoard, applyLocal };
}
