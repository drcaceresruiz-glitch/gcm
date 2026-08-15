"use client";

import { useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, Plus } from "lucide-react";

import { accionCrearPartida } from "@/app/(dashboard)/obras/[id]/acciones";

/**
 * Anadir un capitulo o una partida a mano.
 *
 * Esta pieza faltaba ENTERA: el servicio `crearPartida` estaba escrito,
 * validado y auditado desde hace tiempo, y ningun componente lo llamaba. El
 * unico camino para empezar un presupuesto era importar un Excel, asi que el
 * permiso `partida:crear` no se podia ejercer desde ninguna pantalla.
 *
 * SE ELIGE capitulo o partida, no se deduce. La deduccion —sin cifras,
 * capitulo— es razonable al importar, donde las filas vienen completas, pero
 * al teclear se escriben primero las descripciones y los precios despues, y
 * asi todas nacerian capitulo sin vuelta atras.
 */

type Tipo = "CAPITULO" | "PARTIDA";

const VACIO = {
  codigoPartida: "",
  descripcion: "",
  unidad: "",
  metrado: "",
  precioUnitario: "",
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
        className="w-full rounded border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />
      {ayuda && <span className="mt-0.5 block opacity-60">{ayuda}</span>}
    </label>
  );
}

export function NuevaFila({
  obraId,
  /// Codigo que se propone al abrir. Sale de la ultima fila para no obligar a
  /// recordar por donde iba la numeracion.
  codigoSugerido,
}: {
  obraId: string;
  codigoSugerido: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("PARTIDA");
  const [campos, setCampos] = useState({ ...VACIO, codigoPartida: codigoSugerido });
  const [error, setError] = useState<string | null>(null);
  const [guardando, guardar] = useTransition();

  function enviar() {
    setError(null);

    guardar(async () => {
      const r = await accionCrearPartida(obraId, {
        codigoPartida: campos.codigoPartida,
        descripcion: campos.descripcion,
        tipo,
        // Un capitulo no lleva cifras: se mandan en null aunque hubieran
        // quedado escritas de antes de cambiar el tipo.
        unidad: tipo === "CAPITULO" ? null : campos.unidad || null,
        metrado: tipo === "CAPITULO" ? null : campos.metrado || null,
        precioUnitario:
          tipo === "CAPITULO" ? null : campos.precioUnitario || null,
      });

      if (!r.ok) {
        setError(r.error ?? "No se pudo crear.");
        return;
      }

      // Se queda ABIERTO y con el tipo elegido: teclear un presupuesto son
      // decenas de filas seguidas, y cerrar el formulario en cada una
      // obligaria a volver a abrirlo y a volver a elegir.
      setCampos({ ...VACIO });
      setError(null);
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
        style={{ borderColor: "var(--borde)" }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Añadir capítulo o partida
      </button>
    );
  }

  const esCapitulo = tipo === "CAPITULO";

  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">Añadir al presupuesto</legend>

        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Qué añadir">
          {(["CAPITULO", "PARTIDA"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              onClick={() => setTipo(t)}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{
                borderColor: tipo === t ? "var(--color-marca)" : "var(--borde)",
                backgroundColor:
                  tipo === t
                    ? "color-mix(in oklab, var(--color-marca) 12%, transparent)"
                    : undefined,
                fontWeight: tipo === t ? 600 : 400,
              }}
            >
              {t === "CAPITULO" ? "Capítulo" : "Partida"}
            </button>
          ))}
        </div>

        <p className="mt-2 text-xs text-pretty opacity-70">
          {esCapitulo
            ? "Un capítulo agrupa y no lleva cifras: su importe es la suma de las partidas que cuelgan de él. Códigos como 1.0, 2.0 o 01."
            : "Una partida sí lleva importe. Puedes dejar el metrado y el precio en blanco ahora y rellenarlos después pulsando su celda en la tabla."}
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          <Campo
            etiqueta="Código"
            ancho="w-28"
            value={campos.codigoPartida}
            onChange={(e) => setCampos({ ...campos, codigoPartida: e.target.value })}
            placeholder={esCapitulo ? "2.0" : "2.1"}
            ayuda="El punto marca el nivel"
          />
          <Campo
            etiqueta="Descripción"
            ancho="min-w-56 flex-1"
            value={campos.descripcion}
            onChange={(e) => setCampos({ ...campos, descripcion: e.target.value })}
            placeholder={esCapitulo ? "ESTRUCTURAS" : "Concreto f'c=210 en columnas"}
          />

          {/* En un capitulo estos tres campos no se pintan en vez de pintarse
              deshabilitados: un campo apagado invita a preguntarse como se
              enciende, y aqui la respuesta es que no se enciende nunca. */}
          {!esCapitulo && (
            <>
              <Campo
                etiqueta="Unidad"
                ancho="w-24"
                value={campos.unidad}
                onChange={(e) => setCampos({ ...campos, unidad: e.target.value })}
                placeholder="m3"
              />
              <Campo
                etiqueta="Metrado"
                ancho="w-28"
                inputMode="decimal"
                value={campos.metrado}
                onChange={(e) => setCampos({ ...campos, metrado: e.target.value })}
                placeholder="12.5"
              />
              <Campo
                etiqueta="Precio unitario"
                ancho="w-32"
                inputMode="decimal"
                value={campos.precioUnitario}
                onChange={(e) =>
                  setCampos({ ...campos, precioUnitario: e.target.value })
                }
                placeholder="385.00"
              />
            </>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={enviar}
            disabled={guardando || campos.descripcion.trim() === ""}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-marca)" }}
          >
            {guardando ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            Añadir {esCapitulo ? "capítulo" : "partida"}
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
