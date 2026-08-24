import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import {
  listarMovimientos,
  obtenerPresupuestoVigente,
  SinLineaBaseError,
  type PresupuestoVigente,
} from "@/services/movimientos.service";
import { puede } from "@/lib/rbac";
import { Paginacion } from "@/components/ui/Paginacion";
import { PanelVigente } from "@/components/movimientos/PanelVigente";
import { HistorialMovimientos } from "@/components/movimientos/HistorialMovimientos";
import {
  AvisoSinEscritura,
  SiSePuedeEscribir,
} from "@/components/obras/EscrituraDeLaObra";

export const metadata: Metadata = { title: "Movimientos presupuestales" };

/**
 * Reconversiones, adicionales y deductivos de una obra.
 *
 * La pantalla responde a dos preguntas: «cuanto vale hoy esta obra despues
 * de los ajustes» (el panel del vigente) y «que se ha movido, quien lo
 * aprobo y por que» (el historial). Dar de alta un movimiento vive en otra
 * ruta: con 360 partidas, el formulario debajo de la tabla quedaria a media
 * pantalla de distancia.
 */
export default async function MovimientosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    creado?: string;
    aprobado?: string;
    eliminado?: string;
    nuevas?: string;
    todas?: string;
    p?: string;
  }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "movimiento:leer")) redirect(`/obras/${id}`);

  const consulta = await searchParams;
  const { creado, aprobado, eliminado, nuevas, todas } = consulta;
  // Llega de nuestra propia redireccion, pero se sanea igual: es un numero
  // que se va a imprimir, y con manipularlo lo unico que se consigue es leer
  // una cifra equivocada en el propio aviso.
  const partidasNuevas = Number(nuevas);
  const hayPartidasNuevas = Number.isInteger(partidasNuevas) && partidasNuevas > 0;

  /**
   * Sin linea base aprobada no existe el concepto de «encima de la base»,
   * y el servicio lo dice lanzando. Se atrapa aqui para explicarlo en vez
   * de mostrar una pantalla de error.
   */
  let presupuesto: PresupuestoVigente | null = null;
  try {
    presupuesto = await obtenerPresupuestoVigente(sesion, id);
  } catch (error) {
    if (!(error instanceof SinLineaBaseError)) throw error;
  }

  const movimientos = presupuesto
    ? await listarMovimientos(sesion, id, { pagina: consulta.p })
    : null;
  const puedeCrear = puede(sesion, "movimiento:crear");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          Movimientos presupuestales
        </h2>

        {/* Una obra cerrada no admite movimientos nuevos: lo rechaza
            `crearMovimiento`. El motivo se explica una vez, aqui debajo. */}
        {presupuesto && puedeCrear && (
          <SiSePuedeEscribir>
            <Link
              href={`/obras/${id}/movimientos/nuevo`}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Registrar movimiento
            </Link>
          </SiSePuedeEscribir>
        )}
      </div>

      <AvisoSinEscritura />

      {creado && (
        <Aviso icono={CheckCircle2} tono="exito">
          Movimiento {creado} guardado como borrador. Todavía no ajusta el
          presupuesto: hay que aprobarlo.
        </Aviso>
      )}

      {aprobado && (
        <Aviso icono={Lock} tono="exito">
          Movimiento {aprobado} aprobado. Ya cuenta en el presupuesto vigente.
          {hayPartidasNuevas && (
            <>
              {" "}
              Dio de alta{" "}
              <strong>
                {partidasNuevas}{" "}
                {partidasNuevas === 1 ? "partida nueva" : "partidas nuevas"}
              </strong>
              , que todavía no cuentan en el avance porque no están enlazadas a
              ninguna tarea.{" "}
              <Link
                href={`/obras/${id}/cronograma/mapeo`}
                className="font-medium underline underline-offset-2"
              >
                Enlazarlas ahora
              </Link>
              .
            </>
          )}
        </Aviso>
      )}

      {eliminado && (
        <Aviso icono={Trash2} tono="exito">
          Borrador {eliminado} eliminado.
        </Aviso>
      )}

      {presupuesto && movimientos ? (
        <>
          <PanelVigente
            presupuesto={presupuesto}
            obraId={id}
            mostrarTodas={todas === "1"}
          />

          <HistorialMovimientos
            movimientos={movimientos.filas}
            obraId={id}
            puedeAprobar={puede(sesion, "movimiento:aprobar")}
            puedeCrear={puedeCrear}
          />

          <Paginacion
            pagina={movimientos.pagina}
            totalPaginas={movimientos.totalPaginas}
            total={movimientos.total}
            etiqueta="movimientos"
            // Se conserva `todas`, que es un filtro del panel del vigente y
            // el usuario acaba de ponerlo. No los avisos de un solo uso.
            params={{ todas }}
          />
        </>
      ) : (
        <SinLineaBase obraId={id} puedeVerLineaBase={puede(sesion, "linea_base:leer")} />
      )}
    </div>
  );
}

function Aviso({
  icono: Icono,
  tono,
  children,
}: {
  icono: LucideIcon;
  tono: "exito" | "alerta";
  children: React.ReactNode;
}) {
  const color = tono === "exito" ? "var(--color-exito)" : "var(--color-alerta)";

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`,
      }}
    >
      <Icono className="size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Una obra sin linea base aprobada no puede tener movimientos: no hay nada
 * sobre lo que ajustar. Se explica el orden en vez de dejar la pantalla en
 * blanco, porque el paso que falta esta en otra pantalla.
 */
function SinLineaBase({
  obraId,
  puedeVerLineaBase,
}: {
  obraId: string;
  puedeVerLineaBase: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-dashed p-10 text-center"
      style={{ borderColor: "var(--borde)" }}
    >
      <Lock className="mx-auto size-8 opacity-40" aria-hidden="true" />
      <p className="mt-3 text-sm opacity-70">
        Esta obra todavía no tiene una línea base aprobada.
      </p>
      <p className="mx-auto mt-1 max-w-lg text-sm text-pretty opacity-60">
        Los movimientos van ENCIMA de la línea base y se miden contra ella,
        así que primero hay que congelar el presupuesto contractual. Mientras
        no exista, el presupuesto se corrige editando las partidas.
      </p>

      {puedeVerLineaBase && (
        <Link
          href={`/obras/${obraId}/revisiones`}
          className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline"
        >
          Ir a las revisiones del presupuesto
        </Link>
      )}
    </div>
  );
}
