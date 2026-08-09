"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, ExternalLink } from "lucide-react";
import type { PartidaAsignable } from "@/services/encargos.service";
import { soles } from "@/utils/formato";
import {
  accionCrearEncargo,
  accionEditarEncargo,
} from "@/app/(dashboard)/obras/[id]/proveedores/acciones";

export interface ProveedorOpcion {
  id: string;
  razonSocial: string;
  ruc: string;
}

export interface EncargoInicial {
  proveedorId: string;
  descripcion: string;
  montoContratado: string;
  fechaInicio: string;
  fechaFin: string;
  notas: string;
  partidas: { wbsItemId: string; fraccion: string }[];
}

/**
 * Alta y edicion de un encargo.
 *
 * Dos cosas se resuelven aqui: a QUE proveedor —de los de la empresa, o uno
 * nuevo que se crea en su catalogo— y QUE frente le toca. El frente es la
 * parte delicada: son 300 y pico partidas, asi que hay buscador, y cada una
 * puede ir entera o fraccionada, mostrando cuanto lleva ya asignado a otros
 * para no repartir de mas.
 */
export function FormularioEncargo({
  obraId,
  proveedores,
  partidas,
  inicial,
  encargoId,
}: {
  obraId: string;
  proveedores: ProveedorOpcion[];
  partidas: PartidaAsignable[];
  /// Presente al editar. Ausente al crear.
  inicial?: EncargoInicial;
  encargoId?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [proveedorId, setProveedorId] = useState(inicial?.proveedorId ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [monto, setMonto] = useState(inicial?.montoContratado ?? "");
  const [fechaInicio, setFechaInicio] = useState(inicial?.fechaInicio ?? "");
  const [fechaFin, setFechaFin] = useState(inicial?.fechaFin ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [filtro, setFiltro] = useState("");

  // La seleccion: partida -> fraccion. Se arranca de lo que trae el encargo al
  // editar, o vacio al crear.
  const [seleccion, setSeleccion] = useState<Map<string, string>>(
    () => new Map(inicial?.partidas.map((p) => [p.wbsItemId, p.fraccion])),
  );

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return partidas;
    return partidas.filter(
      (p) =>
        p.codigoPartida.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q),
    );
  }, [partidas, filtro]);

  // El presupuesto del frente elegido, para que se vea cuanto suma lo marcado
  // sin tener que guardar para descubrirlo.
  const presupuestoFrente = useMemo(() => {
    let total = 0;
    for (const p of partidas) {
      const fr = seleccion.get(p.id);
      if (fr === undefined) continue;
      total += (Number(p.parcial) * Number(fr)) / 100;
    }
    return total;
  }, [partidas, seleccion]);

  function alternar(p: PartidaAsignable) {
    setSeleccion((previo) => {
      const copia = new Map(previo);
      if (copia.has(p.id)) {
        copia.delete(p.id);
      } else {
        // Por defecto, lo que queda libre de la partida (100 menos lo ya
        // asignado a otros), redondeado; entera si no hay nada asignado.
        const libre = Math.max(0, 100 - p.asignadoPorcentaje);
        copia.set(p.id, String(libre > 0 ? libre : 100));
      }
      return copia;
    });
  }

  function cambiarFraccion(id: string, valor: string) {
    setSeleccion((previo) => {
      const copia = new Map(previo);
      copia.set(id, valor);
      return copia;
    });
  }

  function enviar() {
    setError(null);

    if (!proveedorId) return setError("Elige un proveedor.");
    if (!descripcion.trim()) return setError("Escribe una descripcion del frente.");
    if (!monto) return setError("Falta el monto contratado.");
    if (seleccion.size === 0) return setError("Marca al menos una partida.");

    const datos = {
      proveedorId,
      descripcion,
      montoContratado: monto,
      fechaInicio: fechaInicio || undefined,
      fechaFin: fechaFin || undefined,
      notas: notas || undefined,
      partidas: [...seleccion.entries()].map(([wbsItemId, fraccion]) => ({
        wbsItemId,
        fraccion,
      })),
    };

    iniciar(async () => {
      const r =
        inicial && encargoId
          ? await accionEditarEncargo(obraId, encargoId, datos)
          : await accionCrearEncargo(obraId, datos);

      if (r.ok) router.push(`/obras/${obraId}/proveedores`);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-5">
      {/* Proveedor: se jala de los de la empresa o se crea uno nuevo en su
          catalogo (que es donde vive, para poder reutilizarlo en otras obras). */}
      <div>
        <label htmlFor="enc-prov" className="mb-1 block text-sm font-medium">
          Proveedor
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="enc-prov"
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className="min-w-64 flex-1 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          >
            <option value="">— Elige un proveedor —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razonSocial} · {p.ruc}
              </option>
            ))}
          </select>
          <Link
            href="/empresa/proveedores"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Crear proveedor
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="enc-desc" className="mb-1 block text-sm font-medium">
            Descripcion del frente
          </label>
          <input
            id="enc-desc"
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Estructura metalica ZONA 1, instalaciones sanitarias..."
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </div>

        <div>
          <label htmlFor="enc-monto" className="mb-1 block text-sm font-medium">
            Monto contratado (sin IGV)
          </label>
          <input
            id="enc-monto"
            type="number"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border px-3 py-2 text-sm tabular-nums"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
          <p className="mt-1 text-xs opacity-60">
            El precio del proveedor. Puede diferir de tu presupuesto.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="enc-ini" className="mb-1 block text-sm font-medium">
              Inicio
            </label>
            <input
              id="enc-ini"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full rounded-lg border px-2 py-2 text-sm"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            />
          </div>
          <div>
            <label htmlFor="enc-fin" className="mb-1 block text-sm font-medium">
              Fin
            </label>
            <input
              id="enc-fin"
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full rounded-lg border px-2 py-2 text-sm"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            />
          </div>
        </div>
      </div>

      {/* El frente: que partidas y en que fraccion. */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">
            Partidas del frente{" "}
            <span className="opacity-60">({seleccion.size} marcada(s))</span>
          </h3>
          <span className="text-sm tabular-nums">
            Presupuesto del frente:{" "}
            <strong>{soles(presupuestoFrente.toFixed(2))}</strong>
          </span>
        </div>

        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 opacity-50"
            aria-hidden="true"
          />
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar partida por codigo o descripcion"
            className="w-full rounded-lg border py-2 pr-3 pl-8 text-sm"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />
        </div>

        <div
          className="max-h-96 overflow-y-auto rounded-lg border"
          style={{ borderColor: "var(--borde)" }}
        >
          {filtradas.length === 0 ? (
            <p className="p-4 text-center text-sm opacity-60">
              Ninguna partida coincide con la busqueda.
            </p>
          ) : (
            <ul>
              {filtradas.map((p) => {
                const marcada = seleccion.has(p.id);
                const libre = Math.max(0, 100 - p.asignadoPorcentaje);
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(p)}
                      className="size-4 shrink-0"
                      aria-label={`Incluir ${p.codigoPartida}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium tabular-nums">
                          {p.codigoPartida}
                        </span>{" "}
                        {p.descripcion}
                      </p>
                      <p className="text-xs opacity-60">
                        {soles(p.parcial)}
                        {p.asignadoPorcentaje > 0 && (
                          <span style={{ color: "var(--color-alerta)" }}>
                            {" "}
                            · {p.asignadoPorcentaje.toFixed(0)}% ya asignado
                            {p.proveedores.length > 0 &&
                              ` a ${p.proveedores.join(", ")}`}
                          </span>
                        )}
                      </p>
                    </div>
                    {marcada && (
                      <label className="flex shrink-0 items-center gap-1 text-xs">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={seleccion.get(p.id) ?? ""}
                          onChange={(e) => cambiarFraccion(p.id, e.target.value)}
                          className="w-16 rounded border px-1.5 py-1 text-sm tabular-nums"
                          style={{
                            borderColor:
                              Number(seleccion.get(p.id)) > libre
                                ? "var(--color-peligro)"
                                : "var(--borde)",
                            backgroundColor: "var(--superficie)",
                          }}
                          aria-label={`Fraccion de ${p.codigoPartida}`}
                        />
                        <span className="opacity-60">%</span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="mt-1 text-xs opacity-60">
          Lo normal es 100 % (la partida entera). Baja la fraccion cuando el
          frente se reparte con otro proveedor.
        </p>
      </div>

      <div>
        <label htmlFor="enc-notas" className="mb-1 block text-sm font-medium">
          Notas (opcional)
        </label>
        <textarea
          id="enc-notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </div>

      {error && (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "color-mix(in oklab, var(--color-peligro) 40%, transparent)",
            color: "var(--color-peligro)",
          }}
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={enviar}
          disabled={pendiente}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {pendiente
            ? "Guardando..."
            : inicial
              ? "Guardar cambios"
              : "Crear encargo"}
        </button>
        <Link
          href={`/obras/${obraId}/proveedores`}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          Cancelar
        </Link>
      </div>
    </div>
  );
}
