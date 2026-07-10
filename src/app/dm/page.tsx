// Landing for the global DM shell: nudge toward picking a conversation.
export default function DmIndexPage() {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="flex max-w-sm flex-col items-center animate-fade-in-up">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 text-primary ring-1 ring-inset ring-primary/10">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <p className="text-base font-semibold text-foreground">
          Your direct messages
        </p>
        <p className="mt-1 text-sm text-muted">
          Pick a conversation from the left, or invite someone new with the +
          button.
        </p>
      </div>
    </div>
  );
}
