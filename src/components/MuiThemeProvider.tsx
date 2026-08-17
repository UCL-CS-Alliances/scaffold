// src/components/MuiThemeProvider.tsx
"use client";

import { ReactNode } from "react";
import { ThemeProvider, CssBaseline, createTheme } from "@mui/material";

const theme = createTheme({
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
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollBehavior: "smooth",
        },
        body: {
          backgroundColor: "#fafafa",
          color: "#361a54",
          fontFamily: '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
          lineHeight: 1.5,
          letterSpacing: "-0.01em",
          margin: 0,
        },
        a: {
          color: "#361a54",
          textDecoration: "none",
        },
        "a:hover, a:focus": {
          textDecoration: "underline",
        },
        img: {
          maxWidth: "100%",
          height: "auto",
        },
      },
    },
  },
});

type Props = {
  children: ReactNode;
};

export default function MuiThemeProvider({ children }: Props) {
  return (
    <ThemeProvider theme={theme}>
      {/* Inject global MUI baseline styles */}
      <CssBaseline />

      {/* Your own layout wrapper */}
      <div className="page-wrapper">
        {children}
      </div>
    </ThemeProvider>
  );
}
