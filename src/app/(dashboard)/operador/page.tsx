import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { listarConstructoras } from "@/services/operador.service";
import { fechaCorta } from "@/utils/fechas";
import { Chip } from "@/components/ui/Chip";
import { Mascota } from "@/components/ui/Mascota";
import { Volver } from "@/components/ui/Volver";
import { BotonSuspender } from "@/components/operador/BotonSuspender";

export const metadata: Metadata = { title: "Constructoras" };

/**
 * Las constructoras clientes de GCM.
 *
 * Solo METADATOS: cuantos usuarios y cuantas obras tiene cada una, y si esta
 * activa. Ninguna celda enlaza a su contenido, y no hay pantalla de detalle:
 * quien opera GCM da de alta y suspende, no entra en los datos de nadie.
 *
 * SIN «Volver» hasta ahora, igual que Avisos y por el mismo motivo: se llega
 * desde el boton «Constructoras» de la cabecera, que esta en cualquier
 * pantalla, asi que no hay un origen que recordar. Al panel.
 */
export default async function OperadorPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  // A /panel y no a un 403: no se confirma que esta ruta exista siquiera.
  if (!sesion.esOperador) redirect("/panel");

  const constructoras = await listarConstructoras(sesion);
  const clientes = constructoras.filter((c) => !c.esLaPropia);

  return (
    <div className="space-y-6">
      <Volver href="/panel">Volver al panel</Volver>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Constructoras</h2>
          <p className="mt-0.5 max-w-2xl text-sm opacity-70">
            Las empresas que usan GCM. Aquí se dan de alta y se suspenden; sus
            obras y presupuestos son suyos y no se ven desde aquí.
          </p>
        </div>
        <Link
          href="/operador/nueva"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Nueva constructora
        </Link>
      </div>

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Mascota pose="saludando" alto={170} flotar />
          <p className="text-sm opacity-70">
            Aún no has dado de alta ninguna constructora.
          </p>
        </div>
      ) : (
        <div
          className="overflow-x-auto rounded-lg border"
          style={{ borderColor: "var(--borde)" }}
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--superficie)" }}>
                <th className="px-3 py-2 text-left font-medium">Constructora</th>
                <th className="px-3 py-2 text-left font-medium">RUC</th>
                <th className="px-3 py-2 text-right font-medium">Usuarios</th>
                <th className="px-3 py-2 text-right font-medium">Obras</th>
                <th className="px-3 py-2 text-left font-medium">Alta</th>
                <th className="px-3 py-2 text-center font-medium">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {constructoras.map((c) => (
                <tr
                  key={c.id}
                  className="border-t"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <td className="px-3 py-2 font-medium">
                    {c.razonSocial}
                    {c.esLaPropia && (
                      <span className="ml-2 text-xs opacity-60">tu empresa</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums opacity-80">{c.ruc}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.usuarios}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.obras}</td>
                  <td className="px-3 py-2 opacity-80">{fechaCorta(c.createdAt)}</td>
                  <td className="px-3 py-2 text-center">
                    <Chip tono={c.activa ? "exito" : "peligro"}>
                      {c.activa ? "Activa" : "Suspendida"}
                    </Chip>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!c.esLaPropia && (
                      <BotonSuspender
                        empresaId={c.id}
                        razonSocial={c.razonSocial}
                        activa={c.activa}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
