"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";

import { PALETA_TABLERO, type LineaTablero as Linea } from "@/lib/tablero-semanal";
import {
  accionColocarTarjetas,
  type EstadoTablero,
} from "@/app/(dashboard)/obras/[id]/plan-semanal/[planId]/tablero/acciones";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Donde se coloca cada tarjeta: contratista, dias y color.
 *
 * TODO EN UN SOLO ENVIO, y no una tarjeta cada vez, porque asi es como se usa:
 * la reunion decide la semana entera mirando la pizarra y despues alguien la
 * pasa de una sentada. Guardar tarjeta a tarjeta serian veinte peticiones y
 * veinte ocasiones de dejar el tablero a medias.
 *
 * Sin arrastrar y soltar a proposito. La pizarra fisica sigue mandando en la
 * reunion; esto es el registro, y un registro tiene que funcionar en el movil
 * del residente, con guantes y a pleno sol. Unos desplegables lo hacen; un
 * arrastre, no.
 */

const DIAS = [
  { iso: 1, nombre: "Lunes" },
  { iso: 2, nombre: "Martes" },
  { iso: 3, nombre: "Miércoles" },
  { iso: 4, nombre: "Jueves" },
  { iso: 5, nombre: "Viernes" },
  { iso: 6, nombre: "Sábado" },
  { iso: 7, nombre: "Domingo" },
];

function Guardar() {
  const { pending } = useFormStatus();

  /*
   * En una obra que no admite cambios no se ofrece: `colocarTarjetas` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Save className="size-4" aria-hidden="true" />
      )}
      Guardar el tablero
    </button>
  );
}



export function ColocarTarjetas({
  obraId,
  planId,
  lineas,
  contratistas,
}: {
  obraId: string;
  planId: string;
  lineas: Linea[];
  contratistas: { id: string; nombre: string }[];
}) {
  const [estado, accion] = useActionState<EstadoTablero, FormData>(
    accionColocarTarjetas,
    {},
  );

  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="planId" value={planId} />

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {estado.error}
        </p>
      )}

      <ul className="space-y-2">
        {lineas.map((l) => (
          <li
            key={l.id}
            className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:items-center"
            style={{ borderColor: "var(--borde)" }}
          >
            <span className="min-w-0 text-sm">
              <span className="line-clamp-2">{l.descripcion}</span>
              {l.zona && (
                <span className="block text-xs opacity-60">{l.zona}</span>
              )}
            </span>

            <label className="text-xs">
              <span className="mb-0.5 block opacity-70">Contratista</span>
              <select
                name={`prov:${l.id}`}
                defaultValue={l.proveedorId ?? ""}
                className="w-full rounded border px-2 py-1.5 text-sm sm:w-40"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                <option value="">Sin asignar</option>
                {contratistas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-0.5 block opacity-70">Desde</span>
              <select
                name={`dia:${l.id}`}
                defaultValue={l.diaInicio ?? ""}
                className="w-full rounded border px-2 py-1.5 text-sm sm:w-28"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                <option value="">Sin día</option>
                {DIAS.map((d) => (
                  <option key={d.iso} value={d.iso}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-0.5 block opacity-70">Hasta</span>
              <select
                name={`fin:${l.id}`}
                defaultValue={l.diaFin ?? ""}
                className="w-full rounded border px-2 py-1.5 text-sm sm:w-28"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                {/* Vacio = el mismo dia del inicio. Es el caso normal, asi que
                    no obliga a elegir dos veces lo mismo. */}
                <option value="">Mismo día</option>
                {DIAS.map((d) => (
                  <option key={d.iso} value={d.iso}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs">
              <span className="mb-0.5 block opacity-70">Color</span>
              <select
                name={`color:${l.id}`}
                defaultValue={l.color ?? ""}
                className="w-full rounded border px-2 py-1.5 text-sm sm:w-52"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                <option value="">Sin color</option>
                {/* La convencion mas extendida en obra, con su significado al
                    lado. Es una sugerencia: cada empresa tiene la suya y
                    algunas pintan por zona en vez de por especialidad. */}
                {PALETA_TABLERO.map((c) => (
                  <option key={c.hex} value={c.hex}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>

      <Guardar />
    </form>
  );
}

// `lineasDelTablero` vivia AQUI y la llamaba la pagina, que es de servidor.
// React lo prohibe —«Attempted to call lineasDelTablero() from the server but
// lineasDelTablero is on the client»— y la pantalla del tablero semanal
// llevaba rota quien sabe cuanto: respondia 200 con la cabecera pintada y sin
// tablero. Se mudo a `lib/tablero-semanal`, que es de donde ya salian
// `Tablero` y `PALETA_TABLERO` y no tiene lado.
