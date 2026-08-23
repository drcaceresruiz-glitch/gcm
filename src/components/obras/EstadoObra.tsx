"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle, Play, Pause, Lock, TriangleAlert } from "lucide-react";
import {
  accionCambiarEstadoObra,
  type RespuestaEdicion,
} from "@/app/(dashboard)/obras/[id]/acciones";
import {
  transicionesDeObra,
  etiquetaTransicionObra,
  ETIQUETA_ESTADO_OBRA,
  TONO_ESTADO_OBRA,
  type EstadoObra as Estado,
} from "@/lib/obras";
import { Chip } from "@/components/ui/Chip";
import { fechaCorta } from "@/utils/fechas";

/**
 * El estado de la obra y los pasos que puede dar desde el.
 *
 * Se muestra el estado actual como chip y, al lado, un boton por cada
 * transicion permitida —"Iniciar ejecucion", "Paralizar", "Reanudar",
 * "Cerrar obra", "Reabrir"—. Que aparezcan solo las transiciones validas es
 * la misma regla que el servidor aplica; aqui solo se dibuja.
 *
 * "Reabrir" (CERRADA -> EN_EJECUCION) es la unica que ademas exige
 * `puedeReabrir`, no solo `puedeEditar`: es la transicion que deshace la
 * garantia de que una obra cerrada es historia, y por eso tiene su propio
 * permiso innegociable (`obra:reabrir`, solo ADMIN).
 */
export function EstadoObra({
  obraId,
  nombreObra,
  estado,
  puedeEditar,
  puedeReabrir,
  motivoParalizacion,
  fechaEstimadaReanudacion,
  faltaParaArrancar,
}: {
  obraId: string;
  nombreObra: string;
  estado: Estado;
  puedeEditar: boolean;
  puedeReabrir: boolean;
  motivoParalizacion: string | null;
  fechaEstimadaReanudacion: Date | null;
  /**
   * Lo que la obra no tiene todavia y deberia tener para arrancar.
   *
   * Sale de `requisitosParaEjecutar`, la MISMA regla que aplica el servidor,
   * y llega ya calculada desde el layout -que ya pide los hitos para el riel-.
   * Vacio = todo listo.
   */
  faltaParaArrancar: readonly { falta: string; consecuencia: string; bloqueante: boolean }[];
}) {
  const [respuesta, accion] = useActionState<RespuestaEdicion, FormData>(
    accionCambiarEstadoObra,
    { ok: true },
  );

  const transiciones = transicionesDeObra(estado);

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Chip tono={TONO_ESTADO_OBRA[estado]}>{ETIQUETA_ESTADO_OBRA[estado]}</Chip>

      {puedeEditar &&
        transiciones.map((destino) => {
          const esReabrir = estado === "CERRADA" && destino === "EN_EJECUCION";
          const esParalizar = destino === "PARALIZADA";

          if (esReabrir) {
            return puedeReabrir ? (
              <FormularioReabrir
                key={destino}
                obraId={obraId}
                nombreObra={nombreObra}
                accion={accion}
              />
            ) : null;
          }

          if (esParalizar) {
            return <FormularioParalizar key={destino} obraId={obraId} accion={accion} />;
          }

          // Arrancar con cosas sin hacer se puede, pero se firma: se enseña
          // que falta y hay que confirmarlo. Si no falta nada, es un boton.
          if (
            estado === "PLANIFICACION" &&
            destino === "EN_EJECUCION" &&
            faltaParaArrancar.length > 0
          ) {
            return (
              <FormularioArrancar
                key={destino}
                obraId={obraId}
                falta={faltaParaArrancar}
                accion={accion}
              />
            );
          }

          return (
            <form key={destino} action={accion}>
              <input type="hidden" name="id" value={obraId} />
              <input type="hidden" name="estado" value={destino} />
              <BotonTransicion desde={estado} hacia={destino} />
            </form>
          );
        })}

      {estado === "CERRADA" && (
        <span className="inline-flex items-center gap-1 text-xs opacity-60">
          <Lock className="size-3.5" aria-hidden="true" />
          Cerrada: no admite más cambios.
        </span>
      )}

      {estado === "PARALIZADA" && (
        <span className="inline-flex items-start gap-1 text-xs opacity-70">
          <Pause className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {motivoParalizacion ? (
            <span>
              {motivoParalizacion}
              {fechaEstimadaReanudacion && (
                <> — reanudación estimada: {fechaCorta(fechaEstimadaReanudacion)}</>
              )}
            </span>
          ) : (
            <span>Paralizada — motivo no registrado.</span>
          )}
        </span>
      )}

      {!respuesta.ok && respuesta.error && (
        <span
          role="alert"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "var(--color-peligro)" }}
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          {respuesta.error}
        </span>
      )}
    </div>
  );
}

function BotonTransicion({ desde, hacia }: { desde: Estado; hacia: Estado }) {
  const { pending } = useFormStatus();
  const etiqueta = etiquetaTransicionObra(desde, hacia);
  const cerrar = hacia === "CERRADA";

  const Icono = hacia === "PARALIZADA" ? Pause : cerrar ? Lock : Play;

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        // Cerrar es terminal salvo por reabrir: se confirma para que no se
        // dispare por inercia.
        if (cerrar && !window.confirm("¿Cerrar la obra? Solo se puede reabrir con permiso de administrador.")) {
          e.preventDefault();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-60"
      style={{
        borderColor: cerrar ? "var(--color-peligro)" : "var(--borde)",
        color: cerrar ? "var(--color-peligro)" : undefined,
      }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Icono className="size-3.5" aria-hidden="true" />
      )}
      {etiqueta}
    </button>
  );
}

/**
 * "Reabrir" no es un solo clic: revela un mini-formulario que pide escribir
 * el nombre de la obra, mismo patron que `BandejaSolicitudes.tsx` usa para
 * pedir el motivo de un rechazo. Y avisa de los dos efectos que reabrir
 * dispara solo, sin que nadie los pida: los avisos automaticos (`avisos-reloj`)
 * vuelven a procesar la obra en el siguiente tick del cron, y una semana de
 * Plan Semanal que quedara ABIERTA al cerrar reaparece en el tablero de la
 * empresa. Ninguno de los dos se corrige aqui —son comportamiento de otros
 * modulos—, pero que sea una sorpresa es peor que avisarlo.
 */
function FormularioReabrir({
  obraId,
  nombreObra,
  accion,
}: {
  obraId: string;
  nombreObra: string;
  accion: (datos: FormData) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <Play className="size-3.5" aria-hidden="true" />
        Reabrir
      </button>
    );
  }

  return (
    <form
      action={accion}
      className="w-full max-w-md space-y-2.5 rounded-lg border p-3"
      style={{ borderColor: "var(--color-alerta)" }}
    >
      <input type="hidden" name="id" value={obraId} />
      <input type="hidden" name="estado" value="EN_EJECUCION" />

      <p className="flex items-start gap-1.5 text-xs text-pretty opacity-80">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Al reabrir, los avisos automáticos (restricciones vencidas,
        valorizaciones pendientes) se reanudan de inmediato y pueden avisar
        de golpe de cosas que llevan tiempo paradas. Si quedó una semana del
        Plan Semanal abierta al cerrar, también vuelve a aparecer en el
        tablero de la empresa.
      </p>

      <label className="block text-xs">
        <span className="opacity-70">
          Escribe el nombre de la obra para confirmar:{" "}
        </span>
        <strong>{nombreObra}</strong>
        <input
          type="text"
          name="confirmacionNombre"
          required
          autoComplete="off"
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <div className="flex items-center gap-3">
        <BotonConfirmarReabrir />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium underline opacity-70"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonConfirmarReabrir() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="size-3.5" aria-hidden="true" />
      )}
      Confirmar reapertura
    </button>
  );
}

/**
 * "Paralizar" tampoco es un solo clic: pide el motivo (obligatorio) y una
 * fecha estimada de reanudación (opcional, porque a veces de verdad no se
 * sabe), mismo patrón `FormularioReabrir`. Paralizada, la obra sigue
 * admitiendo cerrar lo que ya estaba en curso (aprobar movimientos,
 * evidencia, cerrar la semana, resolver restricciones); lo que bloquea es
 * abrir trabajo nuevo — el formulario lo dice para que no sea sorpresa.
 */
function FormularioParalizar({
  obraId,
  accion,
}: {
  obraId: string;
  accion: (datos: FormData) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <Pause className="size-3.5" aria-hidden="true" />
        Paralizar
      </button>
    );
  }

  return (
    <form
      action={accion}
      className="w-full max-w-md space-y-2.5 rounded-lg border p-3"
      style={{ borderColor: "var(--color-alerta)" }}
    >
      <input type="hidden" name="id" value={obraId} />
      <input type="hidden" name="estado" value="PARALIZADA" />

      <p className="flex items-start gap-1.5 text-xs text-pretty opacity-80">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Mientras dure, no se podrá abrir trabajo nuevo (orden, encargo,
        compromiso). Sí se puede seguir cerrando lo que ya estaba en curso:
        aprobar movimientos pendientes, subir evidencia, cerrar la semana
        abierta, resolver restricciones.
      </p>

      <label className="block text-xs">
        <span className="opacity-70">Motivo de la paralización:</span>
        <textarea
          name="motivoParalizacion"
          required
          rows={2}
          maxLength={300}
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <label className="block text-xs">
        <span className="opacity-70">
          Fecha estimada de reanudación (opcional):
        </span>
        <input
          type="date"
          name="fechaEstimadaReanudacion"
          className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      <div className="flex items-center gap-3">
        <BotonConfirmarParalizar />
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium underline opacity-70"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Arrancar la obra cuando algo minimo no esta hecho.
 *
 * Mismo patron de revelar que `FormularioParalizar`, y por el mismo motivo:
 * la decision se toma leyendo lo que falta, no pulsando un boton de paso.
 *
 * Lo que falta y por que importa NO se escribe aqui: llega de
 * `requisitosParaEjecutar`, que es la misma regla que aplica el servidor. Si
 * se redactara en la pantalla, el dia que cambie el criterio habria dos
 * versiones de que es una obra lista para arrancar.
 *
 * Lo BLOQUEANTE -no hay ni una partida- no trae casilla: ahi no hay nada que
 * confirmar, el servidor lo va a rechazar igual y ofrecer la casilla seria
 * prometer algo que no se puede cumplir.
 */
function FormularioArrancar({
  obraId,
  falta,
  accion,
}: {
  obraId: string;
  falta: readonly { falta: string; consecuencia: string; bloqueante: boolean }[];
  accion: (datos: FormData) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const bloqueado = falta.some((f) => f.bloqueante);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <Play className="size-3.5" aria-hidden="true" />
        Iniciar ejecución
      </button>
    );
  }

  return (
    <form
      action={accion}
      className="w-full max-w-lg space-y-2.5 rounded-lg border p-3"
      style={{ borderColor: "var(--color-alerta)" }}
    >
      <input type="hidden" name="id" value={obraId} />
      <input type="hidden" name="estado" value="EN_EJECUCION" />

      <p className="flex items-start gap-1.5 text-xs font-medium">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {bloqueado
          ? "Esta obra todavía no puede arrancar:"
          : "Esta obra arrancaría con cosas sin hacer:"}
      </p>

      <ul className="space-y-2">
        {falta.map((f) => (
          <li key={f.falta} className="text-xs">
            <span className="font-medium">{f.falta}</span>
            <span className="block opacity-70">{f.consecuencia}</span>
          </li>
        ))}
      </ul>

      {!bloqueado && (
        <label className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            name="confirmarSinRequisitos"
            required
            className="mt-0.5"
          />
          <span>
            Lo he leído y quiero arrancar igual. Sé que hasta que se complete,
            la obra medirá su avance contra sí misma.
          </span>
        </label>
      )}

      <div className="flex items-center gap-3">
        {!bloqueado && <BotonConfirmarArranque />}
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs font-medium underline opacity-70"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonConfirmarArranque() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Play className="size-3.5" aria-hidden="true" />
      )}
      Arrancar de todos modos
    </button>
  );
}

function BotonConfirmarParalizar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Pause className="size-3.5" aria-hidden="true" />
      )}
      Confirmar paralización
    </button>
  );
}
