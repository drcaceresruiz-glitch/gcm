"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import type { PartidaFila } from "@/services/obras.service";
import { soles, decimal, metrado as fmtMetrado } from "@/utils/formato";
import { CeldaEditable } from "@/components/partidas/CeldaEditable";
import {
  accionEditarPartida,
  accionEliminarPartida,
} from "@/app/(dashboard)/obras/[id]/acciones";

interface Props {
  obraId: string;
  filas: PartidaFila[];
  /// false cuando el presupuesto esta congelado o el rol no permite editar.
  editable: boolean;
}

const ETIQUETA_MODALIDAD: Record<PartidaFila["modalidad"], string> = {
  PRECIOS_UNITARIOS: "Precios unitarios",
  SUMA_ALZADA: "Suma alzada",
  ALCANCE: "Alcance",
};

/** Con presupuestos grandes se abre contraido: 400 filas de golpe no se leen. */
const UMBRAL_CONTRAER = 60;

export function TablaPartidas({ obraId, filas, editable }: Props) {
  const router = useRouter();
  const [pendiente, iniciarTransicion] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [listo, setListo] = useState(false);

  const clave = `gcm:capitulos-colapsados:${obraId}`;

  /**
   * Restaura que capitulos dejo abiertos el usuario.
   *
   * Se hace en un efecto y no en el estado inicial porque `localStorage` no
   * existe durante el renderizado en servidor: leerlo ahi romperia la
   * hidratacion. Es la excepcion legitima a "no llamar a setState en un
   * efecto", y por eso se silencia la regla aqui y solo aqui.
   */
  useEffect(() => {
    const guardado = localStorage.getItem(clave);

    if (guardado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setColapsados(new Set(JSON.parse(guardado) as string[]));
    } else if (filas.length > UMBRAL_CONTRAER) {
      setColapsados(new Set(filas.filter((f) => f.nivel === 0).map((f) => f.id)));
    }

    setListo(true);
    // Solo al montar: despues manda el estado del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (listo) localStorage.setItem(clave, JSON.stringify([...colapsados]));
  }, [colapsados, clave, listo]);

  /**
   * Filas visibles y quien tiene hijos.
   *
   * La lista viene plana y en orden de documento, asi que las descendientes
   * de una fila son las siguientes con nivel mayor, hasta encontrar una de
   * nivel igual o menor. Se resuelve en una pasada.
   */
  const { visibles, conHijos } = useMemo(() => {
    const visibles = new Set<string>();
    const conHijos = new Set<string>();
    let ocultarBajoNivel: number | null = null;

    for (const [i, f] of filas.entries()) {
      const siguiente = filas[i + 1];
      if (siguiente && siguiente.nivel > f.nivel) conHijos.add(f.id);

      if (ocultarBajoNivel !== null && f.nivel > ocultarBajoNivel) continue;

      ocultarBajoNivel = null;
      visibles.add(f.id);
      if (colapsados.has(f.id)) ocultarBajoNivel = f.nivel;
    }

    return { visibles, conHijos };
  }, [filas, colapsados]);

  function alternar(id: string) {
    setColapsados((previo) => {
      const copia = new Set(previo);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function guardar(partidaId: string, campos: Record<string, string | null>) {
    setError(null);
    iniciarTransicion(async () => {
      const r = await accionEditarPartida(obraId, partidaId, campos);
      if (!r.ok) setError(r.error ?? "No se pudo guardar.");
      else router.refresh();
    });
  }

  function eliminar(f: PartidaFila) {
    if (!confirm(`Eliminar "${f.codigoPartida} ${f.descripcion.slice(0, 60)}"?`)) {
      return;
    }
    setError(null);
    iniciarTransicion(async () => {
      const r = await accionEliminarPartida(obraId, f.id);
      if (!r.ok) setError(r.error ?? "No se pudo eliminar.");
      else router.refresh();
    });
  }

  const capitulos = filas.filter((f) => conHijos.has(f.id));
  const todosColapsados = capitulos.every((f) => colapsados.has(f.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setColapsados(
                todosColapsados ? new Set() : new Set(capitulos.map((f) => f.id)),
              )
            }
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            {todosColapsados ? "Expandir todo" : "Contraer todo"}
          </button>

          {pendiente && (
            <span className="flex items-center gap-1.5 text-sm opacity-70" role="status">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Guardando...
            </span>
          )}
        </div>

        {editable && (
          <p className="text-xs opacity-60">
            Pulsa cualquier celda para corregirla. Enter guarda, Escape descarta.
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {/* El desbordamiento se contiene aqui: en movil la tabla se desplaza en
          horizontal sin arrastrar el ancho de toda la pagina. */}
      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">
            Presupuesto por partidas, agrupado en capitulos
          </caption>
          <thead>
            <tr
              className="text-left text-xs uppercase"
              style={{
                backgroundColor: "color-mix(in oklab, var(--borde) 40%, transparent)",
              }}
            >
              <th scope="col" className="px-3 py-2.5 font-medium">Codigo</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Descripcion</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Modalidad</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Und.</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Metrado</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">P. Unitario</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Parcial</th>
              {editable && <th scope="col" className="px-2 py-2.5"><span className="sr-only">Acciones</span></th>}
            </tr>
          </thead>
          <tbody>
            {filas.filter((f) => visibles.has(f.id)).map((f) => {
              const esCapitulo = f.tipo === "CAPITULO";
              const agrupa = conHijos.has(f.id);
              const contraido = colapsados.has(f.id);
              // En suma alzada el metrado es referencial y el importe esta
              // cerrado: recalcularlo alteraria un precio ya pactado.
              const parcialCalculado = f.modalidad === "PRECIOS_UNITARIOS";

              return (
                <tr
                  key={f.id}
                  className="border-t align-top"
                  style={{
                    borderColor: "var(--borde)",
                    backgroundColor: esCapitulo
                      ? "color-mix(in oklab, var(--color-marca-500) 7%, transparent)"
                      : undefined,
                  }}
                >
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      {agrupa ? (
                        <button
                          type="button"
                          onClick={() => alternar(f.id)}
                          aria-expanded={!contraido}
                          aria-label={`${contraido ? "Expandir" : "Contraer"} ${f.codigoPartida}`}
                          className="rounded p-0.5 hover:bg-[color-mix(in_oklab,var(--borde)_60%,transparent)]"
                        >
                          {contraido ? (
                            <ChevronRight className="size-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        <span className="inline-block size-[1.125rem]" />
                      )}
                      {f.codigoPartida}
                    </span>
                  </td>

                  <td
                    className={esCapitulo ? "px-3 py-2 font-semibold" : "px-3 py-2"}
                    style={{ paddingLeft: `${0.75 + f.nivel * 0.9}rem` }}
                  >
                    <CeldaEditable
                      etiqueta={`descripcion de ${f.codigoPartida}`}
                      valor={f.descripcion}
                      mostrar={f.descripcion}
                      editable={editable}
                      multilinea
                      onGuardar={(v) => guardar(f.id, { descripcion: v })}
                    />
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">
                    {esCapitulo ? (
                      <span className="opacity-40">&mdash;</span>
                    ) : editable ? (
                      <select
                        value={f.modalidad}
                        aria-label={`Modalidad de ${f.codigoPartida}`}
                        onChange={(e) => guardar(f.id, { modalidad: e.target.value })}
                        className="rounded border px-1.5 py-0.5 text-xs"
                        style={{
                          borderColor: "var(--borde)",
                          backgroundColor: "var(--fondo)",
                        }}
                      >
                        {Object.entries(ETIQUETA_MODALIDAD).map(([valor, texto]) => (
                          <option key={valor} value={valor}>
                            {texto}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs opacity-70">
                        {ETIQUETA_MODALIDAD[f.modalidad]}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2 whitespace-nowrap">
                    {esCapitulo ? null : (
                      <CeldaEditable
                        etiqueta={`unidad de ${f.codigoPartida}`}
                        valor={f.unidad ?? ""}
                        mostrar={f.unidad ?? ""}
                        editable={editable}
                        onGuardar={(v) => guardar(f.id, { unidad: v })}
                      />
                    )}
                  </td>

                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {esCapitulo ? null : (
                      <CeldaEditable
                        etiqueta={`metrado de ${f.codigoPartida}`}
                        valor={f.metrado ?? ""}
                        mostrar={f.metrado ? fmtMetrado(f.metrado, "") : ""}
                        editable={editable}
                        alineadoDerecha
                        onGuardar={(v) => guardar(f.id, { metrado: v })}
                      />
                    )}
                  </td>

                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                    {esCapitulo ? null : (
                      <CeldaEditable
                        etiqueta={`precio unitario de ${f.codigoPartida}`}
                        valor={f.precioUnitario ?? ""}
                        mostrar={f.precioUnitario ? decimal(f.precioUnitario, "") : ""}
                        editable={editable}
                        alineadoDerecha
                        onGuardar={(v) => guardar(f.id, { precioUnitario: v })}
                      />
                    )}
                  </td>

                  <td
                    className={`px-3 py-2 tabular-nums whitespace-nowrap ${esCapitulo ? "font-semibold" : ""}`}
                  >
                    {esCapitulo ? (
                      <span className="block text-right">
                        {f.parcial ? soles(f.parcial, "") : ""}
                      </span>
                    ) : (
                      <CeldaEditable
                        etiqueta={`importe de ${f.codigoPartida}`}
                        valor={f.parcial ?? ""}
                        mostrar={f.parcial ? soles(f.parcial, "") : ""}
                        // En precios unitarios el importe es el resultado de
                        // metrado x precio: se edita cambiando esos dos, no
                        // el resultado, o quedaria incoherente con ellos.
                        editable={editable && !parcialCalculado}
                        alineadoDerecha
                        onGuardar={(v) => guardar(f.id, { parcial: v })}
                      />
                    )}
                  </td>

                  {editable && (
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => eliminar(f)}
                        aria-label={`Eliminar ${f.codigoPartida}`}
                        className="rounded p-1 opacity-50 hover:opacity-100"
                        style={{ color: "var(--color-peligro)" }}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
