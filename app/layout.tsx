import type { Metadata } from "next";
import "./globals.css";
import "@/features/reports/print.css";

export const metadata: Metadata = {
  title: "Teren — HVAC servis",
  description: "Radni prostor za HVAC servisne timove.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sr-Latn">
      <body>{children}</body>
    </html>
  );
}
