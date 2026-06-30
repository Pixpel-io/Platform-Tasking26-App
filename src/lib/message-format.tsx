import type { ReactNode } from "react";

// Parse a message body into React nodes with Slack-style mrkdwn formatting:
//   ```code block```        → <pre><code>
//   `inline code`           → <code>
//   *bold*                  → <strong>
//   _italic_                → <em>
//   ~strike~                → <del>
//   <url|label> / bare url  → <a>
//   > quote (line prefix)   → <blockquote>
//   - item / 1. item        → <ul>/<ol>
//   @mention                → highlighted pill
//
// Order matters: fenced blocks are split out first so their backticks aren't
// treated as inline code, then each remaining text segment is grouped into
// block elements (quotes/lists/paragraphs), and finally inline marks are
// applied to the leaf text.

const MENTION_RE = /(@[a-zA-Z0-9._-]+)/g;
const LINK_RE = /(<[^>\s]+\|[^>]+>|https?:\/\/[^\s<]+)/g;

// Inline marks, tried in priority order. `code` does not recurse into its
// inner text; the others do, so *_bold italic_* nests correctly.
const INLINE_MARKS: {
  name: "code" | "bold" | "italic" | "strike";
  re: RegExp;
}[] = [
  { name: "code", re: /`([^`\n]+)`/ },
  { name: "bold", re: /\*([^*\n]+)\*/ },
  { name: "italic", re: /_([^_\n]+)_/ },
  { name: "strike", re: /~([^~\n]+)~/ },
];

function renderLinksAndMentions(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(LINK_RE).forEach((seg, i) => {
    if (!seg) return;
    const isLink = /^<[^>\s]+\|[^>]+>$/.test(seg) || /^https?:\/\//.test(seg);
    if (isLink) {
      let href = seg;
      let label = seg;
      const piped = seg.match(/^<([^>\s]+)\|([^>]+)>$/);
      if (piped) {
        href = piped[1];
        label = piped[2];
      }
      out.push(
        <a
          key={`${key}-lnk-${i}`}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2 hover:opacity-80"
        >
          {label}
        </a>,
      );
      return;
    }
    seg.split(MENTION_RE).forEach((part, j) => {
      if (!part) return;
      if (part.startsWith("@")) {
        out.push(
          <span
            key={`${key}-m-${i}-${j}`}
            className="rounded bg-primary/10 px-1 font-medium text-primary"
          >
            {part}
          </span>,
        );
      } else {
        out.push(<span key={`${key}-t-${i}-${j}`}>{part}</span>);
      }
    });
  });
  return out;
}

function renderInline(text: string, key: string): ReactNode[] {
  // Find the earliest inline mark in the text.
  let best: { idx: number; len: number; inner: string; name: string } | null =
    null;
  for (const mark of INLINE_MARKS) {
    const m = mark.re.exec(text);
    if (m && (best === null || m.index < best.idx)) {
      best = { idx: m.index, len: m[0].length, inner: m[1], name: mark.name };
    }
  }

  if (!best) return renderLinksAndMentions(text, key);

  const before = text.slice(0, best.idx);
  const after = text.slice(best.idx + best.len);
  const nodes: ReactNode[] = [];
  if (before) nodes.push(...renderLinksAndMentions(before, `${key}-b`));

  const innerKey = `${key}-i`;
  if (best.name === "code") {
    nodes.push(
      <code
        key={innerKey}
        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
      >
        {best.inner}
      </code>,
    );
  } else if (best.name === "bold") {
    nodes.push(
      <strong key={innerKey} className="font-semibold">
        {renderInline(best.inner, innerKey)}
      </strong>,
    );
  } else if (best.name === "italic") {
    nodes.push(
      <em key={innerKey}>{renderInline(best.inner, innerKey)}</em>,
    );
  } else {
    nodes.push(
      <del key={innerKey} className="opacity-80">
        {renderInline(best.inner, innerKey)}
      </del>,
    );
  }

  if (after) nodes.push(...renderInline(after, `${key}-a`));
  return nodes;
}

const BULLET_RE = /^\s*[-*]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+\.\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

// Group the lines of a (non-code) text segment into block elements.
function renderBlocks(text: string, key: string): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (QUOTE_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        items.push(lines[i].match(QUOTE_RE)![1]);
        i++;
      }
      out.push(
        <blockquote
          key={`${key}-q-${i}`}
          className="my-1 border-l-2 border-primary/40 pl-3 text-muted"
        >
          {renderInline(items.join("\n"), `${key}-q-${i}`)}
        </blockquote>,
      );
      continue;
    }

    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].match(BULLET_RE)![1]);
        i++;
      }
      out.push(
        <ul key={`${key}-ul-${i}`} className="my-1 list-disc pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}-ul-${i}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (ORDERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].match(ORDERED_RE)![1]);
        i++;
      }
      out.push(
        <ol key={`${key}-ol-${i}`} className="my-1 list-decimal pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `${key}-ol-${i}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Plain paragraph lines — gather consecutive ones and keep newlines.
    const para: string[] = [];
    while (
      i < lines.length &&
      !QUOTE_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(
      <span key={`${key}-p-${i}`} className="whitespace-pre-wrap break-words">
        {renderInline(para.join("\n"), `${key}-p-${i}`)}
      </span>,
    );
  }

  return out;
}

// Live highlighter for the composer overlay. Unlike formatMessageBody, this
// KEEPS every character (including the markers) so the rendered text lines up
// exactly, character-for-character, with the transparent textarea on top of
// it — only the styling differs. Markers are dimmed; their content is styled.
function highlightInline(text: string, key: string): ReactNode[] {
  let best: { idx: number; len: number; inner: string; name: string } | null =
    null;
  for (const mark of INLINE_MARKS) {
    const m = mark.re.exec(text);
    if (m && (best === null || m.index < best.idx)) {
      best = { idx: m.index, len: m[0].length, inner: m[1], name: mark.name };
    }
  }
  if (!best) return [<span key={key}>{text}</span>];

  const before = text.slice(0, best.idx);
  const after = text.slice(best.idx + best.len);
  const open = text[best.idx];
  const close = text[best.idx + best.len - 1];
  const dim = "text-muted/50";
  const cls =
    best.name === "bold"
      ? "font-semibold"
      : best.name === "italic"
        ? "italic"
        : best.name === "strike"
          ? "line-through"
          : "font-mono rounded bg-surface-2 text-foreground";

  const nodes: ReactNode[] = [];
  if (before) nodes.push(<span key={`${key}-b`}>{before}</span>);
  nodes.push(
    <span key={`${key}-m`} className={cls}>
      <span className={dim}>{open}</span>
      {best.name === "code"
        ? best.inner
        : highlightInline(best.inner, `${key}-i`)}
      <span className={dim}>{close}</span>
    </span>,
  );
  if (after) nodes.push(...highlightInline(after, `${key}-a`));
  return nodes;
}

export function highlightComposerValue(text: string): ReactNode {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.map((block, i) => {
        if (
          block.startsWith("```") &&
          block.endsWith("```") &&
          block.length > 5
        ) {
          return (
            <span key={`h-${i}`} className="font-mono text-muted">
              {block}
            </span>
          );
        }
        return <span key={`h-${i}`}>{highlightInline(block, `h-${i}`)}</span>;
      })}
      {/* Trailing newline keeps the overlay height in sync when the textarea
          ends on a blank line. */}
      {"\n"}
    </>
  );
}

export function formatMessageBody(text: string): ReactNode {
  // Split on fenced code blocks ```...``` (may span multiple lines).
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <span className="block">
      {blocks.map((block, i) => {
        if (
          block.startsWith("```") &&
          block.endsWith("```") &&
          block.length > 5
        ) {
          // Drop the fences and an optional leading language label / newline.
          let code = block.slice(3, -3);
          code = code.replace(/^[^\n]*\n/, (m) =>
            /^[a-zA-Z0-9+#.-]{1,20}$/.test(m.trim()) ? "" : m,
          );
          code = code.replace(/^\n/, "").replace(/\n$/, "");
          return (
            <pre
              key={`b-${i}`}
              className="my-1 overflow-x-auto rounded-md bg-surface-2 px-3 py-2 font-mono text-[0.85em] leading-relaxed text-foreground"
            >
              <code>{code}</code>
            </pre>
          );
        }
        return <span key={`b-${i}`}>{renderBlocks(block, `b-${i}`)}</span>;
      })}
    </span>
  );
}
