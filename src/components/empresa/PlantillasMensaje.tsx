"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import type { PlantillaEnPantalla } from "@/services/plantillas-mensaje.service";
import {
  accionGuardarPlantilla,
  accionRetirarPlantilla,
} from "@/app/(dashboard)/empresa/configuracion/acciones-plantillas";

/**
 * Los mensajes que la constructora repite semana tras semana.
 *
 * NO SE PROGRAMA NINGUN ENVIO aqui: esto guarda texto, y al escribirle a un
 * contratista se copia al formulario **y sigue siendo editable**. Lo que se
 * manda es lo que la persona ve antes de pulsar.
 *
 * Nace vacia y GCM no trae ninguna escrita: las palabras con las que una
 * empresa habla con sus contratistas son suyas.
 */
export function PlantillasMensaje({
  plantillas,
}: {
  plantillas: PlantillaEnPantalla[];
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function abrir(p?: PlantillaEnPantalla) {
    setError(null);
    setEditando(p?.id ?? "nueva");
    setNombre(p?.nombre ?? "");
    setAsunto(p?.asunto ?? "");
    setCuerpo(p?.cuerpo ?? "");
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const r = await accionGuardarPlantilla({
        ...(editando && editando !== "nueva" ? { id: editando } : {}),
        nombre,
        asunto,
        cuerpo,
      });
      if (r.ok) setEditando(null);
      else setError(r.error);
    });
  }

  function retirar(id: string) {
    setError(null);
    iniciar(async () => {
      const r = await accionRetirarPlantilla(id);
      if (!r.ok) setError(r.error);
    });
  }

  const campo = "mt-1 w-full rounded-lg border px-2.5 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--borde)",
    backgroundColor: "var(--fondo)",
  };

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Mensajes que repites a los contratistas"
        nota="El recordatorio de valorización, el aviso de que mañana no hay agua, el que pide el SCTR. Se guardan aquí y al escribir se copian al formulario, donde los puedes cambiar antes de enviar."
      >
        <ul className="space-y-2">
          {plantillas.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <div className="min-w-0">
                <p className="font-medium">{p.nombre}</p>
                {p.asunto && (
                  <p className="text-xs opacity-70">Asunto: {p.asunto}</p>
                )}
                <p className="mt-1 line-clamp-2 text-xs opacity-70 text-pretty">
                  {p.cuerpo}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => abrir(p)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{ borderColor: "var(--borde)" }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => retirar(p.id)}
                  disabled={pendiente}
                  aria-label={`Retirar ${p.nombre}`}
                  className="rounded-lg border px-2.5 py-1.5 text-xs"
                  style={{
                    borderColor:
                      "color-mix(in oklab, var(--color-peligro) 40%, transparent)",
                    color: "var(--color-peligro)",
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {plantillas.length === 0 && !editando && (
          <p className="text-sm opacity-70 text-pretty">
            Todavía no tienes ninguna. Cuando escribas el mismo aviso por
            segunda vez, guárdalo aquí.
          </p>
        )}

        {editando ? (
          <div
            className="mt-3 space-y-3 rounded-lg border p-3"
            style={{ borderColor: "var(--borde)" }}
          >
            <label className="block text-xs">
              <span className="opacity-70">Nombre (para reconocerla)</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={100}
                placeholder="Recordatorio de valorización"
                className={campo}
                style={estiloCampo}
              />
            </label>

            <label className="block text-xs">
              <span className="opacity-70">
                Asunto <span className="opacity-60">(solo para correo)</span>
              </span>
              <input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                maxLength={200}
                className={campo}
                style={estiloCampo}
              />
            </label>

            <label className="block text-xs">
              <span className="opacity-70">Mensaje</span>
              <textarea
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                maxLength={5000}
                rows={4}
                className={campo}
                style={estiloCampo}
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={guardar}
                disabled={pendiente || !nombre.trim() || !cuerpo.trim()}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--color-marca-600)" }}
              >
                {pendiente && (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                )}
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="text-sm opacity-70 underline"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => abrir()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva plantilla
          </button>
        )}

        {error && (
          <p className="mt-2 text-sm" style={{ color: "var(--color-peligro)" }}>
            {error}
          </p>
        )}
      </SeccionTarjeta>
    </Tarjeta>
  );
}
