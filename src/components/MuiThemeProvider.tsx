// src/components/MuiThemeProvider.tsx
"use client";

import { ReactNode, useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material";

type Props = {
  children: ReactNode;
};

export default function MuiThemeProvider({ children }: Props) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "light",
          primary: {
            main: "#993bff",
            dark: "#361a54",
            light: "#eedeff",
            contrastText: "#fafafa",
          },
          secondary: {
            main: "#361a54",
            contrastText: "#fafafa",
          },
          background: {
            default: "#fafafa",
            paper: "#ffffff",
          },
          text: {
            primary: "#361a54",
            secondary: "#5f4d72",
          },
        },
        typography: {
          fontFamily: '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
          h1: { fontWeight: 700, letterSpacing: "-0.02em" },
          h2: { fontWeight: 700, letterSpacing: "-0.02em" },
          h3: { fontWeight: 700, letterSpacing: "-0.02em" },
          button: { fontWeight: 600 },
        },
        shape: {
          borderRadius: 12,
        },
      }),
    [],
  );

  return (
    <ThemeProvider theme={theme}>
      <div className="page-wrapper">
        {children}
      </div>
    </ThemeProvider>
  );
}
