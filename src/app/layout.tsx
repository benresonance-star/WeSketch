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
      </head>
      <body>{children}</body>
    </html>
  );
}
