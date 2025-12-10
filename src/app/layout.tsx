// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "Alliances Platform - UCL Computer Science",
  description: "A self-service application intended for use by industry partners, academic staff, and students; maintained by the Strategic Alliances Team at UCL Computer Science.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
