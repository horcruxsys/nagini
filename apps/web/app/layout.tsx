import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sfPro = localFont({
  src: "./fonts/SF-Pro.ttf",
  variable: "--font-sf-pro",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nagini Control Center",
  description:
    "Consumer-scale, iOS6-inspired orchestration UX for Jira, Confluence, and GitHub-powered software delivery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={sfPro.variable}>{children}</body>
    </html>
  );
}
