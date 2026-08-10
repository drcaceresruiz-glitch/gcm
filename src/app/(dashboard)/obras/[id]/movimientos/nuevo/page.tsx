import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Volver } from "@/components/ui/Volver";
import { obtenerSesion } from "@/services/sesion.service";
import { listarPartidas, obtenerObra } from "@/services/obras.service";
import {
  obtenerPresupuestoVigente,
  SinLineaBaseError,
  type PresupuestoVigente,
} from "@/services/movimientos.service";
import { puede } from "@/lib/rbac";
import { hoy } from "@/utils/fechas";
import {
  FormularioMovimiento,
  type OpcionCapitulo,
  type OpcionPartida,
} from "@/components/movimientos/FormularioMovimiento";

export const metadata: Metadata = { title: "Nuevo movimiento presupuestal" };

/**
 * Alta de un movimiento presupuestal.
 *
 * El formulario necesita dos cosas que el servicio de movimientos no
 * devuelve juntas: el importe VIGENTE de cada partida, para saber cuanto
 * hay disponible antes de sacar dinero, y el arbol en orden de documento,
 * para agrupar el desplegable por capitulos y para ofrecer los capitulos
 * donde puede colgar una partida nueva. Se cruzan aqui.
 */
export default async function NuevoMovimientoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "movimiento:crear")) {
    redirect(`/obras/${id}/movimientos`);
  }

  // Sin linea base no hay nada que ajustar. La pantalla de movimientos lo
  // explica y ofrece el paso que falta, asi que se manda alli.
  let presupuesto: PresupuestoVigente;
  try {
    presupuesto = await obtenerPresupuestoVigente(sesion, id);
  } catch (error) {
    if (error instanceof SinLineaBaseError) redirect(`/obras/${id}/movimientos`);
    throw error;
  }

  const { filas } = await listarPartidas(sesion, id);
  const { capitulos, partidas } = construirOpciones(filas, presupuesto);

  return (
    <div className="space-y-8">
      <div>
        <Volver href={`/obras/${id}/movimientos`}>
          Volver a los movimientos
        </Volver>

        <h2 className="mt-3 text-xl font-semibold tracking-tight">
          Nuevo movimiento presupuestal
        </h2>
        <p className="mt-1 text-sm text-pretty opacity-70">
          Sobre la línea base v{presupuesto.version}
        </p>
      </div>

      <FormularioMovimiento
        obraId={id}
        fechaHoy={hoy().toISOString().slice(0, 10)}
        partidas={partidas}
        capitulos={capitulos}
      />
    </div>
  );
}

/**
 * Cruza el arbol vivo con el presupuesto vigente para armar los dos
 * desplegables del formulario.
 *
 * El capitulo de cada partida se deduce recorriendo el arbol en ORDEN DE
 * DOCUMENTO y recordando el ultimo capitulo raiz visto, en lugar de
 * partirle el codigo. Las convenciones conviven («4.0», «01.02»,
 * «7.02.00») y ademas hay huecos: «11.11.02» existe sin que exista
 * «11.11». El orden del documento no miente.
 */
function construirOpciones(
  filas: Awaited<ReturnType<typeof listarPartidas>>["filas"],
  presupuesto: PresupuestoVigente,
): { capitulos: OpcionCapitulo[]; partidas: OpcionPartida[] } {
  const vigentePorId = new Map(
    presupuesto.partidas.map((p) => [p.wbsItemId, p]),
  );

  // La raiz no siempre esta al mismo nivel, asi que se toma el menor que
  // aparezca en vez de dar por supuesto un 0 o un 1.
  const niveles = filas
    .filter((f) => f.tipo === "CAPITULO")
    .map((f) => f.nivel);
  const nivelRaiz = niveles.length > 0 ? Math.min(...niveles) : 0;

  const capitulos: OpcionCapitulo[] = [];
  const partidas: OpcionPartida[] = [];
  let grupo = "Sin capitulo";

  for (const fila of filas) {
    const etiqueta = `${fila.codigoPartida} ${fila.descripcion}`;

    if (fila.tipo === "CAPITULO") {
      if (fila.nivel === nivelRaiz) grupo = etiqueta;
      capitulos.push({
        id: fila.id,
        etiqueta,
        sangria: fila.nivel - nivelRaiz,
      });
      continue;
    }

    // ALCANCE no lleva importe propio: su dinero vive en la partida padre y
    // el servicio rechaza cualquier linea que la apunte. Ofrecerla en el
    // desplegable seria ofrecer un error.
    if (fila.modalidad === "ALCANCE") continue;

    const vigente = vigentePorId.get(fila.id);
    if (!vigente) continue;

    partidas.push({
      wbsItemId: fila.id,
      codigoPartida: fila.codigoPartida,
      descripcion: fila.descripcion,
      modalidad: fila.modalidad,
      vigente: vigente.vigente,
      capitulo: grupo,
    });
  }

  return { capitulos, partidas };
}
