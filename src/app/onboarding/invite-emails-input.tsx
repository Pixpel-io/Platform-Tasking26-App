"use client";

import { useRef, useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INVITES = 20;

// Slack-style "add teammates" chip input: type an email, press Enter/comma/
// space (or paste a list) to turn it into a removable chip. The collected
// emails travel with the form as a JSON-encoded hidden field.
export function InviteEmailsInput({ name }: { name: string }) {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const candidates = raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (candidates.length === 0) return;

    const valid = candidates.filter((e) => EMAIL_RE.test(e));
    // Keep anything unparseable in the box so the user can fix it.
    const leftovers = candidates.filter((e) => !EMAIL_RE.test(e));
    setInvalid(leftovers.length > 0 && valid.length === 0);
    setEmails((prev) =>
      [...new Set([...prev, ...valid])].slice(0, MAX_INVITES),
    );
    setDraft(leftovers.join(" "));
  }

  function remove(email: string) {
    setEmails((prev) => prev.filter((e) => e !== email));
    inputRef.current?.focus();
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(emails)} />
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 transition-colors duration-150 focus-within:border-primary/40 hover:border-muted/60"
      >
        {emails.map((email) => (
          <span
            key={email}
            className="inline-flex animate-scale-in items-center gap-1 rounded-md bg-primary/10 py-0.5 pl-2 pr-1 text-xs font-medium text-primary"
          >
            {email}
            <button
              type="button"
              onClick={() => remove(email)}
              aria-label={`Remove ${email}`}
              className="grid h-4 w-4 cursor-pointer place-items-center rounded transition-colors hover:bg-primary/20"
            >
              <svg
                className="h-2.5 w-2.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          disabled={emails.length >= MAX_INVITES}
          onChange={(e) => {
            setInvalid(false);
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "," || e.key === " ") {
              if (draft.trim()) {
                e.preventDefault();
                commit(draft);
              } else if (e.key === "Enter") {
                // Empty draft: let Enter submit the form as usual.
              }
            }
            if (e.key === "Backspace" && !draft && emails.length > 0) {
              setEmails((prev) => prev.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            e.preventDefault();
            commit(draft + " " + e.clipboardData.getData("text"));
          }}
          placeholder={
            emails.length === 0 ? "e.g. sara@acme.com, ali@acme.com" : ""
          }
          className="min-w-32 flex-1 bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:outline-none"
        />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <p className={`text-xs ${invalid ? "text-danger" : "text-muted"}`}>
          {invalid
            ? "That doesn't look like a valid email."
            : "Press Enter or comma after each email."}
        </p>
        {emails.length > 0 && (
          <p className="text-xs text-muted">
            {emails.length}/{MAX_INVITES}
          </p>
        )}
      </div>
    </div>
  );
}
