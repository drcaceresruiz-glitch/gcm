import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileWarning } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { adicionalesEnBorrador } from "@/services/gerencia.service";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { soles } from "@/utils/formato";

export const metadata: Metadata = { title: "Gerencia" };

/**
 * La cartera entera, para quien responde de todas las obras.
 *
 * Se llama «Gerencia» y NO «Tablero»: ya hay dos pantallas con ese nombre —el
 * tablero de supervision de la obra y, por poco, el Kanban— y una tercera
 * convertiria el nombre en ruido. Esta se distingue por su ambito: es de
 * EMPRESA, no de obra.
 *
 * Hoy contesta UNA pregunta, la que ya se puede contestar sin arriesgar el
 * servidor: cuanto hay pedido en adicionales que todavia no cuenta en ningun
 * presupuesto. El semaforo de partidas criticas y el SPI por duracion entran
 * despues, con sus propias consultas estrechas.
 */
export default async function GerenciaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // La puerta es el ALCANCE: quien no ve toda la cartera no tiene nada que
  // hacer en una pantalla que la resume. Lo decide el servicio.
  const adicionales = await adicionalesEnBorrador(sesion);
  if (!adicionales) redirect("/panel");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gerencia</h1>
        <p className="mt-1 text-sm opacity-70">
          Lo que solo se ve mirando todas las obras a la vez.
        </p>
      </div>

      <Tarjeta>
        <SeccionTarjeta
          primera
          titulo="Adicionales pedidos y sin aprobar"
          nota="Dinero que ya se pidió y que todavía no cuenta en ningún presupuesto: el BAC solo suma los adicionales aprobados."
        >
          {adicionales.cuantos === 0 ? (
            <p className="text-sm opacity-70">
              No hay ningún adicional en borrador. Cuando alguien redacte uno,
              aparecerá aquí con su impacto antes de que se apruebe.
            </p>
          ) : (
            <>
              <div
                className="rounded-lg border p-4"
                style={{ borderColor: "var(--borde)" }}
              >
                <p className="flex items-center gap-2 text-xs opacity-60">
                  <FileWarning className="size-4" aria-hidden="true" />
                  Impacto de la cartera si se aprobaran todos
                </p>
                <p className="mt-1 text-3xl font-semibold">
                  {soles(adicionales.importe)}
                </p>
                <p className="mt-1 text-xs opacity-60">
                  {adicionales.cuantos === 1
                    ? "1 adicional en borrador"
                    : `${adicionales.cuantos} adicionales en borrador`}
                  {" · "}
                  {adicionales.porObra.length === 1
                    ? "en 1 obra"
                    : `en ${adicionales.porObra.length} obras`}
                </p>
              </div>

              {/* Ordenadas por impacto: lo que hay que mirar primero es lo que
                  mas dinero mueve, no la obra mas antigua. */}
              <ul className="divide-y" style={{ borderColor: "var(--borde)" }}>
                {adicionales.porObra.map((o) => (
                  <li
                    key={o.obraId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/obras/${o.obraId}/movimientos`}
                        className="truncate text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {o.obraNombre}
                      </Link>
                      <p className="text-xs opacity-60">
                        {o.cuantos === 1
                          ? "1 adicional en borrador"
                          : `${o.cuantos} adicionales en borrador`}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{soles(o.importe)}</p>
                  </li>
                ))}
              </ul>

              <p className="text-xs opacity-60">
                Cada obra enlaza a sus Movimientos, que es donde el adicional
                se revisa y se aprueba. Aprobarlo es lo que lo mete en el
                presupuesto: hasta entonces esta cifra es una intención.
              </p>
            </>
          )}
        </SeccionTarjeta>
      </Tarjeta>
    </div>
  );
}
