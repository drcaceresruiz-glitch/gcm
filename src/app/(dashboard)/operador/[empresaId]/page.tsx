import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { detalleConstructora } from "@/services/operador.service";
import { fechaCorta } from "@/utils/fechas";
import { Chip } from "@/components/ui/Chip";
import { Volver } from "@/components/ui/Volver";
import { BotonSuspender } from "@/components/operador/BotonSuspender";
import { FichaConstructora } from "@/components/operador/FichaConstructora";

export const metadata: Metadata = { title: "Constructora" };

/**
 * La ficha de una constructora cliente.
 *
 * LA MISMA PROMESA QUE EL LISTADO, con un id delante: identificacion,
 * contacto, estado y contadores. Aqui NO se asoma el contenido de nadie —ni un
 * nombre de obra, ni un usuario—, y ese limite es el que hay que defender
 * cuando alguien pida "solo ver quien es el admin".
 *
 * Existe para poder CORREGIR un alta mal tecleada. Antes, un RUC equivocado
 * que el cliente no supiera arreglar no tenia salida: la unica habria sido
 * borrar la constructora y rehacerla, y eso ni siquiera se podia.
 */
export default async function FichaConstructoraPage({
  params,
}: {
  params: Promise<{ empresaId: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  // A /panel y no a un 403, igual que el listado: no se confirma que esta ruta
  // exista siquiera.
  if (!sesion.esOperador) redirect("/panel");

  const { empresaId } = await params;
  const c = await detalleConstructora(sesion, empresaId);
  if (!c) notFound();

  return (
    <div className="space-y-6">
      <Volver href="/operador">Volver a Constructoras</Volver>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{c.razonSocial}</h2>
          <p className="mt-0.5 text-sm opacity-70">
            Alta el {fechaCorta(c.createdAt)} · {c.usuarios} usuario(s) ·{" "}
            {c.obras} obra(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tono={c.activa ? "exito" : "peligro"}>
            {c.activa ? "Activa" : "Suspendida"}
          </Chip>
          {/* Congelada NO es suspendida, y se dicen por separado porque se
              arreglan de forma distinta: una se reactiva, la otra se
              descongela desde la propia empresa. */}
          {c.enMigracionAt && (
            <Chip tono="alerta">
              En migración desde {fechaCorta(c.enMigracionAt)}
            </Chip>
          )}
          {!c.esLaPropia && (
            <BotonSuspender
              empresaId={c.id}
              razonSocial={c.razonSocial}
              activa={c.activa}
            />
          )}
        </div>
      </div>

      <FichaConstructora
        empresaId={c.id}
        esLaPropia={c.esLaPropia}
        congelada={c.enMigracionAt !== null}
        inicial={{
          razonSocial: c.razonSocial,
          ruc: c.ruc,
          direccion: c.direccion ?? "",
          telefono: c.telefono ?? "",
          email: c.email ?? "",
        }}
      />
    </div>
  );
}
