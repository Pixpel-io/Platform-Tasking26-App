import type { ReactNode } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function LegalPage({
  eyebrow,
  title,
  summary,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <Nav />
      <main className="relative pb-12 pt-32 sm:pt-40">
        <section className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="landing-glass overflow-hidden rounded-3xl p-6 sm:p-9 lg:p-12">
            <div className="max-w-3xl">
              <a href="/landing-page" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
                Back to Tasking
              </a>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400">{eyebrow}</p>
              <h1 className="mt-4 text-balance text-4xl font-extrabold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl lg:text-6xl">{title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">{summary}</p>
              <p className="mt-5 text-sm font-medium text-[var(--muted-2)]">Last updated: {updated}</p>
            </div>
          </div>

          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="landing-glass-soft sticky top-28 hidden rounded-2xl p-4 lg:block">
              <p className="px-3 pb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted-2)]">On this page</p>
              <nav className="space-y-1">
                {sections.map((section, index) => <a key={section.id} href={`#${section.id}`} className="flex gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-indigo-500/10 hover:text-[var(--foreground)]"><span className="text-[var(--muted-2)]">{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}
              </nav>
            </aside>

            <article className="landing-glass legal-article rounded-3xl px-5 py-3 sm:px-8 lg:px-10">
              {sections.map((section, index) => (
                <section key={section.id} id={section.id} className="legal-section scroll-mt-28 py-7 sm:py-9">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-indigo-500/12 text-xs font-bold text-indigo-400">{index + 1}</span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)] sm:text-2xl">{section.title}</h2>
                      <div className="legal-copy mt-4 space-y-4 text-[var(--muted)]">{section.content}</div>
                    </div>
                  </div>
                </section>
              ))}
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 pl-1">{children}</ul>;
}

export function LegalItem({ children }: { children: ReactNode }) {
  return <li className="flex gap-3"><span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><span>{children}</span></li>;
}
