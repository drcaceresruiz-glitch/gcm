import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { previsualizarContractual } from "@/services/contractual.service";
import { analizarRiesgoDeReemplazo } from "@/services/importacion.service";
import { puede } from "@/lib/rbac";
import { soles } from "@/utils/formato";
import { ConfirmarContractual } from "@/components/contractual/ConfirmarContractual";

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
          Ir al presupuesto real
        </Link>
      </main>
    );
  }

  const { metaVersion, metaAprobada, resultado } = previa.previa;
  const partidas = resultado.lineas.filter((l) => l.tipo === "PARTIDA");

  // Que se llevaria por delante un reemplazo. Decirlo en numeros, y separando
  // las escritas a mano, es la diferencia entre "se borraran 360 partidas" y
  // saber que dentro van doce que costaron una tarde teclear.
  const riesgo = await analizarRiesgoDeReemplazo(sesion, id);


  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Generar presupuesto contractual</h1>
        <p className="text-sm text-slate-600">
          Sale del presupuesto real v{metaVersion}
          {metaAprobada ? " (aprobado)" : " (aun sin aprobar)"}, recargando cada
          capitulo. Todavia no se ha guardado nada.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-slate-500">Real (lo que cuesta)</p>
          <p className="text-lg font-semibold">{soles(resultado.totalReal)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs uppercase text-slate-500">Contractual (lo que se cobra)</p>
          <p className="text-lg font-semibold">{soles(resultado.totalContractual)}</p>
        </div>
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-xs uppercase text-emerald-700">Bolsa operativa</p>
          <p className="text-lg font-semibold text-emerald-800">
            {soles(resultado.bolsa)}
          </p>
        </div>
      </section>

      {resultado.avisos.length > 0 && (
        <section className="space-y-3">
          {resultado.avisos.map((a) => (
            <div key={a.motivo} className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
              <p className="font-semibold text-amber-900">
                {a.codigos.length} linea(s) &middot; {soles(a.importe)}
              </p>
              <p className="text-amber-900">{a.mensaje}</p>
              <p className="mt-1 text-xs text-slate-600">{a.codigos.join(", ")}</p>
            </div>
          ))}
        </section>
      )}

      <ConfirmarContractual obraId={id} partidas={partidas.length} riesgo={riesgo} />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">
          Detalle
        </h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Descripcion</th>
                <th className="p-2 text-right">Metrado</th>
                <th className="p-2 text-right">P. contractual</th>
                <th className="p-2 text-right">Recargo</th>
                <th className="p-2 text-right">Parcial</th>
              </tr>
            </thead>
            <tbody>
              {resultado.lineas.map((l) => (
                <tr key={l.codigo} className={l.tipo === "CAPITULO" ? "bg-slate-50 font-semibold" : ""}>
                  <td className="p-2">{l.codigo}</td>
                  <td className="p-2">{l.descripcion}</td>
                  <td className="p-2 text-right">{l.metrado ?? ""}</td>
                  <td className="p-2 text-right">{l.precioUnitario ?? ""}</td>
                  <td className="p-2 text-right">
                    {l.porcentajeAplicado ? `${l.porcentajeAplicado}%` : ""}
                  </td>
                  <td className="p-2 text-right">
                    {l.parcial ? soles(l.parcial) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
