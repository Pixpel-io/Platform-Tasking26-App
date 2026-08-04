import type { Metadata } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://taskinglife.io";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tasking: Everything your team needs, in one place",
  description:
    "Chat, kanban boards, DMs, calendars, and Cleotilda AI in one workspace. Ship faster with less noise. Free for teams up to 5.",
  alternates: { canonical: "/landing-page" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/landing-page`,
    siteName: "Tasking",
    title: "Tasking: Everything your team needs, in one place",
    description:
      "Chat, kanban boards, DMs, calendars, and Cleotilda AI in one workspace.",
    locale: "en_US",
    images: [{ url: "/image/taskcycle-ios-appicon-1024.png", width: 1024, height: 1024, alt: "Tasking team collaboration workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tasking: Everything your team needs, in one place",
    description:
      "Chat, kanban boards, DMs, calendars, and Cleotilda AI in one workspace.",
    images: ["/image/taskcycle-ios-appicon-1024.png"],
  },
  robots: { index: true, follow: true },
};

export default function LandingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="landing-root relative min-h-screen overflow-hidden">
      <div className="landing-bg-mesh" aria-hidden />
      <div className="landing-bg-grid" aria-hidden />
      <div className="landing-bg-noise" aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
