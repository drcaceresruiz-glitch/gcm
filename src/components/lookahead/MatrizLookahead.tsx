"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  CircleCheck,
  CircleDashed,
  Ban,
  RefreshCw,
  LoaderCircle,
  CalendarPlus,
} from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { FLUJOS_RESTRICCION, SEMANAS_SUGERIDAS } from "@/lib/lookahead";
import { PanelComprometer } from "@/components/lookahead/PanelComprometer";
import {
  BotonEvidencia,
  PanelEvidencia,
} from "@/components/evidencia/PanelEvidencia";
import {
  accionSincronizar,
  accionAlternarRestriccion,
} from "@/app/(dashboard)/obras/[id]/lookahead/acciones";
import type { EstadoLookahead } from "@/generated/prisma/enums";
import type { LookaheadDatos } from "@/services/lookahead.service";

/**
 * La matriz del Lookahead: tareas de la ventana (filas) x los 7 flujos de
 * restriccion (columnas de checkbox) + el semaforo de confiabilidad. Marcar una
 * restriccion dispara la accion de servidor, que recalcula el estado y revalida.
 */

const TONO_ESTADO: Record<EstadoLookahead, TonoChip> = {
  LISTO: "exito",
  PENDIENTE: "alerta",
  BLOQUEADO: "peligro",
};

const ETIQUETA_ESTADO: Record<EstadoLookahead, string> = {
  LISTO: "Listo",
  PENDIENTE: "Pendiente",
  BLOQUEADO: "Bloqueado",
};

const ICONO_ESTADO = {
  LISTO: CircleCheck,
  PENDIENTE: CircleDashed,
  BLOQUEADO: Ban,
} as const;

const ETIQUETA_FLUJO = new Map(
  FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
);

export function MatrizLookahead({
  obraId,
  datos,
  fechaProximoCorte,
  abrirEvidencia = null,
  abrirTarea = null,
}: {
  obraId: string;
  datos: LookaheadDatos;
  /// Fecha ISO del corte que se abriria si no hay ninguna semana abierta.
  fechaProximoCorte: string;
  /// Restriccion cuya evidencia se abre al entrar (viene del codigo QR).
  abrirEvidencia?: string | null;
  /// Tarea a la que se llega desde el codigo QR: se resalta y se despliega.
  abrirTarea?: number | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [abrirPanel, setAbrirPanel] = useState(false);
  // Que celda tiene la evidencia abierta. Se guarda el ID de la restriccion y
  // no la celda entera: asi, cuando la accion de subir repinta la pantalla, el
  // panel se vuelve a leer de los datos NUEVOS y ensena la foto recien subida.
  //
  // Arranca con lo que diga el codigo QR, si se llego por uno.
  const [evidenciaEn, setEvidenciaEn] = useState<string | null>(abrirEvidencia);
  const router = useRouter();
  const ruta = usePathname();
  const {
    filas,
    confiabilidad: conf,
    pendientesDeSincronizar,
    semanas,
    puedeGestionar,
    semanasAbiertas,
    puedeComprometer,
  } = datos;

  // La ventana viaja en la URL: se comparte por enlace y vuelve atras con el
  // boton del navegador. Al cambiarla se pierde la seleccion a proposito, que
  // ya no tiene por que referirse a tareas que sigan a la vista.
  function cambiarSemanas(valor: string) {
    setElegidas(new Set());
    setAbrirPanel(false);
    router.push(`${ruta}?semanas=${valor}`);
  }

  function alternarEleccion(uid: number) {
    setElegidas((p) => {
      const s = new Set(p);
      if (s.has(uid)) s.delete(uid);
      else s.add(uid);
      return s;
    });
    setAbrirPanel(false);
  }

  // Atajo del Last Planner: lo normal es comprometer todo lo que quedo listo.
  const listasSinComprometer = filas.filter(
    (f) => f.estado === "LISTO" && f.comprometida.length === 0,
  );
  function elegirListas() {
    setElegidas(new Set(listasSinComprometer.map((f) => f.uid)));
    setAbrirPanel(false);
  }

  const seleccionadas = filas
    .filter((f) => elegidas.has(f.uid))
    .map((f) => ({
      uid: f.uid,
      nombre: `${f.codigo ? `${f.codigo} ` : ""}${f.nombre}`,
      lista: f.estado === "LISTO",
    }));

  function alternar(restriccionId: string, resuelta: boolean) {
    iniciar(async () => {
      await accionAlternarRestriccion(obraId, restriccionId, resuelta);
    });
  }

  // La celda cuya evidencia esta abierta, RELEIDA de `filas` en cada render:
  // si se guardara la celda en el estado, la foto recien subida no aparecería
  // hasta cerrar y volver a abrir el panel.
  const evidencia = (() => {
    if (!evidenciaEn) return null;
    for (const fila of filas) {
      for (const celda of fila.restricciones) {
        if (celda.id && celda.id === evidenciaEn) {
          return { fila, celda, id: celda.id };
        }
      }
    }
    // La restriccion ya no esta a la vista (cambio la ventana): el panel se
    // va con ella en vez de quedarse colgado.
    return null;
  })();

  // Se llego por un codigo QR pero eso no esta en la ventana que se muestra
  // (la tarea ya paso, o la ventana es mas corta que cuando se imprimio la
  // hoja). Hay que DECIRLO: quien escaneo con el telefono en la mano vería la
  // pantalla de siempre y pensaria que el codigo esta roto.
  const qrPerdido =
    (abrirEvidencia !== null &&
      evidenciaEn === abrirEvidencia &&
      evidencia === null) ||
    (abrirTarea !== null && !filas.some((f) => f.uid === abrirTarea));

  // Al llegar por un QR, la tarea se busca sola: en una ventana de treinta
  // filas, dejar a alguien buscandola a mano en el movil es no haber resuelto
  // nada. Se elige la copia VISIBLE (escritorio o movil), que es la que tiene
  // caja de layout.
  useEffect(() => {
    if (abrirTarea === null) return;
    const candidatos = document.querySelectorAll<HTMLElement>(
      `[data-tarea="${abrirTarea}"]`,
    );
    for (const el of candidatos) {
      if (el.offsetParent !== null) {
        el.scrollIntoView({ block: "center" });
        return;
      }
    }
  }, [abrirTarea]);

  // Se calcula UNA vez y se pinta donde toque: bajo la tabla en escritorio,
  // dentro de la tarjeta en movil. Solo una de las dos esta visible.
  const panelEvidencia = evidencia ? (
    <PanelEvidencia
      obraId={obraId}
      destino={{ restriccionId: evidencia.id }}
      titulo={`${ETIQUETA_FLUJO.get(evidencia.celda.tipo) ?? evidencia.celda.tipo} · ${
        evidencia.fila.codigo ? `${evidencia.fila.codigo} ` : ""
      }${evidencia.fila.nombre}`}
      fotos={evidencia.celda.fotos}
      puedeSubir={puedeGestionar}
      onCerrar={() => setEvidenciaEn(null)}
    />
  ) : null;

  function sincronizar() {
    iniciar(async () => {
      // Con las MISMAS semanas que se estan viendo: si no, quedarian tareas a
      // la vista sin analizar y sin explicacion.
      await accionSincronizar(obraId, semanas);
    });
  }

  // El selector se pinta tambien cuando la ventana sale vacia: si no, quien
  // eligiera una ventana corta sin tareas se quedaria sin forma de volver.
  const selectorSemanas = (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="opacity-70">Ventana</span>
      <select
        value={semanas}
        onChange={(e) => cambiarSemanas(e.target.value)}
        className="rounded-lg border px-2 py-1 text-sm"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        {/* Si llega por URL un valor fuera de la lista, se anade para que el
            desplegable no mienta sobre lo que se esta viendo. */}
        {(SEMANAS_SUGERIDAS.includes(semanas)
          ? SEMANAS_SUGERIDAS
          : [...SEMANAS_SUGERIDAS, semanas].sort((a, b) => a - b)
        ).map((s) => (
          <option key={s} value={s}>
            {s} semanas
          </option>
        ))}
      </select>
    </label>
  );

  if (filas.length === 0) {
    return (
      <div className="space-y-3">
        {selectorSemanas}
        <p className="text-sm opacity-60">
          No hay tareas del cronograma en las próximas {semanas} semanas. Amplía
          la ventana o espera a que el cronograma programe trabajo en ese rango.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {qrPerdido && (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--color-alerta)" }}
        >
          El código que escaneaste apunta a una tarea que <strong>no está en
          esta ventana</strong> de {semanas} semanas. Amplíala arriba para
          encontrarla: puede que ese trabajo ya haya pasado o que aún quede
          lejos.
        </p>
      )}

      {/* Resumen de confiabilidad + sincronizar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">
            Confiabilidad:{" "}
            <strong className="tabular-nums">
              {conf.listas}/{conf.total}
            </strong>{" "}
            listas <span className="opacity-60">({conf.porcentaje}%)</span>
          </span>
          <div
            className="h-2 w-32 overflow-hidden rounded-full"
            style={{ backgroundColor: "var(--borde)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${conf.porcentaje}%`,
                backgroundColor: "var(--color-exito)",
              }}
            />
          </div>
          {selectorSemanas}
        </div>

        {puedeGestionar && pendientesDeSincronizar > 0 && (
          <button
            type="button"
            onClick={sincronizar}
            disabled={pendiente}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {pendiente ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Sincronizar ventana ({pendientesDeSincronizar})
          </button>
        )}
      </div>

      {/* Llevar al PTS: aparece solo cuando hay algo elegido. */}
      {puedeComprometer && (elegidas.size > 0 || listasSinComprometer.length > 0) && (
        <div className="flex flex-wrap items-center gap-3">
          {elegidas.size > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setAbrirPanel(true)}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--color-marca-600)" }}
              >
                <CalendarPlus className="size-4" aria-hidden="true" />
                Comprometer al PTS ({elegidas.size})
              </button>
              <button
                type="button"
                onClick={() => setElegidas(new Set())}
                className="text-sm opacity-70 underline"
              >
                Quitar selección
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={elegirListas}
              className="text-sm underline"
            >
              Elegir las {listasSinComprometer.length} listas sin comprometer
            </button>
          )}
        </div>
      )}

      {abrirPanel && seleccionadas.length > 0 && (
        <PanelComprometer
          obraId={obraId}
          seleccionadas={seleccionadas}
          semanasAbiertas={semanasAbiertas}
          fechaProximoCorte={fechaProximoCorte}
          // La seleccion se limpia al CERRAR, no al comprometer: si se limpiara
          // antes, el panel se quedaria sin tareas y se desmontaria llevandose
          // el aviso de "listo, N comprometidas" sin que diera tiempo a leerlo.
          onCerrar={() => {
            setAbrirPanel(false);
            setElegidas(new Set());
          }}
        />
      )}

      {/* Escritorio: la matriz entera, con scroll horizontal propio.
          En un movil de obra no cabe —siete columnas en 400px no se pueden
          tocar—, asi que por debajo de `md` se cambia por tarjetas. */}
      <div
        className="hidden overflow-x-auto rounded-lg border md:block"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--superficie)" }}>
              <th
                className="sticky left-0 z-10 px-3 py-2 text-left font-medium"
                style={{ backgroundColor: "var(--superficie)" }}
              >
                Tarea
              </th>
              {FLUJOS_RESTRICCION.map((f) => (
                <th
                  key={f.tipo}
                  className="px-2 py-2 text-center font-medium"
                  title={`${f.etiqueta}: ${f.descripcion}`}
                >
                  {f.etiqueta}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr
                key={fila.uid}
                data-tarea={fila.uid}
                className="border-t"
                style={{
                  borderColor: "var(--borde)",
                  // La tarea a la que apuntaba el QR, senalada: quien llega
                  // del codigo tiene que ver DONDE cayo.
                  backgroundColor:
                    fila.uid === abrirTarea
                      ? "color-mix(in oklab, var(--color-marca-500) 12%, transparent)"
                      : undefined,
                }}
              >
                <td
                  className="sticky left-0 z-10 px-3 py-2"
                  style={{ backgroundColor: "var(--fondo)" }}
                >
                  <div className="flex items-start gap-2">
                    {puedeComprometer && (
                      <input
                        type="checkbox"
                        checked={elegidas.has(fila.uid)}
                        onChange={() => alternarEleccion(fila.uid)}
                        aria-label={`Elegir ${fila.nombre} para el Plan Semanal`}
                        className="mt-0.5 size-4 shrink-0"
                        style={{ accentColor: "var(--color-marca-600)" }}
                      />
                    )}
                    <div className="min-w-0">
                      <div
                        className="max-w-xs truncate font-medium"
                        title={fila.nombre}
                      >
                        {fila.codigo ? `${fila.codigo} ` : ""}
                        {fila.nombre}
                      </div>
                      {!fila.sincronizada && (
                        <div className="text-xs opacity-60">Sin analizar</div>
                      )}
                      {fila.comprometida.length > 0 && (
                        <div className="text-xs opacity-70">
                          En{" "}
                          {fila.comprometida
                            .map((c) => `S-${c.numero}`)
                            .join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {fila.restricciones.map((c) => (
                  <td key={c.tipo} className="px-2 py-2 text-center">
                    <div className="flex flex-col items-center">
                      <input
                        type="checkbox"
                        checked={c.resuelta}
                        disabled={
                          !puedeGestionar ||
                          !fila.sincronizada ||
                          c.id === null ||
                          pendiente
                        }
                        onChange={(e) => {
                          if (c.id) alternar(c.id, e.target.checked);
                        }}
                        aria-label={`${ETIQUETA_FLUJO.get(c.tipo) ?? c.tipo} de ${fila.nombre}`}
                        className="size-4"
                        style={{ accentColor: "var(--color-exito)" }}
                      />
                      {/* El clip solo donde hay a que colgar la foto, y solo
                          a quien puede subirla o tiene algo que mirar. */}
                      {c.id !== null && (c.fotos.length > 0 || puedeGestionar) && (
                        <BotonEvidencia
                          cantidad={c.fotos.length}
                          abierto={evidenciaEn === c.id}
                          etiqueta={`${ETIQUETA_FLUJO.get(c.tipo) ?? c.tipo} de ${fila.nombre}`}
                          onClick={() =>
                            setEvidenciaEn((p) => (p === c.id ? null : c.id))
                          }
                        />
                      )}
                    </div>
                  </td>
                ))}

                <td className="px-3 py-2 text-center">
                  <Chip tono={TONO_ESTADO[fila.estado]} icono={ICONO_ESTADO[fila.estado]}>
                    {ETIQUETA_ESTADO[fila.estado]}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Escritorio: la evidencia se abre bajo la tabla, no flotando sobre la
          celda; con scroll horizontal, un globo anclado a la casilla acabaria
          recortado o fuera de la pantalla. */}
      <div className="hidden md:block">{panelEvidencia}</div>

      {/* Movil: una tarjeta por tarea, con las restricciones desplegables. */}
      <ul className="space-y-2 md:hidden">
        {filas.map((fila) => (
          <TarjetaTarea
            key={fila.uid}
            fila={fila}
            elegida={elegidas.has(fila.uid)}
            puedeElegir={puedeComprometer}
            puedeGestionar={puedeGestionar}
            pendiente={pendiente}
            onElegir={() => alternarEleccion(fila.uid)}
            onAlternar={alternar}
            evidenciaEn={evidenciaEn}
            onEvidencia={(id) => setEvidenciaEn((p) => (p === id ? null : id))}
            panelEvidencia={panelEvidencia}
            resaltada={fila.uid === abrirTarea}
          />
        ))}
      </ul>

      <p className="text-xs opacity-60">
        Marca cada restricción cuando quede resuelta. Cuando las 7 están
        resueltas, la tarea pasa a <strong>Lista</strong> y podrá comprometerse
        en el Plan Semanal.
      </p>
    </div>
  );
}

/**
 * Una tarea de la ventana, para movil.
 *
 * La matriz de escritorio no se puede encoger: siete casillas en 400px quedan
 * por debajo del tamano minimo que un dedo acierta. Aqui cada tarea es una
 * tarjeta y sus restricciones se despliegan como filas de 44px, que es el
 * minimo recomendado para tocar.
 *
 * Arranca plegada y ensena "3/7 resueltas": en obra lo que se mira primero es
 * cuanto falta, no cual falta.
 */
function TarjetaTarea({
  fila,
  elegida,
  puedeElegir,
  puedeGestionar,
  pendiente,
  onElegir,
  onAlternar,
  evidenciaEn,
  onEvidencia,
  panelEvidencia,
  resaltada,
}: {
  fila: LookaheadDatos["filas"][number];
  elegida: boolean;
  puedeElegir: boolean;
  puedeGestionar: boolean;
  pendiente: boolean;
  onElegir: () => void;
  onAlternar: (restriccionId: string, resuelta: boolean) => void;
  /// ID de la restriccion con la evidencia abierta, en toda la matriz.
  evidenciaEn: string | null;
  onEvidencia: (restriccionId: string) => void;
  /// El panel ya construido por la matriz. La tarjeta solo decide DONDE va:
  /// bajo la restriccion que le corresponde, para no perderlo de vista en una
  /// lista larga.
  panelEvidencia: React.ReactNode;
  /// Es la tarea del codigo QR que se acaba de escanear.
  resaltada: boolean;
}) {
  // Si se llego por un QR, la tarjeta ya viene desplegada: el que escaneo
  // quiere adjuntar una foto, no dar otro toque para abrir la lista.
  const [abierta, setAbierta] = useState(resaltada);
  const resueltas = fila.restricciones.filter((r) => r.resuelta).length;
  const total = fila.restricciones.length;
  const Icono = ICONO_ESTADO[fila.estado];

  return (
    <li
      data-tarea={fila.uid}
      className="rounded-lg border"
      style={{
        borderColor: resaltada ? "var(--color-marca-600)" : "var(--borde)",
      }}
    >
      <div className="flex items-start gap-2 p-3">
        {puedeElegir && (
          <input
            type="checkbox"
            checked={elegida}
            onChange={onElegir}
            aria-label={`Elegir ${fila.nombre} para el Plan Semanal`}
            className="mt-1 size-5 shrink-0"
            style={{ accentColor: "var(--color-marca-600)" }}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {fila.codigo ? `${fila.codigo} ` : ""}
            {fila.nombre}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-70">
            {!fila.sincronizada && <span>Sin analizar</span>}
            {fila.comprometida.length > 0 && (
              <span>
                En {fila.comprometida.map((c) => `S-${c.numero}`).join(", ")}
              </span>
            )}
          </div>
        </div>

        <Chip tono={TONO_ESTADO[fila.estado]} icono={Icono}>
          {ETIQUETA_ESTADO[fila.estado]}
        </Chip>
      </div>

      <button
        type="button"
        onClick={() => setAbierta((p) => !p)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between border-t px-3 py-2.5 text-sm"
        style={{ borderColor: "var(--borde)" }}
      >
        <span className="tabular-nums">
          Restricciones{" "}
          <strong>
            {resueltas}/{total}
          </strong>{" "}
          resueltas
        </span>
        <span className="opacity-60">{abierta ? "▾" : "▸"}</span>
      </button>

      {abierta && (
        <ul className="px-3 pb-2">
          {fila.restricciones.map((c) => {
            const etiqueta = ETIQUETA_FLUJO.get(c.tipo) ?? c.tipo;
            const bloqueada =
              !puedeGestionar || !fila.sincronizada || c.id === null || pendiente;
            return (
              <li key={c.tipo} className="border-t" style={{ borderColor: "var(--borde)" }}>
                <div className="flex items-center gap-2">
                  {/* El label entero es el area tocable, no solo la casilla:
                      apuntar a 16px con el dedo, con guantes, no funciona.
                      El clip queda FUERA del label a proposito: dentro, tocarlo
                      marcaria tambien la restriccion. */}
                  <label className="flex min-h-11 flex-1 items-center gap-3 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={c.resuelta}
                      disabled={bloqueada}
                      onChange={(e) => {
                        if (c.id) onAlternar(c.id, e.target.checked);
                      }}
                      aria-label={`${etiqueta} de ${fila.nombre}`}
                      className="size-5 shrink-0"
                      style={{ accentColor: "var(--color-exito)" }}
                    />
                    <span className={c.resuelta ? "" : "opacity-80"}>{etiqueta}</span>
                  </label>
                  {c.id !== null && (c.fotos.length > 0 || puedeGestionar) && (
                    <BotonEvidencia
                      cantidad={c.fotos.length}
                      abierto={evidenciaEn === c.id}
                      etiqueta={`${etiqueta} de ${fila.nombre}`}
                      onClick={() => onEvidencia(c.id as string)}
                    />
                  )}
                </div>
                {evidenciaEn !== null && evidenciaEn === c.id && (
                  <div className="pb-2">{panelEvidencia}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
