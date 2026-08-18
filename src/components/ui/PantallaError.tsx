"use client";

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

import { Mascota } from "@/components/ui/Mascota";

/**
 * Lo que se ve cuando una pantalla revienta.
 *
 * La usan todas las fronteras de error (`error.tsx`) para que el aviso sea el
 * mismo en cualquier rincon. Hasta hoy no habia ninguna: un fallo en un
 * servicio dejaba la pantalla en negro con «A server error occurred» y un
 * numero, sin cabecera, sin menu y sin forma de volver.
 *
 * QUE DICE Y QUE NO:
 *
 * - **Dice el codigo.** Es lo unico accionable: con el se encuentra el fallo
 *   en la bitacora del servidor. Sin el, «algo salio mal» obliga a adivinar
 *   cual de las cincuenta pantallas fue.
 * - **No dice «intentalo mas tarde»** a secas. Reintentar sirve cuando fue un
 *   tropiezo de red; si el fallo es del codigo volvera a pasar, y se avisa en
 *   vez de dejar a alguien pulsando el boton.
 * - **No enseña el mensaje tecnico en produccion**, y no es decision nuestra:
 *   Next lo sustituye por uno generico y deja solo el `digest`. En desarrollo
 *   si viaja, y ahi es donde hace falta.
 */
export function PantallaError({
  error,
  reset,
  volverA,
  volverTexto = "Volver al panel",
}: {
  error: Error & { digest?: string };
  /// Vuelve a renderizar el trozo que fallo. Ausente en `global-error`, donde
  /// lo unico que queda es recargar entera.
  reset?: () => void;
  volverA: string;
  volverTexto?: string;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border p-8 text-center"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <Mascota pose="pensando" alto={150} />

      <div className="flex items-center gap-2">
        <TriangleAlert
          className="size-5 shrink-0"
          style={{ color: "var(--color-peligro)" }}
          aria-hidden="true"
        />
        <h2 className="text-lg font-semibold">Esta pantalla no se pudo cargar</h2>
      </div>

      <p className="text-sm opacity-70">
        El fallo es de esta pantalla; el resto de GCM sigue funcionando. Nada de
        lo que estaba guardado se ha perdido.
      </p>

      {error.digest && (
        <p className="text-xs opacity-60">
          Si hay que reportarlo, este es el código del fallo:{" "}
          <code
            className="rounded px-1.5 py-0.5 font-mono"
            style={{ backgroundColor: "var(--fondo)" }}
          >
            {error.digest}
          </code>
        </p>
      )}

      {/* En produccion `message` viene generico; aqui es donde de verdad sirve. */}
      {process.env.NODE_ENV !== "production" && error.message && (
        <pre
          className="max-h-40 w-full overflow-auto rounded-lg p-3 text-left font-mono text-xs"
          style={{ backgroundColor: "var(--fondo)" }}
        >
          {error.message}
        </pre>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Reintentar
          </button>
        )}

        <Link
          href={volverA}
          className="rounded-lg border px-4 py-2 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          {volverTexto}
        </Link>
      </div>

      <p className="text-xs opacity-50">
        Si al reintentar vuelve a fallar, no es cosa de insistir: avisa con el
        código de arriba.
      </p>
    </div>
  );
}
