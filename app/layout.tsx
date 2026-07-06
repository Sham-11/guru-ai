import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GURU AI — Rural Classroom Copilot",
  description:
    "Offline-First Multi-Agent AI Classroom Assistant for rural government schools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
