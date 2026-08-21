"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { CATEGORIAS_NOTA } from "@/lib/notas";
import type { NotaResumen, ResultadoNota } from "@/services/notas.service";
import type { CategoriaNota } from "@/generated/prisma/enums";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * La bitacora libre de la obra.
 *
 * Sin `/nuevo` aparte: el alta va arriba, la lista debajo, todo en una
 * pagina, igual que la Galeria. Cada fila se transforma en su propio
 * formulario al editar, en vez de abrir un dialogo aparte.
 */

export interface AccionesNotas {
  crear: (obraId: string, datos: FormData) => Promise<ResultadoNota>;
  editar: (obraId: string, notaId: string, datos: FormData) => Promise<ResultadoNota>;
  alternarAtendida: (
    obraId: string,
    notaId: string,
    atendida: boolean,
  ) => Promise<ResultadoNota>;
  eliminar: (obraId: string, notaId: string) => Promise<ResultadoNota>;
}

/** "YYYY-MM-DD" leido en UTC, no en hora local: la fecha es un dia de
 * calendario, y convertirla a hora de Lima (UTC-5) la correria un dia hacia
 * atras justo despues de medianoche. Mismo cuidado que exige `calendario.ts`. */
function aInputFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function diasDesde(fecha: Date, ahora: Date): number {
  return Math.floor((ahora.getTime() - fecha.getTime()) / 86_400_000);
}

function textoRecordatorio(fecha: Date, vencida: boolean, ahora: Date): string {
  if (vencida) {
    const n = diasDesde(fecha, ahora);
    return `Vencida hace ${n} ${n === 1 ? "día" : "días"} (${FORMATO_FECHA.format(fecha)})`;
  }
  return `Vence el ${FORMATO_FECHA.format(fecha)}`;
}

function ordenar(notas: NotaResumen[]): NotaResumen[] {
  return [...notas].sort((a, b) => {
    // Atendidas al final, siempre: ya no piden nada.
    if (a.atendida !== b.atendida) return a.atendida ? 1 : -1;
    // Entre pendientes: vencidas primero.
    if (a.vencida !== b.vencida) return a.vencida ? -1 : 1;
    // Con fecha antes que sin fecha: lo que tiene un compromiso de tiempo
    // pesa mas que lo que no.
    const fa = a.fechaRecordatorio?.getTime();
    const fb = b.fechaRecordatorio?.getTime();
    if (fa !== undefined && fb !== undefined) return fa - fb;
    if (fa !== undefined) return -1;
    if (fb !== undefined) return 1;
    // Sin fecha en ninguna: mas nueva primero.
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function ListaNotas({
  obraId,
  notas,
  puedeCrear,
  puedeGestionar,
  acciones,
}: {
  obraId: string;
  notas: NotaResumen[];
  puedeCrear: boolean;
  puedeGestionar: boolean;
  acciones: AccionesNotas;
}) {
  const ahora = new Date();
  const ordenadas = ordenar(notas);

  return (
    <div className="space-y-5">
      {puedeCrear && (
        <FormularioNota
          obraId={obraId}
          onEnviar={(o, datos) => acciones.crear(o, datos)}
          botonTexto="Anotar"
        />
      )}

      {ordenadas.length > 0 && (
        <ul className="space-y-2">
          {ordenadas.map((nota) => (
            <FilaNota
              key={nota.id}
              obraId={obraId}
              nota={nota}
              ahora={ahora}
              puedeCrear={puedeCrear}
              puedeGestionar={puedeGestionar}
              acciones={acciones}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * El formulario de alta, y tambien el de edicion: la misma pieza sirve para
 * las dos porque los campos son identicos y solo cambia a donde se manda.
 */
function FormularioNota({
  obraId,
  notaId,
  valores,
  onEnviar,
  botonTexto,
  onCancelar,
}: {
  obraId: string;
  notaId?: string;
  valores?: { categoria: CategoriaNota; titulo: string; cuerpo: string; fechaRecordatorio: string };
  /// Una unica firma, tanto para crear como para editar: quien llama ya
  /// decide con que datos, con un closure que cierra sobre el notaId si
  /// hace falta. Evita hacer malabares de tipos con firmas distintas.
  onEnviar: (obraId: string, datos: FormData) => Promise<ResultadoNota>;
  botonTexto: string;
  onCancelar?: () => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaNota>(
    valores?.categoria ?? "OPERATIVO",
  );
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      onSubmit={async (e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        setOcupada(true);
        setError(null);

        const r = await onEnviar(obraId, datos);

        setOcupada(false);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.refresh();
        if (onCancelar) onCancelar();
        else e.currentTarget.reset();
      }}
    >
      <div>
        <p className="mb-2 text-sm font-medium">Categoría</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIAS_NOTA.map((opcion) => {
            const Icono = opcion.icono;
            const elegida = categoria === opcion.valor;
            return (
              <label
                key={opcion.valor}
                className="cursor-pointer rounded-lg border px-2.5 py-2"
                style={{
                  borderColor: elegida ? "var(--color-marca-600)" : "var(--borde)",
                  backgroundColor: elegida
                    ? "color-mix(in oklab, var(--color-marca-500) 10%, transparent)"
                    : "var(--fondo)",
                }}
                title={opcion.ayuda}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <input
                    type="radio"
                    name="categoria"
                    value={opcion.valor}
                    checked={elegida}
                    onChange={() => setCategoria(opcion.valor)}
                    className="sr-only"
                  />
                  <Icono className="size-3.5" aria-hidden="true" />
                  {opcion.titulo}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <CampoTexto
        id={notaId ? `titulo-${notaId}` : "titulo"}
        name="titulo"
        etiqueta="Título"
        defaultValue={valores?.titulo}
        maxLength={150}
        required
      />

      <div className="space-y-1.5">
        <label
          htmlFor={notaId ? `cuerpo-${notaId}` : "cuerpo"}
          className="block text-sm font-medium"
        >
          Nota
        </label>
        <textarea
          id={notaId ? `cuerpo-${notaId}` : "cuerpo"}
          name="cuerpo"
          rows={3}
          required
          defaultValue={valores?.cuerpo}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
        {/* El aviso que separa esto de una Restriccion del Lookahead. Estatico
            y siempre visible, no condicionado a la categoria elegida: es mas
            facil de mantener y cubre el caso real, que es no saber cual de
            las dos pantallas toca. */}
        <p className="text-xs opacity-60">
          ¿Esto explica por qué una tarea está bloqueada? Usa una{" "}
          <Link
            href={`/obras/${obraId}/lookahead`}
            className="underline"
          >
            Restricción en el Lookahead
          </Link>
          : tiene responsable y fecha de compromiso. La nota es para lo demás.
        </p>
      </div>

      <CampoTexto
        id={notaId ? `fecha-${notaId}` : "fechaRecordatorio"}
        name="fechaRecordatorio"
        type="date"
        etiqueta="Recordatorio (opcional)"
        defaultValue={valores?.fechaRecordatorio}
        ayuda="Si lo pones, esta nota aparece en «Próximos recordatorios» de la obra."
      />

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={ocupada}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {ocupada && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          {botonTexto}
        </button>
        {onCancelar && (
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

const ICONO_CATEGORIA = Object.fromEntries(
  CATEGORIAS_NOTA.map((c) => [c.valor, c.icono]),
) as Record<CategoriaNota, (typeof CATEGORIAS_NOTA)[number]["icono"]>;

const TITULO_CATEGORIA = Object.fromEntries(
  CATEGORIAS_NOTA.map((c) => [c.valor, c.titulo]),
) as Record<CategoriaNota, string>;

function FilaNota({
  obraId,
  nota,
  ahora,
  puedeCrear,
  puedeGestionar,
  acciones,
}: {
  obraId: string;
  nota: NotaResumen;
  ahora: Date;
  puedeCrear: boolean;
  puedeGestionar: boolean;
  acciones: AccionesNotas;
}) {
  const [editando, setEditando] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function correr(operacion: () => Promise<ResultadoNota>) {
    setOcupada(true);
    setError(null);
    const r = await operacion();
    setOcupada(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  if (editando) {
    return (
      <li>
        <FormularioNota
          obraId={obraId}
          notaId={nota.id}
          valores={{
            categoria: nota.categoria,
            titulo: nota.titulo,
            cuerpo: nota.cuerpo,
            fechaRecordatorio: nota.fechaRecordatorio
              ? aInputFecha(nota.fechaRecordatorio)
              : "",
          }}
          onEnviar={(o, datos) => acciones.editar(o, nota.id, datos)}
          botonTexto="Guardar"
          onCancelar={() => setEditando(false)}
        />
      </li>
    );
  }

  const Icono = ICONO_CATEGORIA[nota.categoria];

  return (
    <li
      className="rounded-xl border p-4"
      style={{
        borderColor: nota.vencida ? "var(--color-peligro)" : "var(--borde)",
        backgroundColor: "var(--superficie)",
        opacity: nota.atendida ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs opacity-60">
            <Icono className="size-3.5" aria-hidden="true" />
            {TITULO_CATEGORIA[nota.categoria]}
            {nota.vencida && (
              <span
                className="inline-flex items-center gap-1 font-medium"
                style={{ color: "var(--color-peligro)" }}
              >
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                vencida
              </span>
            )}
          </div>
          <p className="mt-1 font-medium">{nota.titulo}</p>
          <p className="mt-0.5 text-sm text-pretty opacity-80">{nota.cuerpo}</p>
          {nota.fechaRecordatorio && (
            <p
              className="mt-1.5 text-xs font-medium"
              style={{
                color: nota.vencida ? "var(--color-peligro)" : "var(--texto-suave)",
              }}
            >
              {textoRecordatorio(nota.fechaRecordatorio, nota.vencida, ahora)}
            </p>
          )}
          <p className="mt-1.5 text-xs opacity-50">
            {nota.atendida && nota.atendidaPor
              ? `Atendida por ${nota.atendidaPor}`
              : `Anotado por ${nota.creadoPor}`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {ocupada && (
            <LoaderCircle className="size-3.5 animate-spin opacity-60" aria-hidden="true" />
          )}

          {puedeCrear && (
            <button
              type="button"
              disabled={ocupada}
              onClick={() =>
                correr(() =>
                  acciones.alternarAtendida(obraId, nota.id, !nota.atendida),
                )
              }
              title={nota.atendida ? "Reabrir" : "Marcar atendida"}
              aria-label={nota.atendida ? "Reabrir la nota" : "Marcar la nota como atendida"}
              className="rounded p-1.5 opacity-60 hover:opacity-100"
              style={{ color: nota.atendida ? undefined : "var(--color-exito)" }}
            >
              {nota.atendida ? (
                <RotateCcw className="size-4" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
            </button>
          )}

          {puedeGestionar && (
            <>
              <button
                type="button"
                onClick={() => setEditando(true)}
                aria-label="Editar nota"
                className="rounded p-1.5 opacity-60 hover:opacity-100"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={ocupada}
                onClick={() => {
                  if (window.confirm("¿Borrar esta nota? No se puede deshacer.")) {
                    void correr(() => acciones.eliminar(obraId, nota.id));
                  }
                }}
                aria-label="Borrar nota"
                className="rounded p-1.5 opacity-60 hover:opacity-100"
                style={{ color: "var(--color-peligro)" }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}
    </li>
  );
}
