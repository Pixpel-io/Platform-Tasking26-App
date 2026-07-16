"use client";

// Module-level drafts for the message composer, keyed by chat target
// (channel / conversation). Lives outside the React tree so switching chats
// doesn't unmount the state - the user's half-typed message and staged files
// are still there when they come back.

import { useSyncExternalStore } from "react";
import { pendingTargetKey } from "./pending-store";

// Same shape as composer.tsx's Selected. Defined here to avoid a circular
// import; composer.tsx re-exports it under its historical name.
export type DraftFile = {
  id: string;
  file: File;
  fileName: string;
  durationMs?: number;
  width?: number;
  height?: number;
  previewUrl?: string;
};

type Draft = { value: string; selected: DraftFile[] };
type Target = { channelId?: string | null; conversationId?: string | null };

const EMPTY_DRAFT: Draft = { value: "", selected: [] };
const drafts = new Map<string, Draft>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function readDraft(tk: string): Draft {
  return drafts.get(tk) ?? EMPTY_DRAFT;
}

function writeDraft(tk: string, next: Draft): void {
  // Empty drafts drop from the map so stale keys don't accumulate as the user
  // opens dozens of chats over a session.
  if (next.value === "" && next.selected.length === 0) {
    drafts.delete(tk);
  } else {
    drafts.set(tk, next);
  }
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// -- draft.value ------------------------------------------------------------

export function useDraftValue(
  target: Target,
): [string, (next: string | ((prev: string) => string)) => void] {
  const tk = pendingTargetKey(target);
  // Primitive strings are reference-stable so no snapshot caching needed.
  const value = useSyncExternalStore(
    subscribe,
    () => drafts.get(tk)?.value ?? "",
    () => "",
  );
  const setValue = (next: string | ((prev: string) => string)) => {
    const cur = readDraft(tk);
    const nextValue =
      typeof next === "function" ? (next as (p: string) => string)(cur.value) : next;
    if (nextValue === cur.value) return;
    writeDraft(tk, { ...cur, value: nextValue });
  };
  return [value, setValue];
}

// -- draft.selected ---------------------------------------------------------

const emptySelectedByKey = new Map<string, DraftFile[]>();
function emptySelected(tk: string): DraftFile[] {
  let v = emptySelectedByKey.get(tk);
  if (!v) {
    v = [];
    emptySelectedByKey.set(tk, v);
  }
  return v;
}

export function useDraftSelected(
  target: Target,
): [DraftFile[], (next: DraftFile[] | ((prev: DraftFile[]) => DraftFile[])) => void] {
  const tk = pendingTargetKey(target);
  const selected = useSyncExternalStore(
    subscribe,
    () => drafts.get(tk)?.selected ?? emptySelected(tk),
    () => [],
  );
  const setSelected = (
    next: DraftFile[] | ((prev: DraftFile[]) => DraftFile[]),
  ) => {
    const cur = readDraft(tk);
    const nextSelected =
      typeof next === "function"
        ? (next as (p: DraftFile[]) => DraftFile[])(cur.selected)
        : next;
    if (nextSelected === cur.selected) return;
    writeDraft(tk, { ...cur, selected: nextSelected });
  };
  return [selected, setSelected];
}
