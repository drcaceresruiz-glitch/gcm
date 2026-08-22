"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  CircleCheck,
  CircleDashed,
  HelpCircle,
  Check,
  Minus,
  RefreshCw,
  LoaderCircle,
  CalendarPlus,
  ClipboardList,
  Unlock,
  TriangleAlert,
  UserRoundCheck,
} from "lucide-react";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import {
  FLUJOS_RESTRICCION,
  SEMANAS_SUGERIDAS,
  type FaseAnalisis,
} from "@/lib/lookahead";
import { fechaCorta } from "@/utils/fechas";
import { PanelComprometer } from "@/components/lookahead/PanelComprometer";
import { PanelAnalizar } from "@/components/lookahead/PanelAnalizar";
import { PanelAsignar } from "@/components/lookahead/PanelAsignar";
import {
  BotonEvidencia,
  PanelEvidencia,
} from "@/components/evidencia/PanelEvidencia";
import {
  accionSincronizar,
  accionAlternarRestriccion,
  accionLevantarTodas,
} from "@/app/(dashboard)/obras/[id]/lookahead/acciones";
import { accionSubirEvidencia } from "@/app/(dashboard)/obras/[id]/evidencia/acciones";
import type { LookaheadDatos } from "@/services/lookahead.service";

/**
 * La matriz del Lookahead: tareas de la ventana (filas) x los 7 flujos de
 * restriccion (columnas) + el semaforo de confiabilidad.
 *
 * Cada celda tiene TRES estados, no dos: el flujo no aplica a esta tarea, o
 * aplica y esta pendiente, o aplica y ya se levanto. Por eso son botones y no
 * casillas: un checkbox no sabe decir "no aplica" —`indeterminate` se lee como
 * "a medias"— y ese tercer estado es justo lo que antes no se podia expresar.
 */

const TONO_FASE: Record<FaseAnalisis, TonoChip> = {
  LISTA: "exito",
  CON_PENDIENTES: "alerta",
  SIN_ANALIZAR: "neutro",
};

const ETIQUETA_FASE: Record<FaseAnalisis, string> = {
  LISTA: "Lista",
  CON_PENDIENTES: "Pendiente",
  SIN_ANALIZAR: "Sin analizar",
};

const ICONO_FASE = {
  LISTA: CircleCheck,
  CON_PENDIENTES: CircleDashed,
  SIN_ANALIZAR: HelpCircle,
} as const;

const ETIQUETA_FLUJO = new Map(
  FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
);

export function MatrizLookahead({
  obraId,
  datos,
  fechaProximoCorte,
  fechaCorteSiguiente,
  abrirEvidencia = null,
  abrirTarea = null,
}: {
  obraId: string;
  datos: LookaheadDatos;
  /// Fecha ISO del corte de ESTA semana, el que se crearia por defecto.
  fechaProximoCorte: string;
  /// Y el de la semana de despues. Son las dos unicas que se pueden crear
  /// desde aqui.
  fechaCorteSiguiente: string;
  /// Restriccion cuya evidencia se abre al entrar (viene del codigo QR).
  abrirEvidencia?: string | null;
  /// Tarea a la que se llega desde el codigo QR: se resalta y se despliega.
  abrirTarea?: number | null;
}) {
  const [pendiente, iniciar] = useTransition();
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  /// Que panel de lote esta abierto. Uno solo a la vez: los dos empujan la
  /// pagina y abiertos juntos dejarian la matriz fuera de pantalla.
  const [panel, setPanel] = useState<
    "comprometer" | "analizar" | "asignar" | null
  >(null);
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
    sinAnalizar,
    semanas,
    puedeGestionar,
    semanasDestino,
    puedeComprometer,
    personas,
    liberacion,
    carga,
  } = datos;

  // El nombre de cada responsable, resuelto una vez para toda la matriz. El
  // servidor manda la clave y no el nombre por celda: serian siete consultas
  // por tarea para un dato que aqui sale gratis.
  const nombrePorClave = new Map(personas.map((p) => [p.clave, p.nombre]));

  // La casilla de fila sirve a DOS acciones con permisos distintos: analizar
  // (lookahead:gestionar) y comprometer (plan_semanal:gestionar). Colgarla
  // solo del segundo, como estaba, dejaba sin seleccion a quien gestiona el
  // Lookahead pero no el PTS. Cada boton sigue mirando su propio permiso.
  const puedeSeleccionar = puedeGestionar || puedeComprometer;

  // La ventana viaja en la URL: se comparte por enlace y vuelve atras con el
  // boton del navegador. Al cambiarla se pierde la seleccion a proposito, que
  // ya no tiene por que referirse a tareas que sigan a la vista.
  function cambiarSemanas(valor: string) {
    setElegidas(new Set());
    setPanel(null);
    router.push(`${ruta}?semanas=${valor}`);
  }

  function alternarEleccion(uid: number) {
    setElegidas((p) => {
      const s = new Set(p);
      if (s.has(uid)) s.delete(uid);
      else s.add(uid);
      return s;
    });
    setPanel(null);
  }

  function elegir(uids: number[]) {
    setElegidas(new Set(uids));
    setPanel(null);
  }

  // Atajo del Last Planner: lo normal es comprometer todo lo que quedo listo.
  const listasSinComprometer = filas.filter(
    (f) => f.fase === "LISTA" && f.comprometida.length === 0,
  );
  const sinAnalizarFilas = filas.filter((f) => f.fase === "SIN_ANALIZAR");
  const todasElegidas = elegidas.size === filas.length && filas.length > 0;

  const seleccionadas = filas
    .filter((f) => elegidas.has(f.uid))
    .map((f) => ({
      uid: f.uid,
      nombre: `${f.codigo ? `${f.codigo} ` : ""}${f.nombre}`,
      lista: f.fase === "LISTA",
    }));

  /// De las elegidas, cuantas tienen algo por levantar.
  const conPendientes = filas.filter(
    (f) =>
      elegidas.has(f.uid) &&
      f.restricciones.some((c) => c.id !== null && !c.resuelta),
  ).length;

  /// Los ids de esas restricciones abiertas. Es lo que se asigna: la promesa es
  /// de la RESTRICCION, no de la tarea —a una le puede faltar el plano y el
  /// fierro, y no los consigue la misma persona ni el mismo dia—.
  const idsPendientes = filas
    .filter((f) => elegidas.has(f.uid))
    .flatMap((f) =>
      f.restricciones
        .filter((c) => c.id !== null && !c.resuelta)
        .map((c) => c.id as string),
    );

  function alternar(restriccionId: string, resuelta: boolean) {
    iniciar(async () => {
      await accionAlternarRestriccion(obraId, restriccionId, resuelta);
    });
  }

  function levantarTodas() {
    iniciar(async () => {
      await accionLevantarTodas(obraId, [...elegidas]);
      setElegidas(new Set());
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
      accion={accionSubirEvidencia}
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
            {s === 1 ? "1 semana" : `${s} semanas`}
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
          No hay tareas del cronograma en {semanas === 1 ? "la próxima semana" : `las próximas ${semanas} semanas`}. Amplía
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
          esta ventana</strong> de {semanas === 1 ? "una semana" : `${semanas} semanas`}. Amplíala arriba para
          encontrarla: puede que ese trabajo ya haya pasado o que aún quede
          lejos.
        </p>
      )}

      {/* Resumen de confiabilidad + sincronizar. `id`+`scroll-mt-20` para
          poder enlazar aqui desde el modulo "Lookahead" del tablero. */}
      <div
        id="confiabilidad"
        className="scroll-mt-20 flex flex-wrap items-center justify-between gap-3"
      >
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

        {/* El OTRO indicador, y el que nadie tenia: la confiabilidad dice
            cuantas tareas estan listas; esto dice si quien se comprometio a
            dejarlas listas cumplio. Una obra puede tener confiabilidad baja
            porque nadie analiza, o porque se analiza y luego nadie levanta lo
            que prometio levantar, y son dos problemas distintos. */}
        <LiberacionATiempo datos={liberacion} />

        {puedeGestionar && pendientesDeSincronizar > 0 && (
          <button
            type="button"
            onClick={sincronizar}
            disabled={pendiente}
            title="Crea la ficha de estas tareas en el Lookahead. No hace falta antes de analizar: analizar tambien las trae."
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--borde)" }}
          >
            {pendiente ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Traer al Lookahead ({pendientesDeSincronizar})
          </button>
        )}
      </div>

      <RepartoDeRestricciones carga={carga} />

      {/* Acciones en lote: aparecen solo cuando hay algo elegido. Cada boton
          mira su propio permiso, aunque la seleccion sea comun. */}
      {puedeSeleccionar && (
        <div className="flex flex-wrap items-center gap-3">
          {elegidas.size > 0 ? (
            <>
              {puedeGestionar && (
                <button
                  type="button"
                  onClick={() => setPanel("analizar")}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                  style={{ backgroundColor: "var(--color-marca-600)" }}
                >
                  <ClipboardList className="size-4" aria-hidden="true" />
                  Analizar ({elegidas.size})
                </button>
              )}

              {puedeGestionar && conPendientes > 0 && (
                <button
                  type="button"
                  onClick={levantarTodas}
                  disabled={pendiente}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60"
                  style={{ borderColor: "var(--borde)" }}
                >
                  {pendiente ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Unlock className="size-4" aria-hidden="true" />
                  )}
                  Levantar restricciones ({conPendientes})
                </button>
              )}

              {puedeGestionar && conPendientes > 0 && (
                <button
                  type="button"
                  onClick={() => setPanel("asignar")}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <UserRoundCheck className="size-4" aria-hidden="true" />
                  Asignar responsable y fecha ({conPendientes})
                </button>
              )}

              {puedeComprometer && (
                <button
                  type="button"
                  onClick={() => setPanel("comprometer")}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <CalendarPlus className="size-4" aria-hidden="true" />
                  Comprometer al PTS ({elegidas.size})
                </button>
              )}

              <button
                type="button"
                onClick={() => elegir([])}
                className="text-sm opacity-70 underline"
              >
                Quitar selección
              </button>
            </>
          ) : (
            <>
              {puedeGestionar && sinAnalizarFilas.length > 0 && (
                <button
                  type="button"
                  onClick={() => elegir(sinAnalizarFilas.map((f) => f.uid))}
                  className="text-sm underline"
                >
                  Elegir las {sinAnalizarFilas.length} sin analizar
                </button>
              )}
              {puedeComprometer && listasSinComprometer.length > 0 && (
                <button
                  type="button"
                  onClick={() => elegir(listasSinComprometer.map((f) => f.uid))}
                  className="text-sm underline"
                >
                  Elegir las {listasSinComprometer.length} listas sin comprometer
                </button>
              )}
            </>
          )}
        </div>
      )}

      {panel === "analizar" && elegidas.size > 0 && (
        <PanelAnalizar
          obraId={obraId}
          uids={[...elegidas]}
          // Igual que al comprometer: la seleccion se limpia al CERRAR y no al
          // guardar, para que el resultado se pueda leer antes de que el panel
          // se quede sin tareas y se desmonte.
          onCerrar={() => {
            setPanel(null);
            setElegidas(new Set());
          }}
        />
      )}

      {panel === "asignar" && idsPendientes.length > 0 && (
        <PanelAsignar
          obraId={obraId}
          restriccionIds={idsPendientes}
          personas={personas}
          fechaSugerida={fechaProximoCorte}
          cuantasTareas={seleccionadas.length}
          // Igual que los otros dos: la seleccion se limpia al CERRAR, para que
          // el "listo, N asignadas" se pueda leer antes de que el panel se
          // quede sin restricciones y se desmonte.
          onCerrar={() => {
            setPanel(null);
            setElegidas(new Set());
          }}
        />
      )}

      {panel === "comprometer" && seleccionadas.length > 0 && (
        <PanelComprometer
          obraId={obraId}
          seleccionadas={seleccionadas}
          semanasDestino={semanasDestino}
          fechaProximoCorte={fechaProximoCorte}
          fechaCorteSiguiente={fechaCorteSiguiente}
          // La seleccion se limpia al CERRAR, no al comprometer: si se limpiara
          // antes, el panel se quedaria sin tareas y se desmontaria llevandose
          // el aviso de "listo, N comprometidas" sin que diera tiempo a leerlo.
          onCerrar={() => {
            setPanel(null);
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
                <span className="flex items-center gap-2">
                  {puedeSeleccionar && (
                    <input
                      type="checkbox"
                      checked={todasElegidas}
                      // Con parte elegida se ensena en "a medias" en vez de
                      // marcada: si no, pulsarla desmarcaria todo y quien solo
                      // habia elegido tres perderia su seleccion sin verlo.
                      ref={(el) => {
                        if (el) {
                          el.indeterminate =
                            elegidas.size > 0 && !todasElegidas;
                        }
                      }}
                      onChange={() =>
                        elegir(todasElegidas ? [] : filas.map((f) => f.uid))
                      }
                      aria-label="Elegir todas las tareas de la ventana"
                      className="size-4 shrink-0"
                      style={{ accentColor: "var(--color-marca-600)" }}
                    />
                  )}
                  Tarea
                </span>
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
                    {puedeSeleccionar && (
                      <input
                        type="checkbox"
                        checked={elegidas.has(fila.uid)}
                        onChange={() => alternarEleccion(fila.uid)}
                        aria-label={`Elegir ${fila.nombre}`}
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
                      <MarcaAnalisis fila={fila} />
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
                      <Celda
                        celda={c}
                        etiqueta={`${ETIQUETA_FLUJO.get(c.tipo) ?? c.tipo} de ${fila.nombre}`}
                        puedeGestionar={puedeGestionar}
                        pendiente={pendiente}
                        nombrePorClave={nombrePorClave}
                        onAlternar={alternar}
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
                  <Chip tono={TONO_FASE[fila.fase]} icono={ICONO_FASE[fila.fase]}>
                    {ETIQUETA_FASE[fila.fase]}
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
            puedeElegir={puedeSeleccionar}
            puedeGestionar={puedeGestionar}
            nombrePorClave={nombrePorClave}
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

      <p className="max-w-prose text-xs opacity-60">
        Las siete son el <strong>checklist de preguntas</strong>, no siete
        restricciones que toda tarea arrastra: elige cuáles frenan de verdad
        este trabajo y marca cada una al levantarla. Una tarea analizada a la
        que <strong>no le aplica ninguna</strong>, o con todas levantadas, queda{" "}
        <strong>Lista</strong> y podrá comprometerse en el Plan Semanal. Una que
        nadie ha analizado no está lista: no se sabe.
        {sinAnalizar > 0 && (
          <>
            {" "}
            Ahora mismo hay <strong>{sinAnalizar}</strong> sin analizar, y la
            confiabilidad las cuenta como no listas.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * La marca de analisis bajo el nombre de la tarea.
 *
 * Tres estados y no dos, que es todo el cambio en una linea: "nadie la ha
 * mirado" en color de aviso, "revisada y no le aplica ninguna" en neutro, y
 * nada cuando ya tiene restricciones —de eso habla el semaforo de la derecha
 * y repetirlo aqui seria ruido—.
 */
function MarcaAnalisis({ fila }: { fila: LookaheadDatos["filas"][number] }) {
  if (fila.fase === "SIN_ANALIZAR") {
    return (
      <div className="text-xs" style={{ color: "var(--color-alerta)" }}>
        Sin analizar
      </div>
    );
  }

  const quien = fila.analizadaPor ?? "alguien";
  const cuando = fila.analizadaAt ? fechaCorta(fila.analizadaAt) : "";
  const titulo = `Analizada por ${quien}${cuando ? ` el ${cuando}` : ""}`;

  if (fila.restricciones.every((c) => c.id === null)) {
    return (
      <div className="text-xs opacity-60" title={titulo}>
        Sin restricciones
      </div>
    );
  }
  return <span className="sr-only">{titulo}</span>;
}

/**
 * El cumplimiento de las promesas de liberacion: el PPC de la preparacion.
 *
 * Con NADIE que haya prometido nada no dice 0%, dice que no hay nada que medir.
 * "Nadie prometio" no es "todos fallaron", y confundirlos es exactamente lo que
 * hacia la confiabilidad antes de `analizadaAt`: una obra sin analizar salia al
 * 0% como si lo hubiera hecho mal.
 */
function LiberacionATiempo({
  datos,
}: {
  datos: LookaheadDatos["liberacion"];
}) {
  // Lo vencido manda sobre el porcentaje: es lo unico que pide algo HOY.
  if (datos.vencidasAbiertas > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--color-peligro)" }}
      >
        <TriangleAlert className="size-4" aria-hidden="true" />
        {datos.vencidasAbiertas} restricci
        {datos.vencidasAbiertas === 1 ? "ón vencida" : "ones vencidas"}
      </span>
    );
  }

  if (datos.porcentaje === null) {
    return (
      <span className="text-sm opacity-60">
        {datos.sinAsignar > 0
          ? `${datos.sinAsignar} sin responsable`
          : "Sin promesas de liberación todavía"}
      </span>
    );
  }

  return (
    <span className="text-sm">
      Liberadas a tiempo:{" "}
      <strong className="tabular-nums">{Math.round(datos.porcentaje)}%</strong>
      {datos.sinAsignar > 0 && (
        <span className="opacity-60"> · {datos.sinAsignar} sin responsable</span>
      )}
    </span>
  );
}

/**
 * Como esta repartido el analisis de restricciones entre las personas de la
 * obra.
 *
 * Repartirlo ya se podia: ADMIN_OBRA tiene `lookahead:gestionar` desde
 * siempre, asi que asignar restricciones nunca estuvo cerrado. Lo que faltaba
 * era VERLO. El total de abiertas sale igual lo lleve una persona o lo lleven
 * tres, de modo que un reparto que nadie mira se deshace solo y todo vuelve a
 * nombre del residente sin que se note.
 *
 * Solo salen los de dentro de la obra: a un proveedor se le promete una fecha,
 * no se le reparte trabajo de analisis.
 */
function RepartoDeRestricciones({
  carga,
}: {
  carga: LookaheadDatos["carga"];
}) {
  // Sin permiso de gestion el servidor manda la lista vacia, asi que esto
  // tambien cubre el caso de quien solo mira.
  if (carga.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      <span className="opacity-70">Restricciones abiertas por responsable:</span>
      {carga.map((p) => (
        <span key={p.userId} className="inline-flex items-center gap-1.5">
          <span>{p.nombre}</span>
          <strong className="tabular-nums">{p.abiertas}</strong>
          {p.vencidas > 0 && (
            <span
              className="tabular-nums"
              style={{ color: "var(--color-peligro)" }}
            >
              ({p.vencidas} vencida{p.vencidas === 1 ? "" : "s"})
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Quien responde de una restriccion y para cuando, en una linea.
 *
 * En un solo sitio para que la matriz de escritorio y las tarjetas del movil
 * digan LO MISMO. Si divergieran, el residente veria una cosa en la oficina y
 * otra en la caseta y no sabria cual creer.
 */
function textoPromesa(
  celda: LookaheadDatos["filas"][number]["restricciones"][number],
  nombrePorClave: Map<string, string>,
): string {
  const quien = celda.responsableClave
    ? (nombrePorClave.get(celda.responsableClave) ?? "alguien de fuera")
    : null;
  const cuando = celda.fechaCompromiso ? fechaCorta(celda.fechaCompromiso) : "";

  switch (celda.promesa) {
    case "sin-asignar":
      return "nadie se ha hecho cargo";
    case "sin-fecha":
      return `${quien}, sin fecha`;
    case "vencida":
      return `${quien} lo prometió para el ${cuando} y ya pasó`;
    case "vence-hoy":
      return `${quien}, vence HOY`;
    case "a-tiempo":
      return `${quien} para el ${cuando}`;
    default:
      return "";
  }
}

/**
 * Una casilla de la matriz, con sus TRES estados.
 *
 * Un `input type="checkbox"` no da para esto: solo sabe decir si o no, y
 * `indeterminate` se lee como "a medias", no como "no aplica". Con un boton
 * cada estado tiene su icono y su texto en el `aria-label`, que ademas dice
 * que va a pasar al pulsar.
 *
 * El ciclo ofrece SOLO lo que el servidor va a aceptar: quitar un flujo se
 * ofrece unicamente si esta en blanco. Uno resuelto o con fotos vuelve a
 * pendiente y ahi se queda, porque el servicio no lo borraria de todos modos
 * —y ofrecer un boton que no hace lo que dice es peor que no tenerlo—.
 */
function Celda({
  celda,
  etiqueta,
  puedeGestionar,
  pendiente,
  nombrePorClave,
  onAlternar,
}: {
  celda: LookaheadDatos["filas"][number]["restricciones"][number];
  etiqueta: string;
  puedeGestionar: boolean;
  pendiente: boolean;
  /// Para poder decir el nombre del responsable sin traerlo por cada celda.
  nombrePorClave: Map<string, string>;
  onAlternar: (restriccionId: string, resuelta: boolean) => void;
}) {
  // No aplica: se pinta el hueco y no se toca. Anadir el flujo se hace desde
  // "Analizar", que es donde se decide con la tarea entera delante.
  if (celda.id === null) {
    return (
      <span
        className="grid size-6 place-items-center"
        title={`${etiqueta}: no aplica`}
      >
        <Minus className="size-3.5 opacity-30" aria-hidden="true" />
        <span className="sr-only">{etiqueta}: no aplica</span>
      </span>
    );
  }

  const id = celda.id;

  // La promesa en palabras, tambien aqui: la regla de la casa es color + icono
  // + TEXTO, nunca color solo, y en 24 px el color es lo unico que cabe. El
  // texto va al `title` y al `aria-label`.
  const promesa = celda.resuelta ? "" : ` · ${textoPromesa(celda, nombrePorClave)}`;

  const borde = celda.resuelta
    ? "var(--color-exito)"
    : celda.promesa === "vencida"
      ? "var(--color-peligro)"
      : celda.promesa === "vence-hoy"
        ? "var(--color-alerta)"
        : "var(--borde)";

  return (
    <button
      type="button"
      disabled={!puedeGestionar || pendiente}
      onClick={() => onAlternar(id, !celda.resuelta)}
      title={`${etiqueta}${promesa}${celda.detalle ? ` — ${celda.detalle}` : ""}`}
      aria-label={
        celda.resuelta
          ? `${etiqueta}: levantada. Pulsa para volver a bajarla.`
          : `${etiqueta}: pendiente${promesa}. Pulsa para levantarla.`
      }
      className="grid size-6 place-items-center rounded border disabled:opacity-50"
      style={{ borderColor: borde }}
    >
      {celda.resuelta ? (
        <Check
          className="size-4"
          style={{ color: "var(--color-exito)" }}
          aria-hidden="true"
        />
      ) : celda.promesa === "vencida" || celda.promesa === "vence-hoy" ? (
        // Un icono ademas del color: quien no distingue el rojo del ambar tiene
        // que poder ver que esta celda pide algo.
        <TriangleAlert
          className="size-3.5"
          style={{
            color:
              celda.promesa === "vencida"
                ? "var(--color-peligro)"
                : "var(--color-alerta)",
          }}
          aria-hidden="true"
        />
      ) : (
        <span className="sr-only">pendiente</span>
      )}
    </button>
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
 * Arranca plegada y ensena "3 de 5 levantadas": en obra lo que se mira primero
 * es cuanto falta, no cual falta. El denominador son las que APLICAN, no siete
 * fijas.
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
  nombrePorClave,
}: {
  fila: LookaheadDatos["filas"][number];
  elegida: boolean;
  puedeElegir: boolean;
  puedeGestionar: boolean;
  pendiente: boolean;
  nombrePorClave: Map<string, string>;
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
  // Solo los flujos que aplican: los huecos no son restricciones sin resolver.
  const aplican = fila.restricciones.filter((c) => c.id !== null);
  const resueltas = aplican.filter((r) => r.resuelta).length;
  const Icono = ICONO_FASE[fila.fase];

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
            aria-label={`Elegir ${fila.nombre}`}
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
            {fila.comprometida.length > 0 && (
              <span>
                En {fila.comprometida.map((c) => `S-${c.numero}`).join(", ")}
              </span>
            )}
          </div>
        </div>

        <Chip tono={TONO_FASE[fila.fase]} icono={Icono}>
          {ETIQUETA_FASE[fila.fase]}
        </Chip>
      </div>

      {/* Sin flujos que aplicar no hay lista que desplegar: se dice y ya. Un
          desplegable que se abre vacio se lee como que algo fallo. */}
      {aplican.length === 0 ? (
        <p
          className="border-t px-3 py-2.5 text-sm opacity-70"
          style={{ borderColor: "var(--borde)" }}
        >
          {fila.fase === "SIN_ANALIZAR"
            ? "Nadie ha dicho todavía qué restricciones le aplican."
            : "Revisada: no le aplica ninguna restricción."}
        </p>
      ) : (
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
              {resueltas}/{aplican.length}
            </strong>{" "}
            levantadas
          </span>
          <span className="opacity-60">{abierta ? "▾" : "▸"}</span>
        </button>
      )}

      {abierta && aplican.length > 0 && (
        <ul className="px-3 pb-2">
          {aplican.map((c) => {
            const etiqueta = ETIQUETA_FLUJO.get(c.tipo) ?? c.tipo;
            const bloqueada = !puedeGestionar || pendiente;
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
                    <span className={c.resuelta ? "" : "opacity-80"}>
                      {etiqueta}
                      {/* Quien responde y para cuando, DEBAJO de la etiqueta.
                          En el movil hay sitio para decirlo con palabras, que
                          es mejor que el color de la matriz de escritorio. */}
                      {!c.resuelta && c.promesa !== "liberada" && (
                        <span
                          className="block text-xs"
                          style={{
                            color:
                              c.promesa === "vencida"
                                ? "var(--color-peligro)"
                                : "inherit",
                            opacity: c.promesa === "vencida" ? 1 : 0.6,
                          }}
                        >
                          {textoPromesa(c, nombrePorClave)}
                        </span>
                      )}
                    </span>
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
