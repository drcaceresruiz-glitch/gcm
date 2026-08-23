import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { previsualizarContractual } from "@/services/contractual.service";
import { analizarRiesgoDeReemplazo } from "@/services/importacion.service";
import { puede } from "@/lib/rbac";
import { VistaPreviaContractual } from "@/components/contractual/VistaPreviaContractual";

export const metadata: Metadata = { title: "Generar contractual" };

/**
 * La vista previa del presupuesto contractual, antes de que exista.
 *
 * Se entra a mirar, no a guardar. Por eso la pagina ensena PRIMERO las tres
 * cifras que se firman —real, contractual y bolsa—, luego lo que hay que
 * decidir (los avisos) y solo al final el detalle linea a linea.
 */
export default async function ContractualPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "meta:leer")) redirect(`/obras/${id}`);

  const previa = await previsualizarContractual(sesion, id);

  if (!previa.ok) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Generar presupuesto contractual</h1>
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {previa.error}
        </p>
        <Link href={`/obras/${id}/meta`} className="mt-4 inline-block underline">
          Ir al presupuesto meta
        </Link>
      </main>
    );
  }

  const {
    metaVersion,
    metaAprobada,
    reales,
    gastosGeneralesPrevistos,
    costoTotalMeta,
    costoPropioMeta,
  } = previa.previa;

  // Que se llevaria por delante un reemplazo. Decirlo en numeros, y separando
  // las escritas a mano, es la diferencia entre "se borraran 360 partidas" y
  // saber que dentro van doce que costaron una tarde teclear.
  const riesgo = await analizarRiesgoDeReemplazo(sesion, id);

  /**
   * Los recargos solo se tocan sobre una meta en BORRADOR.
   *
   * Una meta aprobada esta congelada, y si su margen se pudiera retocar
   * despues «congelada» no querria decir nada. Se explica en la pantalla en
   * vez de dejar los campos apagados sin motivo.
   */
  const puedeAjustar = puede(sesion, "meta:crear") && !metaAprobada;
  const motivoNoAjustable = metaAprobada
    ? `El presupuesto meta v${metaVersion} está aprobado y congelado: su margen ya no se retoca. Para cambiarlo se carga una versión nueva.`
    : !puede(sesion, "meta:crear")
      ? "No tienes permiso para cambiar el presupuesto meta, así que los recargos se muestran como están."
      : null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Generar presupuesto contractual</h1>
        <p className="text-sm text-slate-600">
          Sale del presupuesto meta v{metaVersion}
          {metaAprobada ? " (aprobado)" : " (aun sin aprobar)"}, recargando cada
          capitulo. Todavia no se ha guardado nada.
        </p>
      </div>

      <VistaPreviaContractual
        obraId={id}
        reales={reales}
        riesgo={riesgo}
        puedeGenerar={puede(sesion, "partida:importar")}
        puedeAjustar={puedeAjustar}
        motivoNoAjustable={motivoNoAjustable}
        gastosGeneralesPrevistos={gastosGeneralesPrevistos}
        costoTotalMeta={costoTotalMeta}
        costoPropioMeta={costoPropioMeta}
      />
    </main>
  );
}
