"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  valor: string;
  /// Lo que se muestra cuando la celda no esta en edicion.
  mostrar: string;
  onGuardar: (nuevo: string) => void;
  editable: boolean;
  alineadoDerecha?: boolean;
  multilinea?: boolean;
  etiqueta: string;
}

/**
 * Celda que se convierte en campo al pulsarla.
 *
 * Se edita en el sitio en lugar de abrir un formulario porque el caso de uso
 * dominante es corregir un dato que se acaba de ver mal en la tabla. Obligar
 * a abrir una ventana para cambiar un metrado convierte una correccion de
 * tres segundos en una tarea.
 *
 * Guarda al salir del campo o con Enter; Escape descarta.
 */
export function CeldaEditable({
  valor,
  mostrar,
  onGuardar,
  editable,
  alineadoDerecha,
  multilinea,
  etiqueta,
}: Props) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);
  const campo = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editando) {
      campo.current?.focus();
      campo.current?.select();
    }
  }, [editando]);

  /**
   * Si el valor cambia por fuera (otra edicion, una recarga), se refleja.
   *
   * Se ajusta durante el renderizado y no en un efecto: es el patron que
   * recomienda React para sincronizar estado con una propiedad, y evita el
   * renderizado extra que provocaria hacerlo despues de pintar.
   */
  const [valorPrevio, setValorPrevio] = useState(valor);
  if (valor !== valorPrevio && !editando) {
    setValorPrevio(valor);
    setBorrador(valor);
  }

  function confirmar() {
    setEditando(false);
    if (borrador !== valor) onGuardar(borrador);
  }

  function cancelar() {
    setBorrador(valor);
    setEditando(false);
  }

  if (!editable) {
    return (
      <span className={alineadoDerecha ? "block text-right" : undefined}>
        {mostrar}
      </span>
    );
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        aria-label={`Editar ${etiqueta}`}
        className={`w-full rounded px-1 py-0.5 text-left hover:bg-[color-mix(in_oklab,var(--color-marca-500)_12%,transparent)] ${
          alineadoDerecha ? "text-right" : ""
        }`}
      >
        {mostrar || <span className="opacity-40">&mdash;</span>}
      </button>
    );
  }

  const comun = {
    ref: campo as never,
    value: borrador,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setBorrador(e.target.value),
    onBlur: confirmar,
    "aria-label": etiqueta,
    className: `w-full rounded border px-1 py-0.5 outline-none ${
      alineadoDerecha ? "text-right" : ""
    }`,
    style: {
      borderColor: "var(--color-marca-500)",
      backgroundColor: "var(--fondo)",
    },
  };

  if (multilinea) {
    return (
      <textarea
        {...comun}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancelar();
        }}
      />
    );
  }

  return (
    <input
      {...comun}
      onKeyDown={(e) => {
        if (e.key === "Enter") confirmar();
        if (e.key === "Escape") cancelar();
      }}
    />
  );
}
