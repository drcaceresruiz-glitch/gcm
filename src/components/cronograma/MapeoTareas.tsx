"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Check, LoaderCircle, Link2, Link2Off, Search } from "lucide-react";
import type { TareaParaMapear } from "@/services/mapeo.service";
import type { PartidaMapeable } from "@/lib/mapeo-partidas";
import {
  accionDesenlazar,
  accionEnlazar,
} from "@/app/(dashboard)/obras/[id]/cronograma/mapeo/acciones";
import { soles } from "@/utils/formato";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * Revisar y confirmar que partidas cubre cada tarea.
 *
 * GCM propone; la persona acepta. Nunca al reves. Un mapeo equivocado no da
 * ningun sintoma —la curva sale bonita y miente—, asi que la propuesta se
 * presenta con su parecido a la vista y sin nada preseleccionado.
 *
 * La coincidencia de codigo se marca en AMARILLO y no en verde: en los
 * archivos reales de CRIOCORD, dos de cada tres coincidencias de codigo
 * apuntaban a otra partida. Pintarla como acierto seria empujar al error.
 */
export function MapeoTareas({
  obraId,
  tareas,
  partidas,
  puedeEditar,
}: {
  obraId: string;
  tareas: TareaParaMapear[];
  partidas: PartidaMapeable[];
  puedeEditar: boolean;
}) {
  const [filtro, setFiltro] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [error, setError] = useState<{ uid: number; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function ejecutar(datos: FormData, quitar: boolean) {
    iniciar(async () => {
      const r = await (quitar ? accionDesenlazar : accionEnlazar)({ ok: true }, datos);
      setError(r.ok || r.uid === undefined ? null : { uid: r.uid, texto: r.error ?? "" });
    });
  }

  const busqueda = filtro.trim().toLowerCase();
  const visibles = tareas.filter((t) => {
    if (soloPendientes && t.enlazadas.length > 0) return false;
    if (!busqueda) return true;
    return (
      t.nombre.toLowerCase().includes(busqueda) ||
      (t.codigo ?? "").toLowerCase().includes(busqueda)
    );
  });

  const sinEnlazar = tareas.filter((t) => t.enlazadas.length === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-64 flex-1">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar tarea por código o nombre"
            className="w-full rounded-lg border py-2 pr-3 pl-9 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
            className="size-4"
          />
          Solo las {sinEnlazar} sin enlazar
        </label>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm opacity-70"
          style={{ borderColor: "var(--borde)" }}>
          {sinEnlazar === 0
            ? "Todas las tareas tienen partida asignada."
            : "Ninguna tarea coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visibles.map((t) => (
            <li
              key={t.uid}
              className="rounded-xl border p-3"
              style={{
                borderColor: "var(--borde)",
                backgroundColor: "var(--superficie)",
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {t.codigo && (
                    <span className="mr-2 font-mono text-xs opacity-60">{t.codigo}</span>
                  )}
                  {t.nombre}
                </span>
                {t.importe && (
                  <span className="text-sm font-semibold tabular-nums">
                    {soles(t.importe)}
                  </span>
                )}
              </div>

              {t.enlazadas.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {t.enlazadas.map((p) => (
                    <li
                      key={p.codigo}
                      className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm"
                      style={{
                        backgroundColor:
                          "color-mix(in oklab, var(--color-exito) 12%, transparent)",
                      }}
                    >
                      <Check
                        className="size-4 shrink-0"
                        style={{ color: "var(--color-exito)" }}
                        aria-hidden="true"
                      />
                      <span className="font-mono text-xs opacity-70">{p.codigo}</span>
                      <span className="min-w-0 flex-1 truncate">{p.descripcion}</span>
                      <span className="tabular-nums">{soles(p.parcial)}</span>

                      {puedeEditar && (
                        <Boton
                          obraId={obraId}
                          uid={t.uid}
                          codigo={p.codigo}
                          pendiente={pendiente}
                          onSubmit={(d) => ejecutar(d, true)}
                          icono={Link2Off}
                          titulo="Quitar este enlace"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {t.propuestas.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs opacity-60">
                    Propuestas de GCM. Acepta solo las que de verdad correspondan.
                  </p>
                  <ul className="space-y-1">
                    {t.propuestas.map((p) => (
                      <li
                        key={p.codigo}
                        className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
                        style={{
                          borderColor: p.mismoCodigo
                            ? "var(--color-alerta)"
                            : "var(--borde)",
                        }}
                      >
                        <span className="font-mono text-xs opacity-70">{p.codigo}</span>
                        <span className="min-w-0 flex-1 truncate">{p.descripcion}</span>

                        {p.mismoCodigo && (
                          <span
                            className="text-xs whitespace-nowrap"
                            style={{ color: "var(--color-alerta)" }}
                            title="El código coincide, pero en los archivos reales dos de cada tres coincidencias de código apuntaban a otra partida"
                          >
                            mismo código (poco fiable)
                          </span>
                        )}

                        <span className="text-xs whitespace-nowrap opacity-60">
                          {Math.round(p.puntuacion * 100)}% de parecido
                        </span>
                        <span className="tabular-nums">{soles(p.parcial)}</span>

                        {puedeEditar && (
                          <Boton
                            obraId={obraId}
                            uid={t.uid}
                            codigo={p.codigo}
                            pendiente={pendiente}
                            onSubmit={(d) => ejecutar(d, false)}
                            icono={Link2}
                            titulo="Confirmar que esta tarea cubre esta partida"
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {t.propuestas.length === 0 && t.enlazadas.length === 0 && (
                <BuscadorManual
                  obraId={obraId}
                  uid={t.uid}
                  partidas={partidas}
                  puedeEditar={puedeEditar}
                  pendiente={pendiente}
                  onSubmit={(d) => ejecutar(d, false)}
                />
              )}

              {error?.uid === t.uid && (
                <p
                  role="alert"
                  className="mt-2 flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs"
                  style={{
                    backgroundColor:
                      "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
                  }}
                >
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {error.texto}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Buscador para las tareas sin ninguna propuesta.
 *
 * Muchas tareas del cronograma no se parecen a ninguna partida por el texto
 * —«Fin de cimentaciones», «Entrega de almacen»— y sin esto no habria forma de
 * enlazarlas aunque la persona sepa perfectamente cual es.
 */
function BuscadorManual({
  obraId,
  uid,
  partidas,
  puedeEditar,
  pendiente,
  onSubmit,
}: {
  obraId: string;
  uid: number;
  partidas: PartidaMapeable[];
  puedeEditar: boolean;
  pendiente: boolean;
  onSubmit: (datos: FormData) => void;
}) {
  const [texto, setTexto] = useState("");

  /*
   * En una obra que no admite cambios no se ofrece: `confirmarEnlace` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  if (!puedeEditar) {
    return <p className="mt-2 text-xs opacity-60">Sin propuestas para esta tarea.</p>;
  }

  const busqueda = texto.trim().toLowerCase();
  const encontradas = busqueda
    ? partidas
        .filter(
          (p) =>
            p.descripcion.toLowerCase().includes(busqueda) ||
            p.codigo.toLowerCase().includes(busqueda),
        )
        .slice(0, 6)
    : [];

  return (
    <div className="mt-2">
      <p className="mb-1 text-xs opacity-60">
        Sin propuestas. Busca la partida a mano si sabes cuál es.
      </p>
      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar partida del presupuesto"
        className="w-full rounded-lg border px-3 py-1.5 text-sm"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />

      {encontradas.length > 0 && (
        <ul className="mt-1 space-y-1">
          {encontradas.map((p) => (
            <li
              key={p.codigo}
              className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <span className="font-mono text-xs opacity-70">{p.codigo}</span>
              <span className="min-w-0 flex-1 truncate">{p.descripcion}</span>
              <span className="tabular-nums">{soles(p.parcial)}</span>
              <Boton
                obraId={obraId}
                uid={uid}
                codigo={p.codigo}
                pendiente={pendiente}
                onSubmit={onSubmit}
                icono={Link2}
                titulo="Confirmar que esta tarea cubre esta partida"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Boton({
  obraId,
  uid,
  codigo,
  pendiente,
  onSubmit,
  icono: Icono,
  titulo,
}: {
  obraId: string;
  uid: number;
  codigo: string;
  pendiente: boolean;
  onSubmit: (datos: FormData) => void;
  icono: typeof Link2;
  titulo: string;
}) {
  return (
    <form action={onSubmit}>
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="uid" value={uid} />
      <input type="hidden" name="codigoPartida" value={codigo} />
      <button
        type="submit"
        disabled={pendiente}
        title={titulo}
        aria-label={titulo}
        className="inline-flex items-center rounded-md border p-1.5 disabled:opacity-50"
        style={{ borderColor: "var(--borde)" }}
      >
        {pendiente ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Icono className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}
