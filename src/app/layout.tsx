import type { Metadata } from "next";
import "./globals.css";

import MuiThemeProvider from "@/components/MuiThemeProvider";

export const metadata: Metadata = {
  title: "Alliances Platform",
  description: "UCL CS Alliances Platform – Development Environment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MuiThemeProvider>{children}</MuiThemeProvider>
      </body>
    </html>
  );
}
