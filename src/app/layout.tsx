import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const themeInitializer = `
  try {
    const savedTheme = localStorage.getItem("wesketch-theme-v1");
    document.documentElement.dataset.theme =
      savedTheme === "dark" ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
`;

const criticalThemeStyles = `
  :root[data-theme="light"] {
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    --ink: #f2efe9;
    --muted: #aaa39b;
    --line: #4a4641;
    --surface: #191817;
    --panel: #242220;
    --accent: #78a3ff;
    --accent-soft: #263552;
    --danger: #ef8f80;
    --success: #78bd8f;
    --control: #34312e;
    --control-subtle: #2e2b29;
    --raised: #302d2a;
    --primary: #f2efe9;
    --on-primary: #191817;
    color-scheme: dark;
  }
`;

export const metadata: Metadata = {
  title: "WeSketch",
  description: "A private, local-first spatial sketch workspace.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WeSketch",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
        <style dangerouslySetInnerHTML={{ __html: criticalThemeStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
