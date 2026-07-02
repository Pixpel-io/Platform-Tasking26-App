import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "http://localhost:3000";

const TITLE = "TasKing — Team Collaboration";
const DESCRIPTION =
  "Chat, projects, and kanban boards for your whole team. Slack + ClickUp in one place — real-time messaging, task tracking, and workspaces that match your brand.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · TasKing",
  },
  description: DESCRIPTION,
  applicationName: "TasKing",
  keywords: [
    "team collaboration",
    "task management",
    "kanban board",
    "team chat",
    "project management",
    "workspace",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "TasKing",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/image/taskcycle-ios-appicon-1024.png",
        width: 1024,
        height: 1024,
        alt: "TasKing app icon",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/image/taskcycle-ios-appicon-1024.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a12" },
    { media: "(prefers-color-scheme: light)", color: "#f3f5fa" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} theme-transition font-sans antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
