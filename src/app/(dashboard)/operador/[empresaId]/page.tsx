import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { detalleConstructora } from "@/services/operador.service";
import { fechaCorta } from "@/utils/fechas";
import { Chip } from "@/components/ui/Chip";
import { Volver } from "@/components/ui/Volver";
import { BotonSuspender } from "@/components/operador/BotonSuspender";
import { FichaConstructora } from "@/components/operador/FichaConstructora";
import { LicenciaConstructora } from "@/components/operador/LicenciaConstructora";
import { SoporteConstructora } from "@/components/operador/SoporteConstructora";
import { EliminarConstructora } from "@/components/operador/EliminarConstructora";
import { motivoSiNoSePuedeBorrar } from "@/services/empresa-borrado.service";
import { hiloDeSoportePorOperador } from "@/services/soporte.service";

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

  // Fuera del Promise.all de arriba a proposito: depende de que `c` exista
  // primero, y esta pantalla no se pinta si la constructora no aparecio.
  const mensajesSoporte = c.esLaPropia
    ? []
    : await hiloDeSoportePorOperador(sesion, empresaId);

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

      {/* La constancia de que sus datos salieron enteros alguna vez. Se
          ensena SIEMPRE, tambien cuando no hay ninguna: «nunca se ha
          exportado» es justo lo que hay que saber antes de plantearse
          borrarla, y una seccion que solo aparece cuando hay algo deja el
          caso peligroso invisible. */}
      <section
        className="rounded-lg border p-4 text-sm"
        style={{ borderColor: "var(--borde)" }}
      >
        <h3 className="text-base font-semibold">Su copia completa</h3>
        {c.ultimaExportacion ? (
          <p className="mt-1 opacity-80 text-pretty">
            Se exportó entera el {fechaCorta(c.ultimaExportacion.at)} ·{" "}
            {c.ultimaExportacion.obras} obra(s) ·{" "}
            {Math.max(1, Math.round(c.ultimaExportacion.tamano / 1024 / 1024))} MB.
            GCM sabe que el archivo se generó completo; que esté guardado en
            algún sitio solo lo sabe quien lo descargó.
          </p>
        ) : (
          <p className="mt-1 opacity-80 text-pretty">
            Nunca se ha exportado. Sus obras, presupuestos y fotos solo existen
            aquí.
          </p>
        )}
      </section>

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

      {/* Aparte de la ficha: no es corregir un dato de identificacion, es
          contabilidad del operador sobre la relacion comercial. Sigue
          editable con la empresa congelada -ver el comentario del
          servicio-, asi que no lleva el aviso de "congelada" de arriba. */}
      <LicenciaConstructora
        empresaId={c.id}
        inicial={{
          modalidad: c.licencia.modalidad ?? "",
          vence: c.licencia.vence ? c.licencia.vence.toISOString().slice(0, 10) : "",
          notas: c.licencia.notas ?? "",
        }}
      />

      {/* No tiene sentido con la empresa propia del operador -seria hablar
          con uno mismo-, mismo criterio que suspender/eliminar de abajo. */}
      {!c.esLaPropia && (
        <SoporteConstructora empresaId={c.id} mensajes={mensajesSoporte} />
      )}

      {/* Lo irreversible, al final y separado. La propia empresa del operador
          NO lo ofrece siquiera: el servicio lo rechaza igual, pero enseñar un
          boton que nunca va a funcionar es una invitacion a probar. */}
      {!c.esLaPropia && (
        <EliminarConstructora
          empresaId={c.id}
          razonSocial={c.razonSocial}
          obras={c.obras}
          usuarios={c.usuarios}
          motivoQueLoImpide={await motivoSiNoSePuedeBorrar(sesion, c.id)}
        />
      )}
    </div>
  );
}
