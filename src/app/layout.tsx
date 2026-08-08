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

/**
 * Aplica el tema y la paleta ANTES de que se pinte nada.
 *
 * Tiene que ser un script en linea y sincrono: si la eleccion se aplicara
 * desde React, la primera pintura saldria con el tema por defecto y cambiaria
 * de golpe al hidratar. Ese parpadeo es exactamente lo que separa un selector
 * de apariencia bien hecho de uno que molesta.
 *
 * Va envuelto en `try` porque `localStorage` lanza en navegacion privada de
 * algunos navegadores, y quedarse sin tema es mejor que quedarse sin pagina.
 */
const APLICAR_APARIENCIA = `
try {
  var t = localStorage.getItem('gcm:tema') || 'claro';
  var p = localStorage.getItem('gcm:paleta') || 'teal';
  if (t === 'auto') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  document.documentElement.dataset.tema = t;
  document.documentElement.dataset.paleta = p;
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PE" suppressHydrationWarning>
      <head>
        {/* `suppressHydrationWarning` arriba porque este script cambia el
            `<html>` antes de que React lo compare con lo que trae del
            servidor, y esa diferencia es intencionada. */}
        <script dangerouslySetInnerHTML={{ __html: APLICAR_APARIENCIA }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
