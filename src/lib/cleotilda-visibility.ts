"use client";

import { useEffect, useSyncExternalStore } from "react";

// Whether the floating Cleotilda launcher should render. Kept in localStorage
// so it's a per-browser preference (same pattern as notify-sound). Custom
// window event lets the launcher and the settings toggle stay in sync inside
// the same tab; native `storage` handles cross-tab.
const STORAGE_KEY = "cleotilda-enabled";
const CHANGE_EVENT = "cleotilda-visibility-change";

export function getCleotildaEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function setCleotildaEnabled(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

// Live-updating hook. Re-renders when the value changes in this tab (custom
// event) or a different tab (storage event).
export function useCleotildaEnabled(): boolean {
  const subscribe = (notify: () => void) => {
    const handle = (event?: Event) => {
      if (event && event.type === "storage") {
        if ((event as StorageEvent).key !== STORAGE_KEY) return;
      }
      notify();
    };
    window.addEventListener(CHANGE_EVENT, handle);
    window.addEventListener("storage", handle);
    return () => {
      window.removeEventListener(CHANGE_EVENT, handle);
      window.removeEventListener("storage", handle);
    };
  };
  const getSnapshot = () => getCleotildaEnabled();
  const getServerSnapshot = () => true;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Fire-and-forget helper if a component just needs to know at mount time
// without subscribing. Rarely needed - useCleotildaEnabled is what most
// callers want.
export function useCleotildaHydration(cb: (enabled: boolean) => void) {
  useEffect(() => {
    cb(getCleotildaEnabled());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
