"use client";

import { useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

/**
 * La franja de barras del pie de cada tarjeta de obra.
 *
 * Solo se dibuja lo que el sistema puede afirmar HOY:
 *
 *   - **Calendario**: dias transcurridos sobre el plazo. Es tiempo, no avance.
 *   - **Comprometido**: lo pactado con proveedores sobre el presupuesto, sin
 *     IGV y solo de ordenes aprobadas.
 *
 * El **avance fisico** sale del cronograma, ponderado por la duracion de cada
 * tarea. Mientras la obra no tenga cronograma cargado, su barra sigue vacia y
 * rotulada como pendiente: pintarla con un numero inventado seria peor que no
 * pintarla, porque las tres se leen juntas y una falsa contamina la lectura.
 */

export interface AlertaObra {
  clave: string;
  texto: string;
  detalle?: string;
}

export interface AvanceFisicoObra {
  real: number;
  planeado: number;
  /// Fecha del corte del que sale la cifra, ya formateada.
  corte: string;
}

interface Props {
  calendario: number;
  comprometido: number;
  /// Para el detalle del globo: las cifras en texto ya formateado.
  etiquetaComprometido: string;
  /// Del cronograma. Ausente mientras la obra no tenga ninguno cargado.
  avanceFisico?: AvanceFisicoObra;
  alertas: AlertaObra[];
}

export function FranjaObra({
  calendario,
  comprometido,
  etiquetaComprometido,
  avanceFisico,
  alertas,
}: Props) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="relative mt-3 space-y-2">
      <Barra
        etiqueta="Calendario"
        valor={calendario}
        detalle={`${Math.round(calendario)}%`}
        color="var(--color-marca-500)"
      />

      <Barra
        etiqueta="Comprometido"
        valor={comprometido}
        detalle={etiquetaComprometido}
        // En rojo cuando se pasa del presupuesto: es la lectura que hay que
        // ver sin tener que comparar dos numeros.
        color={
          comprometido > 100 ? "var(--color-peligro)" : "var(--color-exito)"
        }
      />

      <div className="flex items-center justify-between gap-2">
        {avanceFisico ? (
          <div className="min-w-0 flex-1">
            <Barra
              etiqueta="Avance físico"
              valor={avanceFisico.real}
              detalle={`${avanceFisico.real.toFixed(1)}% de ${avanceFisico.planeado.toFixed(1)}%`}
              // Verde solo si llega a lo previsto. Es la misma lectura que en
              // la tabla del cronograma: la barra alcanza la marca o no.
              color={
                avanceFisico.real + 0.001 >= avanceFisico.planeado
                  ? "var(--color-exito)"
                  : "var(--color-alerta)"
              }
              // La marca del plan sobre la propia barra: sin ella, un 40% se
              // lee como "va bien" sin saber que tocaba el 70%.
              marca={avanceFisico.planeado}
            />
          </div>
        ) : (
          <BarraPendiente />
        )}

        {alertas.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              // La tarjeta entera es un enlace a la obra: sin esto, abrir el
              // globo navegaria.
              e.preventDefault();
              e.stopPropagation();
              setAbierto((previo) => !previo);
            }}
            aria-expanded={abierto}
            aria-label={`Ver ${alertas.length} alerta(s) de esta obra`}
            // El latido solo va aqui, donde de verdad hay algo que corregir.
            // Si latiera en todas las tarjetas dejaria de llamar la atencion.
            className="latido inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-peligro) 20%, transparent)",
            }}
          >
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {alertas.length}
          </button>
        )}
      </div>

      {abierto && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute right-0 bottom-full z-10 mb-2 w-72 rounded-xl border p-3 shadow-lg"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold">Requiere atención</h4>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setAbierto(false);
              }}
              aria-label="Cerrar"
              className="rounded p-0.5 opacity-60 hover:opacity-100"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <ul className="mt-2 space-y-2">
            {alertas.map((a) => (
              <li key={a.clave} className="flex items-start gap-2 text-xs">
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  style={{ color: "var(--color-peligro)" }}
                  aria-hidden="true"
                />
                <span>
                  <span className="font-medium">{a.texto}</span>
                  {a.detalle && (
                    <span className="block opacity-70">{a.detalle}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {/* De donde sale el avance, o por que todavia no hay. Dicho
              explicitamente para que nadie lea la ausencia de avisos como
              "todo va bien". */}
          <p className="mt-3 flex items-start gap-1.5 border-t pt-2 text-xs opacity-60"
            style={{ borderColor: "var(--borde)" }}>
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span>
              {avanceFisico
                ? `Avance físico del corte del ${avanceFisico.corte}, ponderado por la duración de cada tarea.`
                : "Sin datos aún de avance físico: llegan al cargar el cronograma de la obra."}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function Barra({
  etiqueta,
  valor,
  detalle,
  color,
  marca,
}: {
  etiqueta: string;
  valor: number;
  detalle: string;
  color: string;
  /// Referencia a alcanzar, dibujada como una linea fina sobre la barra.
  marca?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs opacity-70">
        <span>{etiqueta}</span>
        <span className="tabular-nums">{detalle}</span>
      </div>
      <div
        className="relative mt-1 h-1.5 overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--borde)" }}
        role="progressbar"
        aria-valuenow={Math.round(Math.min(valor, 100))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta}
      >
        <div
          className="h-full rounded-full"
          style={{
            // Se acota al 100 % para que la barra no se salga; que se ha
            // pasado ya lo dice el color y la cifra de al lado.
            width: `${Math.min(valor, 100)}%`,
            backgroundColor: color,
          }}
        />
        {marca !== undefined && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5"
            style={{
              left: `calc(${Math.min(Math.max(marca, 0), 100)}% - 1px)`,
              backgroundColor: "var(--texto)",
              opacity: 0.7,
            }}
          />
        )}
      </div>
    </div>
  );
}

/** El hueco del avance fisico: sin dato, y dicho. */
function BarraPendiente() {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between text-xs opacity-45">
        <span>Avance físico</span>
        <span>pendiente</span>
      </div>
      <div
        className="mt-1 h-1.5 rounded-full"
        style={{
          backgroundColor: "var(--borde)",
          opacity: 0.5,
        }}
      />
    </div>
  );
}
