"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Pencil,
  Plus,
  CheckCircle2,
  Ban,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import type { EncargoResumen } from "@/services/encargos.service";
import type { EstadoEncargo } from "@/generated/prisma/enums";
import { soles } from "@/utils/formato";
import { fechaCorta, hoy } from "@/utils/fechas";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import {
  accionValorizar,
  accionCambiarEstado,
} from "@/app/(dashboard)/obras/[id]/proveedores/acciones";

const TONO_ESTADO: Record<EstadoEncargo, TonoChip> = {
  VIGENTE: "curso",
  CERRADO: "exito",
  ANULADO: "neutro",
};

const ETIQUETA_ESTADO: Record<EstadoEncargo, string> = {
  VIGENTE: "Vigente",
  CERRADO: "Cerrado",
  ANULADO: "Anulado",
};

/**
 * Un encargo: el frente de un proveedor en la obra, con sus tres cifras
 * cruzadas —lo pactado, tu presupuesto y lo ya pedido— y su avance.
 *
 * Es cliente porque valorizar y cerrar/anular se hacen aqui mismo sin salir de
 * la lista: el residente valoriza a menudo, y mandarlo a otra pantalla por cada
 * corte seria un paso de mas cada vez.
 */
export function TarjetaEncargo({
  obraId,
  encargo,
  puedeGestionar,
  puedeValorizar,
}: {
  obraId: string;
  encargo: EncargoResumen;
  puedeGestionar: boolean;
  puedeValorizar: boolean;
}) {
  const c = encargo.cuentas;
  const anulado = encargo.estado === "ANULADO";
  const excedido = Number(c.excesoComprometido) > 0;
  const sobrePresupuesto = Number(c.contraPresupuesto) > 0;

  return (
    <li
      className="elevacion-1 rounded-xl border p-4"
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
        opacity: anulado ? 0.6 : 1,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium opacity-60">
              E-{String(encargo.numero).padStart(3, "0")}
            </span>
            <Chip tono={TONO_ESTADO[encargo.estado]}>
              {ETIQUETA_ESTADO[encargo.estado]}
            </Chip>
          </div>
          <h3 className="mt-1 text-sm font-semibold text-balance">
            {encargo.descripcion}
          </h3>
          <p className="mt-0.5 text-xs opacity-70">
            {encargo.proveedor.razonSocial} · RUC {encargo.proveedor.ruc} ·{" "}
            {encargo.partidas} partida(s)
          </p>
        </div>

        {puedeGestionar && !anulado && (
          <Link
            href={`/obras/${obraId}/proveedores/${encargo.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar
          </Link>
        )}
      </div>

      {/* Las tres cifras que miden lo mismo en bases distintas, sin
          mezclarlas: lo pactado con el proveedor, tu presupuesto para ese
          frente y lo que ya le has pedido. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Cifra etiqueta="Contratado" valor={soles(c.montoContratado)} />
        <Cifra
          etiqueta="Tu presupuesto"
          valor={soles(c.presupuestoFrente)}
          nota={
            Number(c.contraPresupuesto) === 0
              ? "igual a lo pactado"
              : `${sobrePresupuesto ? "+" : ""}${soles(c.contraPresupuesto)} vs contratado`
          }
          notaColor={
            sobrePresupuesto ? "var(--color-peligro)" : "var(--color-exito)"
          }
        />
        <Cifra
          etiqueta="Comprometido"
          valor={soles(c.comprometido)}
          nota={
            excedido
              ? `${soles(c.excesoComprometido)} sobre el contrato`
              : `${soles(c.porComprometer)} por pedir`
          }
          notaColor={excedido ? "var(--color-peligro)" : undefined}
        />
        <Cifra
          etiqueta="Valorizado"
          valor={soles(c.valorizado)}
          nota={
            c.avancePorcentaje === null
              ? "sin valorizar"
              : `${Number(c.avancePorcentaje).toFixed(1)}% ejecutado`
          }
        />
      </dl>

      {/* La barra de avance del proveedor sobre su contrato. */}
      {c.avancePorcentaje !== null && (
        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--borde)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(Number(c.avancePorcentaje), 100)}%`,
                backgroundColor: "var(--color-exito)",
              }}
            />
          </div>
          {encargo.ultimaValorizacion && (
            <p className="mt-1 text-xs opacity-60">
              Última valorización: {fechaCorta(encargo.ultimaValorizacion)}
            </p>
          )}
        </div>
      )}

      {(puedeValorizar || puedeGestionar) && !anulado && (
        <Acciones
          obraId={obraId}
          encargo={encargo}
          puedeGestionar={puedeGestionar}
          puedeValorizar={puedeValorizar}
        />
      )}
    </li>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
  notaColor,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  notaColor?: string;
}) {
  return (
    <div>
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums">{valor}</dd>
      {nota && (
        <dd className="text-xs" style={notaColor ? { color: notaColor } : { opacity: 0.6 }}>
          {nota}
        </dd>
      )}
    </div>
  );
}

/** El pie de la tarjeta: valorizar y cambiar de estado. */
function Acciones({
  obraId,
  encargo,
  puedeGestionar,
  puedeValorizar,
}: {
  obraId: string;
  encargo: EncargoResumen;
  puedeGestionar: boolean;
  puedeValorizar: boolean;
}) {
  const [valorizando, setValorizando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cambiarEstado(estado: EstadoEncargo) {
    setError(null);
    iniciar(async () => {
      const r = await accionCambiarEstado(obraId, encargo.id, estado);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div
      className="mt-3 border-t pt-3"
      style={{ borderColor: "var(--borde)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {puedeValorizar && (
          <button
            type="button"
            onClick={() => setValorizando((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <TrendingUp className="size-3.5" aria-hidden="true" />
            Valorizar
          </button>
        )}

        {puedeGestionar && encargo.estado === "VIGENTE" && (
          <button
            type="button"
            onClick={() => cambiarEstado("CERRADO")}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Cerrar
          </button>
        )}

        {puedeGestionar && encargo.estado === "CERRADO" && (
          <button
            type="button"
            onClick={() => cambiarEstado("VIGENTE")}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reabrir
          </button>
        )}

        {puedeGestionar && encargo.estado !== "ANULADO" && (
          <button
            type="button"
            onClick={() => cambiarEstado("ANULADO")}
            disabled={pendiente}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{
              borderColor: "color-mix(in oklab, var(--color-peligro) 40%, transparent)",
              color: "var(--color-peligro)",
            }}
          >
            <Ban className="size-3.5" aria-hidden="true" />
            Anular
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}

      {valorizando && puedeValorizar && (
        <FormularioValorizar
          obraId={obraId}
          encargoId={encargo.id}
          onListo={() => setValorizando(false)}
        />
      )}
    </div>
  );
}

/** El corte de avance del proveedor: fecha, % acumulado y una nota. */
function FormularioValorizar({
  obraId,
  encargoId,
  onListo,
}: {
  obraId: string;
  encargoId: string;
  onListo: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fecha, setFecha] = useState(fechaISO(hoy()));
  const [porcentaje, setPorcentaje] = useState("");
  const [nota, setNota] = useState("");

  function enviar() {
    setError(null);
    iniciar(async () => {
      const r = await accionValorizar(obraId, encargoId, {
        fecha,
        porcentaje,
        nota,
      });
      if (r.ok) onListo();
      else setError(r.error);
    });
  }

  return (
    <div
      className="mt-3 rounded-lg border p-3"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
    >
      <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr]">
        <label className="text-xs">
          <span className="mb-1 block opacity-70">Fecha del corte</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block opacity-70">% acumulado</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={porcentaje}
            onChange={(e) => setPorcentaje(e.target.value)}
            placeholder="0-100"
            className="w-28 rounded-lg border px-2 py-1.5 text-sm tabular-nums"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block opacity-70">Nota (opcional)</span>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué se valorizó en este corte"
            className="w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          />
        </label>
      </div>

      {error && (
        <p className="mt-2 text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={pendiente || !porcentaje}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {pendiente ? "Guardando..." : "Guardar valorización"}
        </button>
        <button
          type="button"
          onClick={onListo}
          className="rounded-lg border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** "YYYY-MM-DD" de una fecha de calendario, para el input date. */
function fechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
