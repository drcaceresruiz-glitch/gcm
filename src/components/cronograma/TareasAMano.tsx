"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { diasLaborablesEntre, type DiaLaboral } from "@/lib/calendario";
import { AlertCircle, CalendarPlus, Flag, LoaderCircle, Pencil, Search, Trash2 } from "lucide-react";

import {
  accionCrearTareaManual,
  accionEditarTareaManual,
  accionEliminarTareaManual,
} from "@/app/(dashboard)/obras/[id]/cronograma/acciones-manual";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

export interface TareaManual {
  uid: number;
  codigo: string | null;
  nombre: string;
  inicio: string;
  fin: string;
  duracionDias: string;
  porcentajePlaneado: string;
  esHito: boolean;
  nivel: number;
  esResumen: boolean;
  /// Solo tiene sentido cuando `!holguraInferida`: viene de la red de
  /// dependencias, no de un archivo (esta tarea no tiene archivo).
  esCritico: boolean;
  holguraDias: string;
  holguraInferida: boolean;
  /// De que tareas depende para poder empezar (fin-comienzo).
  dependeDeUids: number[];
}

/**
 * Teclear el cronograma, la tercera via.
 *
 * Una obra pequena no tiene planificador ni licencia de MS Project, y sin
 * cronograma no hay curva S, ni valor ganado, ni informe semanal. Esto permite
 * escribir las tareas a mano y corregirlas despues.
 *
 * Solo se listan y se tocan las tareas ESCRITAS AQUI. Las que vinieron de un
 * archivo no se editan: el siguiente corte las devolveria como estaban, asi
 * que cambiarlas seria una perdida silenciosa. El servicio lo impide tambien.
 */
const VACIA = {
  codigo: "",
  nombre: "",
  inicio: "",
  fin: "",
  duracionDias: "",
  porcentajePlaneado: "",
  esHito: false,
  padreUid: "",
  dependeDeUids: [] as number[],
};

function Campo({
  etiqueta,
  ayuda,
  ancho,
  ...props
}: {
  etiqueta: string;
  ayuda?: string;
  ancho?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`text-xs ${ancho ?? ""}`}>
      <span className="mb-0.5 block font-medium opacity-70">{etiqueta}</span>
      <input
        {...props}
        className={`w-full rounded border px-2 py-1.5 text-sm ${props.className ?? ""}`}
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />
      {ayuda && <span className="mt-0.5 block opacity-60">{ayuda}</span>}
    </label>
  );
}

export function TareasAMano({
  obraId,
  tareas,
  puedeEditar,
  puedeEliminar,
  calendario = [],
}: {
  obraId: string;
  /// Solo las de origen MANUAL. Las importadas no se pintan aqui.
  tareas: TareaManual[];
  puedeEditar: boolean;
  puedeEliminar: boolean;
  /// Regimen laboral de la obra. Vacio = se cuentan los siete dias.
  calendario?: DiaLaboral[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [campos, setCampos] = useState({ ...VACIA });
  const [editando, setEditando] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<{ uid: number; texto: string } | null>(null);
  const [guardando, guardar] = useTransition();
  // Solo para encontrar la predecesora en una lista larga —una EDT generada
  // desde presupuesto puede traer cientos de tareas—: no filtra lo que se
  // guarda, solo lo que se ve mientras se busca.
  const [buscarDependencia, setBuscarDependencia] = useState("");

  /**
   * La duracion no se teclea: la dicen las dos fechas.
   *
   * Se cuenta en dias de TRABAJO segun el calendario de la obra —del viernes
   * al lunes hay dos, no cuatro, si no se trabaja el domingo—. Esto es solo lo
   * que se ve mientras se escribe; la cifra que se guarda la vuelve a calcular
   * el servidor, para que no dependa del reloj del navegador.
   *
   * Las fechas se parten a mano y se anclan en UTC (`Date.UTC`) en vez de
   * pasarlas por `new Date(iso)` a secas o por el constructor local
   * `new Date(anio, mes, dia)`: `calendario.ts` entero trabaja en UTC desde
   * el 21 de agosto de 2026 (ver su comentario de cabecera), y anclar aqui
   * en la hora local del NAVEGADOR de quien teclea desalinearia el
   * calendario segun donde este esa persona, exactamente el problema que
   * el propio arreglo de `calendario.ts` elimino para el servidor.
   */
  const duracionCalculada = useMemo(() => {
    if (!campos.inicio || !campos.fin) return "";

    const dia = (iso: string) => {
      const [anio, mes, d] = iso.split("-").map(Number);
      if (!anio || !mes || !d) return null;
      return new Date(Date.UTC(anio, mes - 1, d));
    };

    const desde = dia(campos.inicio);
    const hasta = dia(campos.fin);
    if (!desde || !hasta || hasta.getTime() < desde.getTime()) return "";

    return String(diasLaborablesEntre(desde, hasta, calendario));
  }, [campos.inicio, campos.fin, calendario]);

  /*
   * En una obra que no admite cambios no se ofrece: `crearTareaManual` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  const candidatosDependencia = tareas.filter(
    (t) => !t.esResumen && t.uid !== editando,
  );
  const busquedaDependencia = buscarDependencia.trim().toLowerCase();
  const candidatosDependenciaVisibles = busquedaDependencia
    ? candidatosDependencia.filter(
        (t) =>
          t.nombre.toLowerCase().includes(busquedaDependencia) ||
          (t.codigo ?? "").toLowerCase().includes(busquedaDependencia),
      )
    : candidatosDependencia;

  if (!puedeEditar && tareas.length === 0) return null;

  function limpiar() {
    setCampos({ ...VACIA });
    setEditando(null);
    setError(null);
    setBuscarDependencia("");
  }

  function enviar() {
    setError(null);
    setPorConfirmar(null);

    guardar(async () => {
      const datos = {
        codigo: campos.codigo || null,
        nombre: campos.nombre,
        inicio: campos.inicio,
        fin: campos.fin,
        duracionDias: campos.duracionDias,
        porcentajePlaneado: campos.porcentajePlaneado || null,
        esHito: campos.esHito,
        // Solo al CREAR: mover una tarea de sitio arrastra a las suyas y eso
        // es otra operacion, no un campo mas de este formulario.
        padreUid: campos.padreUid === "" ? null : Number(campos.padreUid),
        dependeDeUids: campos.dependeDeUids,
      };

      const r =
        editando === null
          ? await accionCrearTareaManual(obraId, datos)
          : await accionEditarTareaManual(obraId, editando, datos);

      if (!r.ok) {
        setError(r.error ?? "No se pudo guardar.");
        return;
      }

      limpiar();
      router.refresh();
    });
  }

  function editar(t: TareaManual) {
    setEditando(t.uid);
    setAbierto(true);
    setError(null);
    setBuscarDependencia("");
    setCampos({
      codigo: t.codigo ?? "",
      nombre: t.nombre,
      inicio: t.inicio,
      fin: t.fin,
      duracionDias: t.duracionDias,
      porcentajePlaneado: t.porcentajePlaneado,
      esHito: t.esHito,
      padreUid: "",
      dependeDeUids: t.dependeDeUids,
    });
  }

  function borrar(uid: number, confirmado = false) {
    setError(null);

    guardar(async () => {
      const r = await accionEliminarTareaManual(obraId, uid, confirmado);

      if (!r.ok) {
        // Si paro para preguntar, se ofrece el segundo paso en vez de un error.
        if (r.pideConfirmacion) setPorConfirmar({ uid, texto: r.error ?? "" });
        else setError(r.error ?? "No se pudo eliminar.");
        return;
      }

      setPorConfirmar(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {tareas.length > 0 && (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{ borderColor: "var(--borde)" }}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">
              Tareas del cronograma escritas en GCM
            </caption>
            <thead>
              <tr className="text-left text-xs opacity-60">
                <th className="px-3 py-2 font-medium">CÓDIGO</th>
                <th className="px-3 py-2 font-medium">TAREA</th>
                <th className="px-3 py-2 font-medium">INICIO</th>
                <th className="px-3 py-2 font-medium">FIN</th>
                <th className="px-3 py-2 text-right font-medium">DÍAS</th>
                {(puedeEditar || puedeEliminar) && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {tareas.map((t) => (
                <tr key={t.uid} className="border-t" style={{ borderColor: "var(--borde)" }}>
                  <td className="px-3 py-2 tabular-nums opacity-70">{t.codigo ?? "—"}</td>
                  {/* La sangria ES la jerarquia: en un cronograma el nivel mas
                      el orden es lo unico que dice quien cuelga de quien. */}
                  <td
                    className="px-3 py-2"
                    style={{ paddingLeft: `${0.75 + (t.nivel - 1) * 1.25}rem` }}
                  >
                    {t.esCritico && !t.esHito && (
                      <Flag
                        className="mr-1 inline size-3 shrink-0"
                        style={{ color: "var(--color-peligro)" }}
                        aria-label="En la ruta crítica"
                      />
                    )}
                    <span className={t.esResumen ? "font-medium" : undefined}>
                      {t.nombre}
                    </span>
                    {!t.esResumen && !t.holguraInferida && (
                      <span
                        className="ml-2 text-xs opacity-60"
                        title="Holgura: cuantos dias de trabajo puede retrasarse sin mover el fin de la obra"
                      >
                        ({Number(t.holguraDias).toFixed(0)}d de holgura)
                      </span>
                    )}
                    {/*
                      Un hito CON CODIGO se marca aparte y en rojo. La etiqueta
                      gris «(hito)» era la unica senal, y no distingue el hito
                      legitimo —«fin de estructuras», sin codigo— de una partida
                      que dejo de contar en el avance sin dar ningun error. Esto
                      es lo que permite encontrarla sin repasar la lista a ojo.
                    */}
                    {t.esHito && (
                      <span
                        className="ml-2 text-xs"
                        style={
                          t.codigo
                            ? { color: "var(--color-peligro)", fontWeight: 500 }
                            : { opacity: 0.6 }
                        }
                        title={
                          t.codigo
                            ? "Marcada como hito: no cuenta en el avance ponderado ni se puede enlazar con el presupuesto."
                            : undefined
                        }
                      >
                        (hito{t.codigo ? ", no cuenta en el avance" : ""})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{t.inicio}</td>
                  <td className="px-3 py-2 tabular-nums">{t.fin}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.duracionDias}</td>
                  {(puedeEditar || puedeEliminar) && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {puedeEditar && (
                        <button
                          type="button"
                          onClick={() => editar(t)}
                          aria-label={`Editar ${t.nombre}`}
                          className="rounded p-1 opacity-50 hover:opacity-100"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                      )}
                      {puedeEliminar && (
                        <button
                          type="button"
                          onClick={() => borrar(t.uid)}
                          aria-label={`Eliminar ${t.nombre}`}
                          className="rounded p-1 opacity-50 hover:opacity-100"
                          style={{ color: "var(--color-peligro)" }}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* El segundo paso del borrado: no es un error, es una pregunta. */}
      {porConfirmar && (
        <div
          role="alert"
          className="rounded-lg px-3 py-2 text-sm text-pretty"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
          }}
        >
          <p>{porConfirmar.texto}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => borrar(porConfirmar.uid, true)}
              disabled={guardando}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-peligro)" }}
            >
              Eliminar de todos modos
            </button>
            <button
              type="button"
              onClick={() => setPorConfirmar(null)}
              className="text-sm underline opacity-70"
            >
              Dejarlo
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-pretty"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      {puedeEditar &&
        (abierto ? (
          <div
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <fieldset>
              <legend className="text-sm font-semibold">
                {editando === null ? "Añadir una tarea" : "Editar la tarea"}
              </legend>

              <p className="mt-2 text-xs text-pretty opacity-70">
                Sin marcar ninguna dependencia, esta tarea nace sin ruta
                crítica y con la holgura marcada como no conocida —no se
                inventa lo que aquí no se sabe—. Marca de qué tareas depende
                para que GCM calcule cuáles son las que de verdad no tienen
                margen.
              </p>

              {/* Solo al crear. Mover una tarea ya escrita arrastra a todas
                  las suyas, y eso es otra operacion distinta de editarla. */}
              {editando === null && tareas.length > 0 && (
                <label className="mt-4 block text-xs">
                  <span className="mb-0.5 block font-medium opacity-70">
                    Cuelga de
                  </span>
                  <select
                    value={campos.padreUid}
                    onChange={(e) => setCampos({ ...campos, padreUid: e.target.value })}
                    className="w-full max-w-lg rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                  >
                    <option value="">Nada: va al primer nivel</option>
                    {tareas.map((t) => (
                      <option key={t.uid} value={t.uid}>
                        {" ".repeat((t.nivel - 1) * 3)}
                        {t.codigo ? `${t.codigo} ` : ""}
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                  <span className="mt-0.5 block opacity-60">
                    Entra justo detrás de lo que ya cuelgue de ella.
                  </span>
                </label>
              )}

              {/*
                Disponible al crear Y al editar —a diferencia de "Cuelga de",
                cambiar de que depende no reorganiza nada, solo mueve el
                calculo—. Solo tareas de trabajo (sin resumenes: quedan fuera
                del calculo y marcarlas seria un enlace que nunca hace nada),
                y nunca la propia tarea que se esta editando.
              */}
              {tareas.some((t) => !t.esResumen && t.uid !== editando) && (
                <fieldset
                  className="mt-4 rounded-lg border p-2.5"
                  style={{ borderColor: "var(--borde)" }}
                >
                  <legend className="px-1 text-xs font-medium opacity-70">
                    Depende de (tiene que terminar antes de poder empezar)
                  </legend>

                  {/* Una EDT generada desde presupuesto puede traer cientos
                      de tareas: sin buscador, encontrar la predecesora en el
                      scroll seria impracticable. */}
                  {candidatosDependencia.length > 8 && (
                    <label className="relative mb-2 block">
                      <Search
                        className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 opacity-50"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={buscarDependencia}
                        onChange={(e) => setBuscarDependencia(e.target.value)}
                        placeholder="Buscar por código o nombre"
                        className="w-full rounded border py-1 pr-2 pl-7 text-xs"
                        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                      />
                    </label>
                  )}

                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {candidatosDependenciaVisibles.map((t) => (
                      <label key={t.uid} className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={campos.dependeDeUids.includes(t.uid)}
                          onChange={(e) =>
                            setCampos({
                              ...campos,
                              dependeDeUids: e.target.checked
                                ? [...campos.dependeDeUids, t.uid]
                                : campos.dependeDeUids.filter((u) => u !== t.uid),
                            })
                          }
                        />
                        <span>
                          {t.codigo ? `${t.codigo} ` : ""}
                          {t.nombre}
                        </span>
                      </label>
                    ))}
                    {candidatosDependenciaVisibles.length === 0 && (
                      <p className="px-1 py-1 text-xs opacity-60">
                        Ninguna tarea coincide con la búsqueda.
                      </p>
                    )}
                  </div>
                </fieldset>
              )}

              <div className="mt-4 flex flex-wrap items-start gap-3">
                <Campo
                  etiqueta="Código"
                  ancho="w-24"
                  value={campos.codigo}
                  onChange={(e) => setCampos({ ...campos, codigo: e.target.value })}
                  placeholder="4.1"
                />
                <Campo
                  etiqueta="Tarea"
                  ancho="min-w-56 flex-1"
                  value={campos.nombre}
                  onChange={(e) => setCampos({ ...campos, nombre: e.target.value })}
                  placeholder="Vaciado de zapatas"
                />
                <Campo
                  etiqueta="Inicio"
                  ancho="w-40"
                  type="date"
                  value={campos.inicio}
                  onChange={(e) => setCampos({ ...campos, inicio: e.target.value })}
                />
                <Campo
                  etiqueta="Fin"
                  ancho="w-40"
                  type="date"
                  value={campos.fin}
                  onChange={(e) => setCampos({ ...campos, fin: e.target.value })}
                />
                <Campo
                  etiqueta="Duración"
                  ancho="w-28"
                  readOnly
                  tabIndex={-1}
                  value={duracionCalculada}
                  placeholder="—"
                  ayuda={
                    duracionCalculada === ""
                      ? "Sale de las fechas"
                      : "Días de trabajo, del calendario de la obra"
                  }
                  className="bg-black/5 dark:bg-white/5"
                />
                <Campo
                  etiqueta="% planeado"
                  ancho="w-28"
                  inputMode="decimal"
                  value={campos.porcentajePlaneado}
                  onChange={(e) =>
                    setCampos({ ...campos, porcentajePlaneado: e.target.value })
                  }
                  placeholder="0"
                />
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={campos.esHito}
                  onChange={(e) => setCampos({ ...campos, esHito: e.target.checked })}
                />
                Es un hito
              </label>

              {/*
                Marcar «es un hito» NO es cosmetico, y la casilla sola no lo
                decia: `esHito` saca la fila del avance ponderado, del enlace
                con el presupuesto, del parte del dia y del tablero, todo a la
                vez y sin dar ningun error. Asi es como una partida acabo de
                rombo en el Gantt y dejo de contar.

                El aviso sube de tono cuando ademas hay CODIGO, porque un
                codigo es lo que distingue una partida del presupuesto de un
                acontecimiento como «fin de estructuras». Se avisa, no se
                impide: hay hitos legitimos y quien planifica manda.
              */}
              {campos.esHito && (
                <p
                  className="mt-2 rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: campos.codigo.trim()
                      ? "var(--color-peligro)"
                      : "var(--borde)",
                    backgroundColor: campos.codigo.trim()
                      ? "color-mix(in srgb, var(--color-peligro) 8%, transparent)"
                      : undefined,
                  }}
                >
                  Un hito dura cero días: en el Gantt sale como un rombo, sin
                  barra, y <strong>no cuenta en el avance ponderado ni se puede
                  enlazar con una partida del presupuesto</strong>.
                  {campos.codigo.trim() && (
                    <>
                      {" "}
                      Y esta lleva el código{" "}
                      <span className="font-mono">{campos.codigo.trim()}</span>:
                      si es una partida con dinero, marcarla como hito la saca
                      de la valorización <strong>sin dar ningún error</strong>.
                      Para una fecha clave, deja la partida como está y márcala
                      con «Marcar hito», que crea una fila aparte.
                    </>
                  )}
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={enviar}
                  disabled={guardando || campos.nombre.trim() === ""}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: "var(--color-marca)" }}
                >
                  {guardando ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CalendarPlus className="size-4" aria-hidden="true" />
                  )}
                  {editando === null ? "Añadir tarea" : "Guardar cambios"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    limpiar();
                    setAbierto(false);
                  }}
                  className="text-sm underline opacity-70"
                >
                  {editando === null ? "Terminar" : "Cancelar"}
                </button>
              </div>
            </fieldset>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            Escribir una tarea a mano
          </button>
        ))}
    </div>
  );
}
