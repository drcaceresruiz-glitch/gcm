import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  compararConContractual,
  gastosGeneralesDeLaMeta,
  listarMetas,
} from "@/services/meta.service";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import { soles } from "@/utils/formato";
import { Mascota } from "@/components/ui/Mascota";
import { PanelBolsa } from "@/components/meta/PanelBolsa";
import { TablaBolsa } from "@/components/meta/TablaBolsa";
import { TablaGastosGenerales } from "@/components/meta/TablaGastosGenerales";
import { TablaMetaEditable } from "@/components/meta/TablaMetaEditable";
import { lineasDelBorrador } from "@/services/meta-edicion.service";
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

  /*
   * Se captura AQUI, en el servidor, a proposito.
   *
   * En produccion Next.js borra el mensaje de cualquier error que llega a la
   * frontera `error.tsx` y lo cambia por uno generico, asi que la pantalla
   * moria con un «no se pudo cargar» que no decia nada —y por eso este fallo
   * arrastro toda una sesion sin poder diagnosticarse—. Capturandolo aqui el
   * mensaje real sobrevive: se renderiza como contenido, no como excepcion.
   *
   * Cubre las DOS consultas. El caso mas probable, ya visto en produccion: una
   * columna nueva (`metaIncluyeGastosGenerales`) pedida en un `select` antes de
   * que su migracion se aplicara. Prisma no valida el select al compilar, asi
   * que solo se cae en runtime.
   */
  let metas: Awaited<ReturnType<typeof listarMetas>>;
  let comparacion: Awaited<ReturnType<typeof compararConContractual>>;
  let gastos: Awaited<ReturnType<typeof gastosGeneralesDeLaMeta>>;
  let borrador: Awaited<ReturnType<typeof lineasDelBorrador>>;
  try {
    [metas, comparacion, gastos, borrador] = await Promise.all([
      listarMetas(sesion, id),
      compararConContractual(sesion, id),
      gastosGeneralesDeLaMeta(sesion, id),
      lineasDelBorrador(sesion, id),
    ]);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Presupuesto meta</h2>
        </div>
        <section
          className="space-y-3 rounded-xl border p-6"
          style={{ borderColor: "var(--color-peligro)" }}
        >
          <h3 className="text-sm font-semibold">
            No se pudo calcular la bolsa de esta obra
          </h3>
          <p className="max-w-2xl text-sm text-pretty opacity-80">
            El resto de la obra sigue funcionando; es solo esta pantalla. Vuelve a
            intentarlo en un momento. Si persiste, este es el motivo exacto para
            quien lo revise:
          </p>
          <pre
            className="overflow-x-auto rounded-lg p-3 text-xs"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-peligro) 8%, transparent)",
            }}
          >
            {detalle}
          </pre>
          <Link href={`/obras/${id}/meta`} className="text-sm font-medium underline">
            Reintentar
          </Link>
        </section>
      </div>
    );
  }

  const { creada, aprobada, eliminada } = await searchParams;
  const puedeCrear = puede(sesion, "meta:crear");
  const puedeAprobar = puede(sesion, "meta:aprobar");

  const borradorMeta = metas.find((m) => !m.aprobada) ?? null;
  const mesesSugeridos = mesesEntre(obra.fechaInicio, obra.fechaFinProgramada);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Presupuesto meta
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Aquí entra el presupuesto <strong>real</strong>: lo que la empresa
          se compromete a gastar. Es el primer paso, y de él se genera después
          el contractual inflando cada capítulo. Cuando existen los dos, la
          diferencia es la <strong>bolsa</strong>: lo que la obra puede
          gestionar. La utilidad se muestra aparte, porque es el resultado
          esperado y no dinero disponible.
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
          <TablaGastosGenerales gastos={gastos} mesesDeLaObra={mesesSugeridos} />
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
          {/*
            El camino sale del MOTIVO, no de buscar palabras en el mensaje.

            Antes se enlazaba a Revisiones en cuanto el texto decia «linea
            base», y ese era justo el caso en que falta el CONTRACTUAL:
            Revisiones sirve para congelar un contractual que todavia no
            existe, asi que quien acababa de cargar la meta iba alli, no
            encontraba nada que hacer, volvia, y le seguian pidiendo lo mismo.
          */}
          {comparacion.motivo === "sin-contractual" && (
            <Link
              href={`/obras/${id}/contractual`}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              Generar el presupuesto contractual
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      {/* Las lineas del borrador, corregibles. Van ANTES del bloque de
          aprobar: primero se revisa lo que se va a congelar, y despues se
          congela. Al reves invita a aprobar y luego mirar. */}
      {borrador && (
        <TablaMetaEditable
          obraId={id}
          version={borrador.version}
          lineas={borrador.lineas}
          puedeEditar={puedeCrear}
        />
      )}

      {borradorMeta && (puedeAprobar || puedeCrear) && (
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: "var(--borde)" }}
        >
          <h2 className="text-sm font-semibold">
            Borrador v{borradorMeta.version} sin congelar
          </h2>
          <p className="mt-1 mb-4 max-w-2xl text-sm text-pretty opacity-70">
            Mientras siga en borrador se puede rehacer, pero tampoco gobierna la
            bolsa de la obra: para eso hay que aprobarlo. Costo meta{" "}
            {soles(borradorMeta.costoTotal)} en {borradorMeta.totalItems} líneas.
          </p>

          <AccionesMeta
            obraId={id}
            metaId={borradorMeta.id}
            version={borradorMeta.version}
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
          <p className="mt-1 mb-4 max-w-2xl text-sm text-pretty opacity-70">
            {metas.length === 0
              ? "Descarga la plantilla, llénala con tus precios reales y vuelve a subirla."
              : "Una versión nueva es la forma de responder a un adicional: el contrato subió y la meta tiene que incluir lo que cuesta construirlo."}
          </p>

          {/* La plantilla, ANTES del formulario y en todas las versiones.
              Estaba como enlace pequeño al pie y su mención desaparecia desde
              la v2, asi que quien cargaba una version nueva subia su propio
              Excel: de ahi salen casi todos los fallos del importador
              —capitulos sin subtotal, formulas sin resultado calculado, meses
              que exceden el plazo—, y ninguno da error al subir. */}
          <div
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--superficie)",
            }}
          >
            <p className="max-w-xl text-sm text-pretty">
              <strong>Usa siempre la plantilla.</strong> Trae la hoja «Costo
              Directo» con las fórmulas ya hechas y las celdas que no se
              tocan bloqueadas. Un Excel propio suele colar errores que el
              importador no puede ver.
            </p>
            <a
              href={`/plantilla-meta?meses=${mesesSugeridos}`}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              Descargar plantilla
            </a>
          </div>

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
