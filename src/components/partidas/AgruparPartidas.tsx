"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Combine, LoaderCircle } from "lucide-react";

import type { PartidaFila } from "@/services/obras.service";
import { accionAgruparPartidas } from "@/app/(dashboard)/obras/[id]/acciones";
import { sumar } from "@/lib/decimal";
import { soles } from "@/utils/formato";

/**
 * Agrupar varias partidas de un capitulo en un solo precio cerrado.
 *
 * Se eligen desde una lista propia y no con casillas en la tabla: la tabla ya
 * esconde columnas, colapsa capitulos y filtra, y meterle una seleccion
 * encima habria que sostenerla contra todo eso. Aqui la lista es corta —las
 * partidas de UN capitulo— y se ve entera.
 *
 * La condicion de que sean del mismo capitulo no es de la pantalla, es del
 * servicio: agrupar entre capitulos moveria dinero de uno a otro. La pantalla
 * se limita a no ofrecer lo que se va a rechazar.
 */
export function AgruparPartidas({
  obraId,
  filas,
}: {
  obraId: string;
  filas: PartidaFila[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [capituloId, setCapituloId] = useState("");
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [descripcion, setDescripcion] = useState("");
  const [importe, setImporte] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [guardando, guardar] = useTransition();

  // Solo valen los capitulos que tienen partidas agrupables colgando.
  const agrupablesDe = (id: string) =>
    filas.filter(
      (f) => f.parentId === id && f.tipo === "PARTIDA" && f.modalidad !== "ALCANCE",
    );

  const capitulos = filas
    .filter((f) => f.tipo === "CAPITULO" && agrupablesDe(f.id).length >= 2)
    .map((f) => ({ id: f.id, etiqueta: `${f.codigoPartida} ${f.descripcion}` }));

  const candidatas = capituloId ? agrupablesDe(capituloId) : [];
  const marcadas = candidatas.filter((f) => elegidas.has(f.id));
  const suma = sumar(marcadas.map((f) => f.parcial ?? "0"));

  // Si se teclea un importe distinto de la suma, eso es dinero entrando o
  // saliendo del presupuesto. Se dice ANTES de guardar, no despues.
  const importeFinal = importe.trim() === "" ? suma : importe.trim();
  const difiere = importe.trim() !== "" && importe.trim() !== suma;

  function alternar(id: string) {
    setElegidas((previo) => {
      const copia = new Set(previo);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
    setError(null);
  }

  function elegirCapitulo(id: string) {
    setCapituloId(id);
    setElegidas(new Set());
    setError(null);
  }

  function enviar() {
    setError(null);
    setHecho(null);

    guardar(async () => {
      const r = await accionAgruparPartidas(obraId, {
        partidaIds: [...elegidas],
        descripcion,
        importe: importe.trim() || null,
      });

      if (!r.ok) {
        setError(r.error ?? "No se pudo agrupar.");
        return;
      }

      setHecho(
        r.importe === r.suma
          ? `Listo: ${marcadas.length} partidas agrupadas en ${r.codigo} por ${soles(r.importe ?? "0")}.`
          : `Listo: ${r.codigo} quedo en ${soles(r.importe ?? "0")}, y la suma de las agrupadas era ${soles(r.suma ?? "0")}.`,
      );
      setElegidas(new Set());
      setDescripcion("");
      setImporte("");
      router.refresh();
    });
  }

  /**
   * Sin capitulos con dos partidas agrupables no hay nada que ofrecer... pero
   * si se acaba de agrupar, el aviso se iria con el panel justo cuando la
   * operacion ha salido bien: agrupar deja al capitulo con una sola partida
   * agrupable, asi que el exito se borraba a si mismo de la pantalla.
   */
  if (capitulos.length === 0) {
    return hecho ? (
      <p
        role="status"
        className="rounded-lg px-3 py-2 text-sm text-pretty"
        style={{
          backgroundColor:
            "color-mix(in oklab, var(--color-exito) 15%, transparent)",
        }}
      >
        {hecho}
      </p>
    ) : null;
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <Combine className="size-4" aria-hidden="true" />
        Agrupar partidas a suma alzada
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">Agrupar a suma alzada</legend>

        <p className="mt-2 text-xs text-pretty opacity-70">
          Las elegidas pasan a ser <strong>alcance</strong>: siguen describiendo
          lo que entra, pero su importe pasa a vivir en la partida nueva. No se
          puede si alguna tiene avance del cronograma, una orden o un encargo
          detrás.
        </p>

        <label className="mt-4 block text-xs">
          <span className="mb-0.5 block font-medium opacity-70">Capítulo</span>
          <select
            value={capituloId}
            onChange={(e) => elegirCapitulo(e.target.value)}
            className="w-full max-w-lg rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          >
            <option value="">Elige un capítulo</option>
            {capitulos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>

        {candidatas.length > 0 && (
          <ul className="mt-3 space-y-1">
            {candidatas.map((f) => (
              <li key={f.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={elegidas.has(f.id)}
                    onChange={() => alternar(f.id)}
                    className="mt-1"
                  />
                  <span className="tabular-nums opacity-70">{f.codigoPartida}</span>
                  <span className="flex-1">{f.descripcion}</span>
                  <span className="tabular-nums">{soles(f.parcial ?? "0")}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {marcadas.length >= 2 && (
          <>
            <p className="mt-3 text-sm">
              Suma de las {marcadas.length} elegidas:{" "}
              <strong className="tabular-nums">{soles(suma)}</strong>
            </p>

            <div className="mt-3 flex flex-wrap items-start gap-3">
              <label className="min-w-56 flex-1 text-xs">
                <span className="mb-0.5 block font-medium opacity-70">
                  Descripción de la partida agrupada
                </span>
                <input
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Instalaciones eléctricas, suministro e instalación"
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
              </label>

              <label className="w-40 text-xs">
                <span className="mb-0.5 block font-medium opacity-70">
                  Importe cerrado
                </span>
                <input
                  inputMode="decimal"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  placeholder={suma}
                  className="w-full rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
                />
                <span className="mt-0.5 block opacity-60">
                  En blanco, la suma
                </span>
              </label>
            </div>
          </>
        )}

        {difiere && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs text-pretty"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            El importe que has puesto no es la suma: el presupuesto cambiaría de{" "}
            {soles(suma)} a {soles(importeFinal)}. Queda registrado.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-pretty"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {hecho && (
          <p
            role="status"
            className="mt-3 rounded-lg px-3 py-2 text-sm text-pretty"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-exito) 15%, transparent)",
            }}
          >
            {hecho}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={enviar}
            disabled={
              guardando || marcadas.length < 2 || descripcion.trim() === ""
            }
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-marca)" }}
          >
            {guardando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Combine className="size-4" aria-hidden="true" />
            )}
            Agrupar {marcadas.length >= 2 ? `${marcadas.length} partidas` : ""}
          </button>

          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="text-sm underline opacity-70"
          >
            Terminar
          </button>
        </div>
      </fieldset>
    </div>
  );
}
