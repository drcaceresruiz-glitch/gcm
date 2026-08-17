import { BellRing, Check, TriangleAlert, Mail, Smartphone } from "lucide-react";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { fechaCorta } from "@/utils/fechas";
import type { AuditoriaAvisos } from "@/services/avisos-auditoria";
import type { CanalAviso, EventoAviso } from "@/generated/prisma/enums";

/**
 * Que se aviso de verdad: a quien, por donde, si salio y si se leyo.
 *
 * Existe porque el 12 de agosto de 2026 se probo el motor con una tarea real,
 * la campanita no se encendio, y no habia forma de saber por que sin entrar a
 * la base de datos a mano. Un sistema que manda cosas en nombre de la empresa
 * y no puede decir que mando obliga a confiar.
 *
 * **De "leido" solo se dice la verdad donde se sabe.** En correo y SMS no se
 * puede saber sin un pixel que rastrea a quien recibe el mensaje, y la mitad
 * de los clientes lo bloquean: el dato mentiria por defecto y por exceso. Asi
 * que la tabla dice "salio" de los tres canales, y la lectura va aparte y solo
 * de la campanita. Se dice en pantalla, no se deja suponer.
 *
 * Es un componente de servidor: solo pinta. No hay nada que tocar aqui.
 */

const ETIQUETA_CANAL: Record<CanalAviso, string> = {
  APP: "GCM",
  CORREO: "correo",
  SMS: "SMS",
};

const ICONO_CANAL: Record<CanalAviso, typeof BellRing> = {
  APP: BellRing,
  CORREO: Mail,
  SMS: Smartphone,
};

const ETIQUETA_EVENTO: Record<EventoAviso, string> = {
  ABRIR: "se abrió",
  RECORDAR: "recordatorio",
  LISTA: "quedó lista",
  RESUMEN: "resumen del día",
  HITO_CERCA: "hito cerca",
  HITO_VENCIDO: "hito vencido",
};

function hora(f: Date): string {
  return `${fechaCorta(f)} ${String(f.getHours()).padStart(2, "0")}:${String(
    f.getMinutes(),
  ).padStart(2, "0")}`;
}

export function RegistroAvisos({ datos }: { datos: AuditoriaAvisos }) {
  return (
    <Tarjeta>
      <SeccionTarjeta
        titulo="Qué se ha avisado"
        nota="A quién se le mandó, por dónde y si salió. Lo más reciente primero."
        primera
      >
        {datos.vacio ? (
          <p className="text-sm opacity-70">
            Todavía no ha salido ningún aviso de esta obra. Si esperabas alguno,
            revisa arriba que haya alguien suscrito al flujo que se abrió: un
            flujo sin destinatarios es una restricción de la que no se entera
            nadie.
          </p>
        ) : (
          <>
            {datos.fallidos > 0 && (
              <p
                className="mb-3 flex items-start gap-2 text-sm"
                style={{ color: "var(--color-peligro)" }}
              >
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {datos.fallidos} intento{datos.fallidos === 1 ? "" : "s"} no
                  salió{datos.fallidos === 1 ? "" : "eron"}. El motivo está en
                  su fila.
                </span>
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-left text-xs opacity-70"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    <th className="py-2 pr-3 font-medium">Cuándo</th>
                    <th className="py-2 pr-3 font-medium">A quién</th>
                    <th className="py-2 pr-3 font-medium">Por dónde</th>
                    <th className="py-2 pr-3 font-medium">Motivo</th>
                    <th className="py-2 font-medium">¿Salió?</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.envios.map((e) => {
                    const Icono = ICONO_CANAL[e.canal];
                    return (
                      <tr
                        key={e.id}
                        className="border-b"
                        style={{ borderColor: "var(--borde)" }}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums opacity-70">
                          {hora(e.cuando)}
                        </td>
                        <td className="py-2 pr-3">
                          {e.quien}
                          {e.externo && (
                            <span className="opacity-60"> · de fuera</span>
                          )}
                          {/* El destino, debajo y pequeño: es lo que responde
                              «¿pero a qué correo fue?», que es la pregunta que
                              sigue siempre a «no me llegó». */}
                          <span className="block text-xs opacity-50">
                            {e.destino}
                          </span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <Icono className="size-3.5 opacity-60" aria-hidden="true" />
                            {ETIQUETA_CANAL[e.canal]}
                          </span>
                        </td>
                        <td className="py-2 pr-3 opacity-70">
                          {ETIQUETA_EVENTO[e.evento]}
                        </td>
                        <td className="py-2 whitespace-nowrap">
                          {e.salio ? (
                            <span
                              className="inline-flex items-center gap-1"
                              style={{ color: "var(--color-exito)" }}
                            >
                              <Check className="size-4" aria-hidden="true" />
                              Sí
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-peligro)" }}>
                              No{e.motivo ? ` · ${e.motivo}` : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs opacity-60">
              «Salió» significa que GCM lo entregó: el correo al servidor, el SMS
              a la cola del teléfono de la empresa. Que la persona lo abriera es
              otra cosa, y solo se puede saber en GCM —ver abajo—.
            </p>
          </>
        )}
      </SeccionTarjeta>

      {datos.lectura.length > 0 && (
        <SeccionTarjeta
          titulo="Quién los está leyendo"
          nota="Solo de los avisos dentro de GCM: de un correo o un SMS no se puede saber si se abrió."
        >
          <ul className="space-y-2">
            {datos.lectura.map((p) => {
              const ratio = p.leidos / p.recibidos;
              // Nadie que no haya abierto ninguno pasa desapercibido: si se
              // le mandan avisos y no lee ninguno, el canal no le sirve y hay
              // que cambiarlo, no insistir.
              const desatendido = p.leidos === 0 && p.recibidos > 0;
              return (
                <li
                  key={p.clave}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <div className="min-w-0">
                    <span>{p.nombre}</span>
                    {p.ultimoLeidoAt && (
                      <span className="block text-xs opacity-60">
                        Último leído el {fechaCorta(p.ultimoLeidoAt)}
                      </span>
                    )}
                  </div>
                  <span
                    className="tabular-nums"
                    style={{
                      color: desatendido
                        ? "var(--color-peligro)"
                        : ratio === 1
                          ? "var(--color-exito)"
                          : "inherit",
                    }}
                  >
                    {p.leidos}/{p.recibidos} leídos
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs opacity-60">
            Quien recibe avisos y no abre ninguno no es un problema suyo: es que
            ese canal no le sirve. Cámbiale el canal a correo o SMS antes de
            insistir por la campanita.
          </p>
        </SeccionTarjeta>
      )}
    </Tarjeta>
  );
}
