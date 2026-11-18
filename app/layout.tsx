import { OfflineSessionGuard } from "@/features/offline/session-guard";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@/features/reports/print.css";

export const metadata: Metadata = {
  title: "Teren — HVAC servis",
  icons: { apple: "/offline/v1/icon-192.png" },
  description: "Radni prostor za HVAC servisne timove.",
};

export const viewport: Viewport = { themeColor: "#165d4c" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sr-Latn">
      <body>
        <OfflineSessionGuard />
        {children}
      </body>
    </html>
  );
}
