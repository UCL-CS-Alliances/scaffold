// src/components/MuiThemeProvider.tsx
"use client";

import { ReactNode } from "react";
import { ThemeProvider, CssBaseline, createTheme } from "@mui/material";

const theme = createTheme({
  // your palette/typography/etc
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
