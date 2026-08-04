import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google";
import "./landing.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const legalSerif = Source_Serif_4({
  variable: "--font-legal",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

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
    <>
      <script dangerouslySetInnerHTML={{ __html: `(function(){try{var s=localStorage.getItem('tasking-landing-theme');var t=s||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.landingTheme=t}catch(e){}})();` }} />
      <div className={`${jakarta.variable} ${legalSerif.variable} landing-root relative min-h-screen overflow-hidden`}>
        <div className="landing-bg-mesh" aria-hidden />
        <div className="landing-bg-grid" aria-hidden />
        <div className="landing-bg-noise" aria-hidden />
        <div className="relative z-10">{children}</div>
      </div>
    </>
  );
}
