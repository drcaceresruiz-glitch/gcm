"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, HardHat, LoaderCircle } from "lucide-react";
import {
  accionCrearObra,
  type EstadoObra,
} from "@/app/(dashboard)/obras/nueva/acciones";
import { fechaDeObra } from "@/lib/obras";
import { CampoTexto } from "@/components/auth/CampoTexto";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import {
  ChecklistRequisitos,
  todosCumplidos,
  type Requisito,
} from "@/components/ui/ChecklistRequisitos";

/**
 * Alta de una obra.
 *
 * Solo el nombre y las dos fechas son obligatorios: una obra se abre en
 * cuanto se sabe cuando empieza y cuando deberia acabar, y el resto —codigo,
 * cliente, ubicacion— se conoce a veces mas tarde.
 *
 * Al lado va un semaforo de requisitos que se actualiza mientras se escribe y
 * gobierna el boton de crear. Los tres campos que vigila estan controlados por
 * estado; los demas siguen sueltos, porque no condicionan el alta.
 */

const ESTADOS = [
  { valor: "PLANIFICACION", etiqueta: "Planificacion" },
  { valor: "EN_EJECUCION", etiqueta: "En ejecucion" },
  { valor: "PARALIZADA", etiqueta: "Paralizada" },
  { valor: "CERRADA", etiqueta: "Cerrada" },
] as const;

export function FormularioObra({
  fechaHoy,
  ayuda,
}: {
  fechaHoy: string;
  ayuda?: ReactNode;
}) {
  const [estado, accion] = useActionState<EstadoObra, FormData>(
    accionCrearObra,
    {},
  );

  const [nombre, setNombre] = useState("");
  const [inicio, setInicio] = useState(fechaHoy);
  const [fin, setFin] = useState("");

  // Los mismos criterios que valida el servidor con `validarObra`, evaluados
  // aqui campo a campo con las funciones puras para que el semaforo no diga
  // verde donde el servidor diria que no.
  const fInicio = fechaDeObra(inicio);
  const fFin = fechaDeObra(fin);
  const requisitos: Requisito[] = [
    { etiqueta: "Nombre de la obra", cumplido: nombre.trim().length > 0 },
    { etiqueta: "Fecha de inicio valida", cumplido: fInicio !== null },
    { etiqueta: "Fecha de fin valida", cumplido: fFin !== null },
    {
      etiqueta: "El fin no es anterior al inicio",
      cumplido: fInicio !== null && fFin !== null && fFin >= fInicio,
    },
  ];
  const listo = todosCumplidos(requisitos);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <form action={accion}>
        <Tarjeta>
          <SeccionTarjeta titulo="Identificacion" primera>
            <CampoTexto
              id="nombreObra"
              name="nombreObra"
              etiqueta="Nombre de la obra"
              required
              maxLength={255}
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <CampoTexto
              id="codigoObra"
              name="codigoObra"
              etiqueta="Codigo"
              maxLength={40}
              ayuda="Opcional, pero no se puede repetir dentro de la empresa. El sistema le asigna ademas un correlativo propio (OB-000001)."
            />
            <CampoTexto id="cliente" name="cliente" etiqueta="Cliente" maxLength={200} />
            <CampoTexto id="ubicacion" name="ubicacion" etiqueta="Ubicacion" maxLength={255} />
          </SeccionTarjeta>

          <SeccionTarjeta
            titulo="Plazo"
            nota="De aqui sale el avance de calendario que se ve en el panel."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                id="fechaInicio"
                name="fechaInicio"
                etiqueta="Fecha de inicio"
                type="date"
                required
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
              <CampoTexto
                id="fechaFinProgramada"
                name="fechaFinProgramada"
                etiqueta="Fecha de fin programada"
                type="date"
                required
                value={fin}
                onChange={(e) => setFin(e.target.value)}
              />
            </div>
          </SeccionTarjeta>

          <SeccionTarjeta titulo="Estado">
            <div className="space-y-1.5">
              <label htmlFor="estado" className="block text-sm font-medium">
                Estado inicial
              </label>
              <select
                id="estado"
                name="estado"
                defaultValue="PLANIFICACION"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              >
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
              <p className="text-xs opacity-60">
                Lo normal es abrirla en planificacion y pasarla a ejecucion
                cuando arranque.
              </p>
            </div>
          </SeccionTarjeta>

          {estado.error && (
            <p
              role="alert"
              className="mt-6 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
              }}
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{estado.error}</span>
            </p>
          )}

          <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--borde)" }}>
            <BotonCrear bloqueado={!listo} />
          </div>
        </Tarjeta>
      </form>

      {/* Columna derecha: el semaforo arriba —lo que gobierna el boton— y la
          ayuda debajo. `sticky` para que el semaforo siga a la vista al
          desplazarse por un formulario largo. */}
      <div className="space-y-6 lg:sticky lg:top-24">
        <ChecklistRequisitos requisitos={requisitos} titulo="Para crear la obra" />
        {ayuda}
      </div>
    </div>
  );
}

function BotonCrear({ bloqueado }: { bloqueado: boolean }) {
  const { pending } = useFormStatus();
  const inhabilitado = bloqueado || pending;

  return (
    <div className="space-y-2">
      <button
        type="submit"
        disabled={inhabilitado}
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca-600)" }}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <HardHat className="size-4" aria-hidden="true" />
        )}
        {pending ? "Creando..." : "Crear la obra"}
      </button>
      <p className="text-xs opacity-60">
        {bloqueado
          ? "Completa los requisitos de la derecha para habilitar la creacion."
          : "Al crearla se abre vacia: el paso siguiente es cargarle el presupuesto."}
      </p>
    </div>
  );
}
