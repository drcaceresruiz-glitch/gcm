"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, RotateCw, TriangleAlert } from "lucide-react";

import { Mascota } from "@/components/ui/Mascota";
import { shaDeEstaPagina } from "@/components/navegacion/SelloVersion";

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
 * - **Distingue una pestana vieja de un fallo de verdad.** Ver mas abajo: es
 *   el caso mas comun de todos y el unico que se arregla solo.
 */

/**
 * Si lo que fallo es que la pagina es de un despliegue anterior.
 *
 * Cada `git push` despliega, y los Server Actions se identifican por un id
 * que cambia en cada compilacion. Una pestana abierta desde antes conserva el
 * JavaScript viejo: en cuanto intenta guardar algo, el servidor no reconoce
 * la accion y la pantalla revienta. No se ha roto nada y no hay nada que
 * reportar; basta recargar.
 *
 * NO se adivina por el texto del error -en produccion Next lo sustituye por
 * uno generico, asi que buscar «Server Action» ahi funcionaria en local y
 * fallaria justo donde hace falta-. Se COMPRUEBA: se le pregunta al servidor
 * que version corre y se compara con la que pinto esta pagina.
 */
function useEsPestanaVieja(): boolean {
  const [vieja, setVieja] = useState(false);

  useEffect(() => {
    const mio = shaDeEstaPagina();
    // En local no hay paquete desplegado: no hay nada que comparar y no se
    // inventa un diagnostico.
    if (mio === null) return;

    let vivo = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((salud: { version?: string } | null) => {
        if (!vivo || !salud?.version) return;
        if (salud.version !== mio) setVieja(true);
      })
      // Si no se puede preguntar, no se afirma nada: se deja el aviso de
      // siempre, que sigue siendo cierto.
      .catch(() => undefined);

    return () => {
      vivo = false;
    };
  }, []);

  return vieja;
}

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
  const pestanaVieja = useEsPestanaVieja();

  if (pestanaVieja) {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-xl border p-8 text-center"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        <Mascota pose="pensando" alto={150} />

        <h2 className="text-lg font-semibold">GCM se actualizó mientras trabajabas</h2>

        <p className="text-sm text-pretty opacity-70">
          Esta pestaña llevaba abierta desde una versión anterior, y por eso lo
          que acabas de pulsar no llegó. <strong>No se ha roto nada y no se ha
          perdido nada</strong>: recarga la página y vuelve a intentarlo.
        </p>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Recargar la página
        </button>
      </div>
    );
  }

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
