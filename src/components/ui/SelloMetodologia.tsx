import { ClipboardCheck, Workflow } from "lucide-react";

/**
 * El sello de metodologia: sobre que esta construido GCM.
 *
 * No es decoracion ni marketing vacio: cada nombre corresponde a algo que la
 * aplicacion HACE. Lean Construction esta en el analisis de restricciones y en
 * las causas de no cumplimiento; el Last Planner, en los tres niveles de
 * planificacion (maestro, Lookahead y plan semanal) con su PPC. Si algun dia
 * se retiraran esas funcionalidades, este sello tendria que irse con ellas.
 *
 * Vive en UN solo componente y no copiado en cada pantalla: el dia que cambie
 * la redaccion, cambia en todas a la vez.
 *
 * «Last Planner» es marca registrada del Lean Construction Institute. Se cita
 * con su simbolo y en modo descriptivo —«construido sobre»—, que es lo que es:
 * GCM implementa el metodo, no esta certificado ni avalado por nadie. Esa
 * distincion importa y por eso el texto nunca dice «certificado».
 */

const SELLOS = [
  {
    icono: Workflow,
    nombre: "Lean Construction",
    detalle: "Flujo continuo y eliminación de desperdicio",
  },
  {
    icono: ClipboardCheck,
    nombre: "Last Planner® System",
    detalle: "Lookahead, restricciones, PTS y PPC",
  },
] as const;

/**
 * `compacto` es la version del pie de pagina: solo los nombres, sin el
 * detalle, para no competir con los creditos. La otra se usa donde el sello
 * ES el mensaje —el acceso— y ahi si se explica que hay detras de cada nombre.
 */
export function SelloMetodologia({
  compacto = false,
  className = "",
}: {
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-2 ${className}`}
    >
      <span className="sr-only">
        GCM está construido sobre Lean Construction y el Last Planner System.
      </span>

      {SELLOS.map(({ icono: Icono, nombre, detalle }) => (
        <span
          key={nombre}
          aria-hidden="true"
          title={detalle}
          className={`inline-flex items-center gap-1.5 rounded-full border ${
            compacto ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
          }`}
          style={{
            borderColor: "color-mix(in oklab, var(--color-marca-500) 40%, transparent)",
            backgroundColor:
              "color-mix(in oklab, var(--color-marca-500) 10%, transparent)",
          }}
        >
          <Icono
            className={compacto ? "size-3" : "size-3.5"}
            style={{ color: "var(--color-marca-600)" }}
          />
          <span className="font-semibold">{nombre}</span>
          {!compacto && (
            <span className="hidden opacity-70 sm:inline">· {detalle}</span>
          )}
        </span>
      ))}
    </div>
  );
}
