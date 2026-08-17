"use client";

import { useRef, useState, useTransition } from "react";
import { AlertCircle, CalendarClock, LoaderCircle, Upload, X } from "lucide-react";
import type { ResultadoAnalisisCronograma } from "@/lib/msproject-xml";
import {
  accionAnalizar,
  accionImportar,
  accionReemplazar,
} from "@/app/(dashboard)/obras/[id]/cronograma/importar/acciones";
import type { EnRiesgoPorReemplazoCronograma } from "@/services/cronograma.service";
import { VistaPreviaCronograma } from "@/components/cronograma/VistaPreviaCronograma";
import { fechaLarga } from "@/utils/fechas";

interface Props {
  obraId: string;
  /// Fechas de corte ya cargadas, en texto "YYYY-MM-DD". Sirven para avisar
  /// antes de subir de que ese corte ya estaba.
  cortesCargados: string[];
  /// El servidor tiene Java y MPXJ, y puede convertir el .mpp por su cuenta.
  /// En desarrollo no los hay, y entonces solo se acepta el .xml.
  admiteMpp: boolean;
}

export function ImportadorCronograma({
  obraId,
  cortesCargados,
  admiteMpp,
}: Props) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<ResultadoAnalisisCronograma | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * El corte ya estaba y el archivo trae otro plan. Mientras esto tenga valor,
   * NADA se ha escrito: es la pantalla de «esto es lo que te llevas por
   * delante» y el unico camino hacia `accionReemplazar`.
   */
  const [riesgo, setRiesgo] = useState<EnRiesgoPorReemplazoCronograma | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [pendiente, iniciarTransicion] = useTransition();
  const entradaArchivo = useRef<HTMLInputElement>(null);

  function limpiar() {
    setArchivo(null);
    setAnalisis(null);
    setError(null);
    setRiesgo(null);
    setConfirmado(false);
    if (entradaArchivo.current) entradaArchivo.current.value = "";
  }

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0] ?? null;
    setArchivo(elegido);
    setAnalisis(null);
    setError(null);
    setRiesgo(null);
    setConfirmado(false);
    if (!elegido) return;

    // Se analiza al instante: obligar a pulsar un boton extra solo para ver
    // el contenido del archivo es friccion sin ganancia.
    const datos = new FormData();
    datos.append("archivo", elegido);

    iniciarTransicion(async () => {
      const resultado = await accionAnalizar({}, datos);
      if (resultado.error) setError(resultado.error);
      else setAnalisis(resultado.analisis ?? null);
    });
  }

  function confirmar() {
    if (!archivo) return;

    const datos = new FormData();
    datos.append("archivo", archivo);
    datos.append("obraId", obraId);

    iniciarTransicion(async () => {
      // Si todo va bien la accion redirige y este componente se desmonta.
      const resultado = await accionImportar({}, datos);
      if (resultado?.error) setError(resultado.error);
      // El corte ya estaba con OTRO plan: no se escribio nada y hay que
      // ensenar lo que un reemplazo se llevaria por delante.
      else if (resultado?.riesgo) setRiesgo(resultado.riesgo);
    });
  }

  function reemplazar() {
    if (!archivo) return;

    const datos = new FormData();
    datos.append("archivo", archivo);
    datos.append("obraId", obraId);
    datos.append("confirmado", "si");

    iniciarTransicion(async () => {
      const resultado = await accionReemplazar({}, datos);
      if (resultado?.error) setError(resultado.error);
    });
  }

  const hayTareas = (analisis?.tareas.length ?? 0) > 0;
  const corteRepetido =
    analisis?.fechaCorte !== undefined &&
    analisis?.fechaCorte !== null &&
    cortesCargados.includes(analisis.fechaCorte);

  /**
   * Un corte repetido YA NO bloquea el boton.
   *
   * Bloquearlo aqui dejaba sin salida el unico camino que hay para corregir un
   * corte ya cargado —no existe borrar una version importada—, y encima
   * escondia el caso bueno: si el archivo trae el mismo plan, el servidor
   * responde «ya estaba» y no escribe nada. Quien decide es el servidor, que
   * compara el plan; la pantalla solo avisa de lo que va a pasar.
   */
  const puedeImportar = hayTareas && !!analisis?.fechaCorte && !pendiente;

  return (
    <div className="space-y-6">
      <Seccion titulo="1. Elige el archivo">
        <p className="mt-1 text-sm opacity-70">
          {admiteMpp ? (
            <>
              El <strong>.mpp</strong> de MS Project directamente, o su
              exportación a <strong>.xml</strong>. El .mpp lo convierte el
              servidor: el de esta obra tarda unos cinco segundos.
            </>
          ) : (
            <>
              El XML que exporta MS Project (Archivo &gt; Guardar como &gt;
              XML). Este servidor no puede convertir archivos .mpp.
            </>
          )}{" "}
          También se acepta el <strong>Excel de la plantilla</strong>, para las
          obras que no llevan el plan en MS Project. Ese camino no trae la ruta
          crítica: sin la red completa de precedencias no se conoce, y GCM
          prefiere decir que no se sabe antes que dibujar una que no existe.{" "}
          Se lee el plan tal como está en el archivo: tareas, fechas,
          duraciones, predecesoras y el <strong>% Planeado</strong>, que no se
          calcula sino que se toma del campo personalizado, para que las cifras
          coincidan con tu informe.
        </p>

        <div className="mt-4">
          <label
            htmlFor="archivo"
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Upload className="size-4" aria-hidden="true" />
            {archivo ? "Elegir otro archivo" : "Seleccionar archivo"}
          </label>
          <input
            ref={entradaArchivo}
            id="archivo"
            name="archivo"
            type="file"
            accept={admiteMpp ? ".mpp,.xml,.xlsx,.xlsm" : ".xml,.xlsx,.xlsm"}
            onChange={alElegirArchivo}
            className="sr-only"
          />

          {archivo && (
            <span className="ml-3 inline-flex items-center gap-1.5 text-sm">
              <CalendarClock className="size-4 shrink-0 opacity-60" aria-hidden="true" />
              <span className="break-all">{archivo.name}</span>
              <button
                type="button"
                onClick={limpiar}
                className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
                aria-label="Quitar archivo"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>

        {pendiente && !analisis && (
          <p className="mt-3 flex items-center gap-2 text-sm opacity-70" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {/* Convertir el .mpp tarda unos segundos, y un «leyendo...» que se
                queda quieto tanto rato parece que se colgo. */}
            {archivo?.name.toLowerCase().endsWith(".mpp")
              ? "Convirtiendo el archivo de MS Project..."
              : "Leyendo el archivo..."}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </Seccion>

      {analisis && (
        <Seccion titulo="2. Revisa antes de cargar">
          <p className="mt-1 text-sm opacity-70">
            Nada se ha guardado todavía. Comprueba que el plazo y los
            porcentajes cuadran con tu informe.
          </p>

          <div className="mt-4">
            <VistaPreviaCronograma analisis={analisis} />
          </div>
        </Seccion>
      )}

      {hayTareas && (
        <Seccion titulo="3. Confirma">
          <p className="mt-1 text-sm opacity-70">
            Cada corte se guarda como una versión nueva: no se pisa nada, y el
            avance que ya hayas reportado en GCM se mantiene.
          </p>

          {corteRepetido && analisis?.fechaCorte && (
            <div
              className="mt-3 flex items-start gap-2 rounded-lg p-3 text-sm"
              style={{
                backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
              }}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                El corte del{" "}
                <strong>{fechaLarga(new Date(`${analisis.fechaCorte}T00:00:00Z`))}</strong>{" "}
                ya está cargado. Si el archivo trae el mismo plan no se
                guardará nada; si trae cambios, GCM te enseñará qué se
                reescribe antes de tocar nada. Para registrar un corte{" "}
                <em>nuevo</em>, fija otra fecha de estado en MS Project y
                vuelve a exportar.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={confirmar}
            disabled={!puedeImportar}
            className="mt-4 flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {pendiente && (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            )}
            {pendiente
              ? "Cargando..."
              : corteRepetido
                ? "Comprobar si el archivo trae cambios"
                : `Cargar ${analisis?.totalTareas ?? 0} tareas`}
          </button>

          {riesgo && <PanelDeReemplazo
            riesgo={riesgo}
            confirmado={confirmado}
            alConfirmar={setConfirmado}
            alReemplazar={reemplazar}
            pendiente={pendiente}
          />}

          {analisis && analisis.errores.length > 0 && (
            <p className="mt-2 text-xs opacity-70">
              Las {analisis.errores.length} tareas con incidencias quedarán
              fuera. Puedes cargar ahora y corregirlas después, o arreglar el
              cronograma en Project y volver a exportarlo.
            </p>
          )}
        </Seccion>
      )}
    </div>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * Lo que un reemplazo se lleva por delante, antes de autorizarlo.
 *
 * El orden de la lista no es decorativo: primero lo que NO vuelve —el avance
 * y los mapeos que se quedan sin tarea—, y solo despues los conteos. Un
 * «se reescriben 107 tareas» a secas se lee como rutina, que es justo lo que
 * este panel existe para evitar.
 */
function PanelDeReemplazo({
  riesgo,
  confirmado,
  alConfirmar,
  alReemplazar,
  pendiente,
}: {
  riesgo: EnRiesgoPorReemplazoCronograma;
  confirmado: boolean;
  alConfirmar: (v: boolean) => void;
  alReemplazar: () => void;
  pendiente: boolean;
}) {
  const huerfanos = riesgo.uidsQueDesaparecen.filter(
    (u) => u.avances > 0 || u.mapeos > 0,
  );

  return (
    <div
      className="mt-4 rounded-lg border p-4"
      style={{ borderColor: "var(--color-alerta)" }}
    >
      <h3 className="text-sm font-semibold">
        Ese corte ya está cargado y el archivo trae otro plan
      </h3>

      <p className="mt-1 text-sm opacity-70">
        Todavía no se ha guardado nada. Reemplazar reescribe la versión{" "}
        <strong>v{riesgo.version}</strong> en su sitio: mantiene su fecha de
        corte y su número, así que la curva S sigue con un solo punto ese día.
      </p>

      <ul className="mt-3 space-y-1 text-sm">
        <li>
          Se reescriben <strong>{riesgo.tareasImportadas}</strong> tareas que
          vinieron de un archivo; el tuyo las trae otra vez.
        </li>
        {riesgo.tareasNuevas > 0 && (
          <li>
            Entran <strong>{riesgo.tareasNuevas}</strong> tareas nuevas.
          </li>
        )}
        {riesgo.tareasManuales > 0 && (
          <li>
            Se <strong>conservan</strong> las {riesgo.tareasManuales} tareas
            escritas a mano en GCM: el archivo no opina sobre ellas.
          </li>
        )}
      </ul>

      {huerfanos.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium">
            Esto es lo que no vuelve solo:
          </p>
          <p className="mt-1 text-sm opacity-70">
            {riesgo.avancesHuerfanos > 0 && (
              <>
                <strong>{riesgo.avancesHuerfanos}</strong> reportes de avance
              </>
            )}
            {riesgo.avancesHuerfanos > 0 && riesgo.mapeosHuerfanos > 0 && " y "}
            {riesgo.mapeosHuerfanos > 0 && (
              <>
                <strong>{riesgo.mapeosHuerfanos}</strong> mapeos con el
                presupuesto, que confirmó una persona uno a uno
              </>
            )}{" "}
            quedan sin tarea, porque el archivo nuevo ya no trae su UID. No se
            borran —siguen guardados—, pero dejan de aparecer hasta que un
            corte vuelva a traer esos UID.
          </p>

          <ul className="mt-2 space-y-1 text-xs opacity-80">
            {huerfanos.slice(0, 8).map((u) => (
              <li key={u.uid}>
                <strong>{u.uid}</strong> · {u.nombre}
                {u.avances > 0 && ` · ${u.avances} avances`}
                {u.mapeos > 0 && ` · ${u.mapeos} mapeos`}
              </li>
            ))}
          </ul>

          {huerfanos.length > 8 && (
            <p className="mt-1 text-xs opacity-70">
              …y {huerfanos.length - 8} más.
            </p>
          )}
        </div>
      )}

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => alConfirmar(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Entiendo que se reescribe la versión v{riesgo.version} del{" "}
          {riesgo.fechaCorte} con lo que trae este archivo.
        </span>
      </label>

      <button
        type="button"
        onClick={alReemplazar}
        disabled={!confirmado || pendiente}
        className="mt-3 flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: "var(--color-peligro)" }}
      >
        {pendiente && (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        )}
        {pendiente ? "Reemplazando..." : "Reemplazar el corte"}
      </button>
    </div>
  );
}
