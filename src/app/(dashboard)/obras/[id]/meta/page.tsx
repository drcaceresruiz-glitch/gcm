import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { compararConContractual, listarMetas } from "@/services/meta.service";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import { soles } from "@/utils/formato";
import { Mascota } from "@/components/ui/Mascota";
import { PanelBolsa } from "@/components/meta/PanelBolsa";
import { TablaBolsa } from "@/components/meta/TablaBolsa";
import { FormularioMeta } from "@/components/meta/FormularioMeta";
import { AccionesMeta } from "@/components/meta/AccionesMeta";

export const metadata: Metadata = { title: "Presupuesto meta" };

/**
 * El cartel verde de «ya está hecho».
 *
 * Fuera del componente de pagina a proposito: definido dentro, React lo trata
 * como un tipo distinto en cada render y lo desmonta y vuelve a montar.
 */
function AvisoHecho({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-exito) 15%, transparent)",
      }}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  );
}

/** Meses entre dos fechas, a 30 dias, como en el servicio. Solo se propone. */
function mesesEntre(inicio: Date, fin: Date): string {
  const dias = (fin.getTime() - inicio.getTime()) / 86_400_000;
  return (Math.round((dias / 30) * 100) / 100).toFixed(2);
}

/**
 * El presupuesto meta y la bolsa de la obra.
 *
 * La pantalla responde a una sola pregunta —«cuanto margen tiene esta obra y
 * de donde sale»— y por eso el orden es: la cascada, los avisos que la matizan
 * y solo despues el detalle linea a linea. Quien entra a mirar el numero no
 * tiene que bajar hasta la tabla.
 */
export default async function MetaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string; aprobada?: string; eliminada?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "meta:leer")) redirect(`/obras/${id}`);

  const [metas, comparacion] = await Promise.all([
    listarMetas(sesion, id),
    compararConContractual(sesion, id),
  ]);

  const { creada, aprobada, eliminada } = await searchParams;
  const puedeCrear = puede(sesion, "meta:crear");
  const puedeAprobar = puede(sesion, "meta:aprobar");

  const borrador = metas.find((m) => !m.aprobada) ?? null;
  const mesesSugeridos = mesesEntre(obra.fechaInicio, obra.fechaFinProgramada);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Presupuesto meta
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Lo que la empresa se compromete a gastar, frente a lo que el cliente
          paga. La diferencia es la <strong>bolsa</strong>: lo que la obra
          puede gestionar. La utilidad se muestra aparte: es el resultado
          esperado, no dinero
          disponible.
        </p>
      </div>

      {creada && <AvisoHecho texto={`Meta v${creada} cargada como borrador.`} />}
      {aprobada && (
        <AvisoHecho
          texto={`Meta v${aprobada} aprobada. Queda congelada e inmutable.`}
        />
      )}
      {eliminada && <AvisoHecho texto={`Borrador v${eliminada} eliminado.`} />}

      {comparacion.ok ? (
        <>
          <PanelBolsa c={comparacion.comparacion} />
          <TablaBolsa lineas={comparacion.comparacion.bolsa.porLinea} />
        </>
      ) : (
        <section
          className="flex flex-col items-center gap-4 rounded-xl border p-8 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <Mascota pose="trabajando" alto={140} />
          <div>
            <h2 className="text-sm font-semibold">Todavía no hay bolsa</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-pretty opacity-70">
              {comparacion.error}
            </p>
          </div>
          {comparacion.error.includes("línea base") && (
            <Link
              href={`/obras/${id}/revisiones`}
              className="text-sm font-medium underline"
            >
              Ir a revisiones del presupuesto
            </Link>
          )}
        </section>
      )}

      {borrador && (puedeAprobar || puedeCrear) && (
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--borde)" }}
        >
          <h2 className="text-sm font-semibold">
            Borrador v{borrador.version} sin congelar
          </h2>
          <p className="mt-1 mb-4 max-w-2xl text-sm text-pretty opacity-70">
            Mientras siga en borrador se puede rehacer, pero tampoco gobierna la
            bolsa de la obra: para eso hay que aprobarlo. Costo meta{" "}
            {soles(borrador.costoTotal)} en {borrador.totalItems} líneas.
          </p>

          <AccionesMeta
            obraId={id}
            metaId={borrador.id}
            version={borrador.version}
            puedeAprobar={puedeAprobar}
            puedeEliminar={puedeCrear}
          />
        </section>
      )}

      {metas.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Versiones</h2>
          <ul className="text-sm">
            {metas.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2 last:border-0"
                style={{ borderColor: "var(--borde)" }}
              >
                <span>
                  v{m.version}
                  <span className="ml-2 opacity-70">
                    {m.aprobada ? "congelada" : "borrador"} · {m.modo.toLowerCase()} ·{" "}
                    {m.mesesPlazo} meses
                  </span>
                </span>
                <span className="tabular-nums">{soles(m.costoTotal)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {puedeCrear && (
        <section
          className="border-t pt-8"
          style={{ borderColor: "var(--borde)" }}
        >
          <h2 className="text-lg font-semibold">
            {metas.length === 0 ? "Cargar la meta" : "Nueva versión de la meta"}
          </h2>
          <p className="mt-1 mb-5 max-w-2xl text-sm text-pretty opacity-70">
            {metas.length === 0
              ? "Descarga la plantilla, llénala con tus precios reales y vuelve a subirla. Si prefieres, puedes escribirla en cualquier Excel que respete las columnas."
              : "Una versión nueva es la forma de responder a un adicional: el contrato subió y la meta tiene que incluir lo que cuesta construirlo."}
          </p>

          <FormularioMeta
            obraId={id}
            fechaHoy={hoy().toISOString().slice(0, 10)}
            mesesSugeridos={mesesSugeridos}
          />
        </section>
      )}
    </div>
  );
}
