"use client";

import { useMemo, useState } from "react";
import { Camera, ChevronDown, ChevronRight, Search } from "lucide-react";
import {
  PanelEvidencia,
  type AccionSubirEvidencia,
} from "@/components/evidencia/PanelEvidencia";
import type { FotoResumen } from "@/services/evidencia.service";

/**
 * El menu al que lleva el codigo QR de la obra: "donde cargo la foto".
 *
 * Un codigo por obra en vez de uno por restriccion. La cuenta es simple: 20
 * tareas x 7 flujos son 140 stickers que nadie pega ni mantiene. Un unico
 * codigo en la caseta, y el telefono hace el trabajo de ir bajando.
 *
 * Esto NO es la matriz del Lookahead con otra ropa. Alli mandan las siete
 * columnas y la vista de conjunto; aqui manda una sola pregunta —donde va esta
 * foto— y todo lo demas estorba: se entra buscando, los objetivos son grandes
 * para un dedo con guante, y cada restriccion dice si ya esta resuelta y
 * cuantas fotos tiene.
 *
 * Lo usan DOS pantallas con puertas distintas: la de la obra (usuario con
 * sesion) y la del pase (personal de campo que no es usuario de GCM). Por eso
 * no recibe `LookaheadDatos` —que arrastra permisos, semanas del PTS y
 * confiabilidad, cosas que un pase ni tiene ni debe ver— sino lo minimo que
 * necesita para pintar. Ensanchar esta interfaz para "aprovechar" un dato que
 * ya venia es como se le acaban colando al pase cosas de usuario.
 */

/// Una restriccion, tal como la ve este menu.
export interface CeldaMenu {
  /// null = ese flujo no aplica a la tarea: no hay a que colgar la foto.
  id: string | null;
  tipo: string;
  resuelta: boolean;
  fotos: FotoResumen[];
}

export interface FilaMenu {
  uid: number;
  codigo: string | null;
  nombre: string;
  /// Alguien decidio que flujos le aplican. Las que nadie ha mirado no llegan
  /// hasta aqui.
  analizada: boolean;
  /// Puede venir VACIO: la tarea se reviso y no le aplica ningun flujo.
  restricciones: CeldaMenu[];
}

export interface DatosMenuEvidencia {
  filas: FilaMenu[];
  /// Cuantas semanas mira la ventana, para poder decirlo cuando esta vacia.
  semanas: number;
  /// Ver y adjuntar son cosas distintas: un consultor mira.
  puedeSubir: boolean;
}

export function MenuEvidencia({
  obraId,
  datos,
  etiquetaFlujo,
  accion,
}: {
  obraId: string;
  datos: DatosMenuEvidencia;
  /// Nombre legible de cada flujo, resuelto por quien llama para no volver a
  /// importar la tabla de flujos aqui.
  etiquetaFlujo: Record<string, string>;
  /// Por donde sube la foto: la puerta de sesion o la del pase.
  accion: AccionSubirEvidencia;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [tareaAbierta, setTareaAbierta] = useState<number | null>(null);
  const [evidenciaEn, setEvidenciaEn] = useState<string | null>(null);

  // Solo lo analizado: una tarea que nadie ha mirado no tiene restricciones a
  // las que colgar la foto, y ofrecerla seria un callejon sin salida.
  //
  // Las analizadas SIN restricciones si se listan, aunque tampoco admitan
  // foto: si desaparecieran, quien esta en obra veria faltar una tarea que
  // sabe que existe y pensaria que la aplicacion esta rota. Se listan, y se
  // dice por que no tienen donde adjuntar.
  const tareas = useMemo(
    () => datos.filas.filter((f) => f.analizada),
    [datos.filas],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return tareas;
    return tareas.filter((f) =>
      `${f.codigo ?? ""} ${f.nombre}`.toLowerCase().includes(q),
    );
  }, [tareas, busqueda]);

  if (tareas.length === 0) {
    return (
      <p className="text-sm opacity-70">
        No hay tareas analizadas en las próximas {datos.semanas} semanas.
        Alguien con acceso al Lookahead tiene que decir{" "}
        <strong>qué restricciones le aplican</strong> a cada tarea antes de que
        se pueda adjuntar evidencia aquí: la foto siempre cuelga de una
        restricción.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-50"
          aria-hidden="true"
        />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar el frente de trabajo"
          aria-label="Buscar el frente de trabajo"
          className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-base"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        />
      </label>

      {filtradas.length === 0 ? (
        <p className="text-sm opacity-70">
          Ninguna tarea coincide con «{busqueda}».
        </p>
      ) : (
        <ul className="space-y-2">
          {filtradas.map((fila) => {
            const abierta = tareaAbierta === fila.uid;
            const resueltas = fila.restricciones.filter((r) => r.resuelta).length;
            const fotos = fila.restricciones.reduce(
              (n, r) => n + r.fotos.length,
              0,
            );

            return (
              <li
                key={fila.uid}
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--borde)" }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setTareaAbierta(abierta ? null : fila.uid);
                    setEvidenciaEn(null);
                  }}
                  aria-expanded={abierta}
                  // 56px de alto: se acierta con el dedo, con guantes y con la
                  // pantalla mojada.
                  className="flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {fila.codigo ? `${fila.codigo} ` : ""}
                      {fila.nombre}
                    </span>
                    <span className="block text-xs opacity-70">
                      {fila.restricciones.length === 0
                        ? "Sin restricciones: nada que documentar"
                        : `${resueltas}/${fila.restricciones.length} restricciones resueltas`}
                      {fotos > 0 && ` · ${fotos} foto(s)`}
                    </span>
                  </span>
                  {abierta ? (
                    <ChevronDown className="size-5 shrink-0 opacity-60" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden="true" />
                  )}
                </button>

                {abierta && fila.restricciones.length === 0 && (
                  <p
                    className="border-t px-3 py-3 text-sm opacity-70"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    Esta tarea se revisó y no le aplica ninguna restricción, así
                    que no hay dónde colgar la foto. La evidencia demuestra que
                    una restricción quedó levantada; si hace falta documentar
                    algo de este frente, pide que le añadan el flujo que
                    corresponda.
                  </p>
                )}

                {abierta && fila.restricciones.length > 0 && (
                  <ul className="border-t" style={{ borderColor: "var(--borde)" }}>
                    {fila.restricciones.map((c) => {
                      if (!c.id) return null;
                      const nombre = etiquetaFlujo[c.tipo] ?? c.tipo;
                      const seleccionada = evidenciaEn === c.id;

                      return (
                        <li
                          key={c.tipo}
                          className="border-b last:border-b-0"
                          style={{ borderColor: "var(--borde)" }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setEvidenciaEn(seleccionada ? null : c.id)
                            }
                            aria-expanded={seleccionada}
                            className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                            style={{
                              backgroundColor: seleccionada
                                ? "color-mix(in oklab, var(--color-marca-500) 10%, transparent)"
                                : undefined,
                            }}
                          >
                            <Camera
                              className="size-5 shrink-0 opacity-70"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 text-sm">
                              {nombre}
                              {/* Que este resuelta no impide adjuntar: la foto
                                  es justo lo que demuestra que se libero. */}
                              <span className="block text-xs opacity-60">
                                {c.resuelta ? "Resuelta" : "Pendiente"}
                                {c.fotos.length > 0 &&
                                  ` · ${c.fotos.length} foto(s)`}
                              </span>
                            </span>
                          </button>

                          {seleccionada && (
                            <div className="px-3 pb-3">
                              <PanelEvidencia
                                obraId={obraId}
                                destino={{ restriccionId: c.id }}
                                titulo={`${nombre} · ${fila.codigo ? `${fila.codigo} ` : ""}${fila.nombre}`}
                                fotos={c.fotos}
                                puedeSubir={datos.puedeSubir}
                                accion={accion}
                                onCerrar={() => setEvidenciaEn(null)}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
