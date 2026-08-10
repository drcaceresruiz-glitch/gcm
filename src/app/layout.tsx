import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import {
  COOKIE_PALETA,
  COOKIE_TEMA,
  paletaValida,
  temaValido,
} from "@/lib/tema";
import { RescateRevelado } from "@/components/ui/RescateRevelado";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "GCM - Gestor de Construccion y Mantenimiento",
    template: "%s | GCM",
  },
  description:
    "Control de obra multiproyecto: presupuesto, avance fisico y resultado economico.",
  robots: { index: false, follow: false },
  /**
   * Instalable en el movil.
   *
   * Con esto el residente puede anadir GCM a su pantalla de inicio y abrirlo
   * sin la barra del navegador, que en un telefono son dos centimetros de
   * pantalla que se recuperan para la matriz.
   *
   * NO hay trabajador de servicio ni funcionamiento sin conexion: cachear la
   * lectura seria facil, pero escribir sin senal —marcar cumplido en obra— abre
   * el problema de resolver conflictos cuando dos personas editan la misma
   * semana desde moviles distintos. Eso es un proyecto aparte, no una casilla.
   */
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GCM", statusBarStyle: "default" },
  icons: { icon: "/icono.svg", apple: "/icono.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El teal de --color-marca-600. Va en hexadecimal porque lo lee el
  // navegador para pintar su barra, fuera de la hoja de estilos.
  themeColor: "#0f7186",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // El tema y la paleta se resuelven aqui, en el servidor, leyendo la cookie
  // que escribe `aplicarApariencia`. Sin esto haria falta un script en linea
  // que corriera antes que React para evitar el parpadeo del tema por
  // defecto -y un `<script>` suelto dentro de un componente ya no se
  // ejecuta en esta version de Next-. Leyendo la cookie no hace falta
  // script ninguno: el HTML llega ya pintado con el tema correcto.
  //
  // `auto` se deja tal cual en el atributo -no se resuelve aqui contra el
  // sistema, porque el servidor no puede saber la preferencia del equipo-;
  // de eso se encarga una consulta de medios en `globals.css`.
  const almacen = await cookies();
  const tema = temaValido(almacen.get(COOKIE_TEMA)?.value);
  const paleta = paletaValida(almacen.get(COOKIE_PALETA)?.value);

  return (
    <html lang="es-PE" data-tema={tema} data-paleta={paleta}>
      <body className="min-h-dvh antialiased">
        {/* Vigia del revelado de React. No pinta nada; existe para que una
            pestana en segundo plano no se quede con el esqueleto de carga
            puesto para siempre. Va aqui, fuera de todo limite de suspension,
            porque tiene que hidratar aunque la pagina siga suspendida. */}
        <RescateRevelado />
        {children}
      </body>
    </html>
  );
}
