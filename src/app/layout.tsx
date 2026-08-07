import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GCM - Gestor de Construccion y Mantenimiento",
    template: "%s | GCM",
  },
  description:
    "Control de obra multiproyecto: presupuesto, avance fisico y resultado economico.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e40af",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PE">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
