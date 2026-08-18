import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { panelDeValorizaciones } from "@/services/pagos.service";
import { puede } from "@/lib/rbac";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { Paginacion } from "@/components/ui/Paginacion";
import { FilaContratista } from "@/components/valorizaciones/FilaContratista";

export const metadata: Metadata = { title: "Valorizaciones y pagos" };

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/**
 * A quien le toca valorizar y a quien hay que pagarle.
 *
 * Vive DENTRO de la obra y no a nivel de empresa: es decision del usuario, y
 * ademas es lo coherente con el alcance por obra —los pagos de una obra no se
 * cruzan con los de otra—.
 *
 * Los tres frentes que se pidieron van arriba como CONTADORES y no como tres
 * listas: la lista es la misma gente, y partirla en tres obligaria a buscar
 * al mismo contratista en tres sitios. Los contadores dicen cuantos hay y el
 * orden pone arriba a quien mas retraso lleva.
 */
export default async function ValorizacionesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pagina?: string; q?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "encargo:leer")) redirect(`/obras/${id}`);

  const { pagina, q } = await searchParams;
  const panel = await panelDeValorizaciones(sesion, id, { pagina, q });
  if (!panel) redirect(`/obras/${id}`);

  const puedeGestionar = puede(sesion, "encargo:gestionar");
  const hoyISO = new Date().toISOString().slice(0, 10);

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Valorizaciones y pagos"
        nota={`Por defecto cada contratista valoriza con el corte de la obra, los ${DIAS[panel.diaCorteObra]}. Quien tenga otra cadencia pactada, la suya.`}
      >
        {/* Los tres frentes. Se cuentan sobre TODOS los encargos vigentes, no
            sobre la pagina: un contador que cambia al pasar de pagina no
            sirve para decidir nada. */}
        <dl className="grid gap-3 sm:grid-cols-3">
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <dt className="text-xs opacity-60">Valorización pendiente</dt>
            <dd className="text-xl font-semibold">
              {panel.totales.valorizacionVencida}
            </dd>
            <p className="mt-0.5 text-xs opacity-60">
              Les tocaba y no consta el corte. Avisa, no bloquea.
            </p>
          </div>

          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <dt className="text-xs opacity-60">Pagos por reportar</dt>
            <dd className="text-xl font-semibold">
              {panel.totales.conPagoPendiente}
            </dd>
            <p className="mt-0.5 text-xs opacity-60">
              Han valorizado más de lo que se les ha registrado como pagado.
            </p>
          </div>

          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <dt className="text-xs opacity-60">Sin cadencia propia</dt>
            <dd className="text-xl font-semibold">
              {panel.totales.sinCadenciaPropia}
            </dd>
            <p className="mt-0.5 text-xs opacity-60">
              Heredan el corte de la obra. No es un error: es el valor por
              defecto.
            </p>
          </div>
        </dl>

        {/* Buscador por GET, como el resto de listas de GCM: el estado vive en
            la URL, asi el enlace se puede compartir y volver atras funciona. */}
        <form className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            <span className="block opacity-60">Buscar contratista o frente</span>
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="nombre, frente o E-003"
              className="mt-0.5 w-64 rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--borde)" }}
            />
          </label>
          <button
            type="submit"
            className="rounded-lg border px-3 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            Buscar
          </button>
          {q && (
            <Link
              href={`/obras/${id}/valorizaciones`}
              className="text-xs underline opacity-70"
            >
              Quitar el filtro
            </Link>
          )}
        </form>

        {panel.filas.filas.length === 0 ? (
          <p className="text-sm opacity-70">
            {q
              ? "Ningún contratista coincide con la búsqueda."
              : "Esta obra todavía no tiene encargos vigentes. Los contratistas se dan de alta en la pestaña Proveedores."}
          </p>
        ) : (
          <>
            <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
              {panel.filas.filas.map((fila) => (
                <FilaContratista
                  key={fila.encargoId}
                  obraId={id}
                  fila={fila}
                  puedeGestionar={puedeGestionar}
                  hoyISO={hoyISO}
                />
              ))}
            </ul>

            <Paginacion
              pagina={panel.filas.pagina}
              totalPaginas={panel.filas.totalPaginas}
              total={panel.filas.total}
              etiqueta="contratistas"
              params={q ? { q } : {}}
            />
          </>
        )}
      </SeccionTarjeta>
    </Tarjeta>
  );
}
