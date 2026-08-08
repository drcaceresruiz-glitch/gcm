"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Diamond, Flag, LoaderCircle, PencilLine } from "lucide-react";
import type { CronogramaVigente } from "@/services/cronograma.service";
import { accionRegistrarAvance } from "@/app/(dashboard)/obras/[id]/cronograma/acciones";
import { fechaCorta, fechaCronograma } from "@/utils/fechas";
import { decimal } from "@/utils/formato";

type Fila = CronogramaVigente["tareas"][number];

/**
 * El cronograma tal como lo lee el residente: una fila por tarea, con el plan
 * a la izquierda y el avance a la derecha.
 *
 * Las dos barras van superpuestas y no una al lado de la otra: lo que se mira
 * de un vistazo no es cuanto lleva cada tarea, sino si va por delante o por
 * detras de lo previsto, y eso solo se ve comparando en el mismo eje.
 *
 * Es componente de cliente porque el reporte de avance se abre dentro de la
 * propia fila. Un dialogo aparte obligaria a repetir en el a que tarea
 * pertenece, que es justo el dato que la fila ya esta ensenando.
 */
export function TablaCronograma({
  obraId,
  tareas,
  puedeRegistrar,
}: {
  obraId: string;
  tareas: Fila[];
  puedeRegistrar: boolean;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  /**
   * Se llama a la accion a mano en vez de con `useActionState` para poder
   * cerrar la fila SOLO cuando el servidor confirma. Dejarla abierta tras
   * guardar invita a reportar dos veces lo mismo, y cerrarla antes de la
   * confirmacion daria por bueno un reporte que quiza fue rechazado.
   */
  function enviar(datos: FormData) {
    iniciarTransicion(async () => {
      const resultado = await accionRegistrarAvance({ ok: true }, datos);

      if (resultado.ok) {
        setAbierta(null);
        setError(null);
      } else {
        setError(resultado.error ?? "No se pudo guardar el reporte.");
      }
    });
  }

  const columnas = puedeRegistrar ? 8 : 7;

  return (
    <div
      className="overflow-x-auto rounded-lg border"
      style={{ borderColor: "var(--borde)" }}
    >
      <table className="w-full min-w-[58rem] text-sm">
        <caption className="sr-only">
          Tareas del cronograma con su avance planeado y real
        </caption>
        <thead>
          <tr
            className="text-left text-xs uppercase"
            style={{ backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)" }}
          >
            <th scope="col" className="px-3 py-2 font-medium">Codigo</th>
            <th scope="col" className="px-3 py-2 font-medium">Tarea</th>
            <th scope="col" className="px-3 py-2 font-medium">Comienzo</th>
            <th scope="col" className="px-3 py-2 font-medium">Fin</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Dias</th>
            <th scope="col" className="px-3 py-2 font-medium">Avance</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Desfase</th>
            {puedeRegistrar && <th scope="col" className="px-3 py-2 font-medium sr-only">Reportar</th>}
          </tr>
        </thead>
        <tbody>
          {tareas.map((t) => (
            <FilaTarea
              key={t.uid}
              tarea={t}
              obraId={obraId}
              puedeRegistrar={puedeRegistrar}
              abierta={abierta === t.uid}
              alAbrir={() => {
                setError(null);
                setAbierta(abierta === t.uid ? null : t.uid);
              }}
              columnas={columnas}
              accion={enviar}
              pendiente={pendiente}
              error={abierta === t.uid ? (error ?? undefined) : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaTarea({
  tarea: t,
  obraId,
  puedeRegistrar,
  abierta,
  alAbrir,
  columnas,
  accion,
  pendiente,
  error,
}: {
  tarea: Fila;
  obraId: string;
  puedeRegistrar: boolean;
  abierta: boolean;
  alAbrir: () => void;
  columnas: number;
  accion: (datos: FormData) => void;
  pendiente: boolean;
  error?: string;
}) {
  return (
    <>
      <tr
        className="border-t"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: t.esResumen
            ? "color-mix(in oklab, var(--color-marca-500) 7%, transparent)"
            : undefined,
        }}
      >
        <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
          {t.codigo ?? ""}
        </td>

        <td
          className={`px-3 py-1.5 ${t.esResumen ? "font-semibold" : ""}`}
          // La sangria sale del nivel de esquema y no del codigo: en el
          // archivo real "7.3.1" es hermana de "7.3", no su hija.
          style={{ paddingLeft: `${0.75 + (t.nivel - 1) * 0.85}rem` }}
        >
          <span className="flex items-center gap-1.5">
            {t.esHito && (
              <Diamond
                className="size-3 shrink-0"
                style={{ color: "var(--color-marca-600)" }}
                aria-label="Hito"
              />
            )}
            {t.esCritico && !t.esHito && (
              <Flag
                className="size-3 shrink-0"
                style={{ color: "var(--color-peligro)" }}
                aria-label="En la ruta critica"
              />
            )}
            <span>{t.nombre}</span>
          </span>
        </td>

        <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
          {fechaCronograma(t.inicio)}
        </td>
        <td className="px-3 py-1.5 whitespace-nowrap opacity-70">
          {fechaCronograma(t.fin)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
          {decimal(t.duracionDias)}
        </td>

        <td className="px-3 py-1.5">
          <BarraAvance tarea={t} />
        </td>

        <td className="px-3 py-1.5 text-right font-medium tabular-nums whitespace-nowrap">
          <Desfase valor={t.desfase} />
        </td>

        {puedeRegistrar && (
          <td className="px-3 py-1.5 text-right whitespace-nowrap">
            {/* Las tareas resumen no se reportan: su porcentaje es el de sus
                hijas, y dejar reportarlo por separado permitiria decir que un
                capitulo va al 80% con todas sus partidas a cero. */}
            {!t.esResumen && (
              <button
                type="button"
                onClick={alAbrir}
                aria-expanded={abierta}
                className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                style={{ borderColor: "var(--borde)" }}
              >
                <PencilLine className="size-3" aria-hidden="true" />
                Reportar
              </button>
            )}
          </td>
        )}
      </tr>

      {abierta && (
        <tr style={{ backgroundColor: "var(--superficie)" }}>
          <td colSpan={columnas} className="px-3 py-3">
            <FormularioAvance
              tarea={t}
              obraId={obraId}
              accion={accion}
              pendiente={pendiente}
              error={error}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/** La fecha de HOY del equipo del usuario, en "YYYY-MM-DD". */
function hoyLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function FormularioAvance({
  tarea: t,
  obraId,
  accion,
  pendiente,
  error,
}: {
  tarea: Fila;
  obraId: string;
  accion: (datos: FormData) => void;
  pendiente: boolean;
  error?: string;
}) {
  // Se calcula al abrir el formulario, que solo ocurre tras un clic y por
  // tanto siempre en el navegador: asi la fecha es la del usuario y no la del
  // servidor, sin arriesgar un desajuste de hidratacion.
  const hoy = hoyLocal();

  return (
    <form action={accion} className="space-y-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="uid" value={t.uid} />

      <p className="text-xs opacity-70">
        Reportar avance de <strong>{t.codigo ? `${t.codigo} ` : ""}{t.nombre}</strong>.
        {t.avance
          ? ` Ultimo reporte: ${decimal(t.avance.porcentaje, "")}% el ${fechaCorta(t.avance.fecha)}, por ${t.avance.reportadoPor}.`
          : ` MS Project dice ${decimal(t.porcentajeArchivo, "")}%.`}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="block opacity-70">% ejecutado</span>
          <input
            name="porcentaje"
            type="number"
            min={0}
            max={100}
            step="0.01"
            required
            defaultValue={t.porcentajeReal}
            className="mt-1 w-28 rounded-lg border px-2 py-1.5 text-sm tabular-nums"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>

        <label className="text-xs">
          <span className="block opacity-70">Fecha del reporte</span>
          <input
            name="fecha"
            type="date"
            required
            max={hoy}
            defaultValue={hoy}
            className="mt-1 rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>

        <label className="min-w-48 flex-1 text-xs">
          <span className="block opacity-70">Nota (opcional)</span>
          <input
            name="nota"
            type="text"
            maxLength={500}
            placeholder="Que se ejecuto, quien, incidencias..."
            className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>

        <button
          type="submit"
          disabled={pendiente}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pendiente && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
          Guardar reporte
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <p className="text-xs opacity-60">
        Cada reporte se guarda aparte, con su fecha y su autor: no se sobrescribe
        el anterior. De esa serie sale la curva de avance.
      </p>
    </form>
  );
}

/**
 * Planeado y real en el mismo eje.
 *
 * El planeado va como una marca fina sobre la barra en vez de como una
 * segunda barra: es una referencia, no una magnitud que competir. Asi la
 * lectura es «la barra llega o no llega a la marca».
 */
function BarraAvance({ tarea }: { tarea: Fila }) {
  const acotar = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const p = acotar(tarea.porcentajePlaneado);
  const r = acotar(tarea.porcentajeReal);

  const titulo = tarea.avance
    ? `Reportado por ${tarea.avance.reportadoPor} el ${fechaCorta(tarea.avance.fecha)}` +
      (tarea.discrepa ? `. MS Project dice ${decimal(tarea.porcentajeArchivo, "")}%.` : "")
    : "Segun MS Project. Todavia nadie lo ha reportado desde obra.";

  return (
    <span className="flex items-center gap-2" title={titulo}>
      <span
        className="relative block h-2 w-28 shrink-0 overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
        role="img"
        aria-label={`Real ${r}% sobre un plan de ${p}%`}
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${r}%`,
            backgroundColor:
              r + 0.001 >= p ? "var(--color-exito)" : "var(--color-alerta)",
          }}
        />
        {/* La marca del plan se dibuja encima, para que se vea aunque la
            barra ya la haya pasado. */}
        <span
          className="absolute inset-y-0 w-0.5"
          style={{ left: `calc(${p}% - 1px)`, backgroundColor: "var(--texto)" }}
        />
      </span>

      <span className="tabular-nums" style={{ opacity: tarea.avance ? 1 : 0.6 }}>
        {decimal(tarea.porcentajeReal, "")}%
      </span>
    </span>
  );
}

function Desfase({ valor }: { valor: string }) {
  const n = Number(valor) || 0;
  const signo = n > 0 ? "+" : "";

  return (
    <span
      style={{
        color:
          n < 0
            ? "var(--color-peligro)"
            : n > 0
              ? "var(--color-exito)"
              : undefined,
        opacity: n === 0 ? 0.5 : 1,
      }}
    >
      {signo}
      {decimal(valor, "")}%
    </span>
  );
}
