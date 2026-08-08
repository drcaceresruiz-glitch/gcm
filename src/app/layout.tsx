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
  // El teal de --color-marca-600. Va en hexadecimal porque lo lee el
  // navegador para pintar su barra, fuera de la hoja de estilos.
  themeColor: "#0f7186",
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
