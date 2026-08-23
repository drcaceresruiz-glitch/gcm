"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, HardHat, LoaderCircle, Save } from "lucide-react";
import { type EstadoObra } from "@/app/(dashboard)/obras/nueva/acciones";
import { fechaDeObra } from "@/lib/obras";
import { CampoTexto } from "@/components/auth/CampoTexto";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import {
  ChecklistRequisitos,
  todosCumplidos,
  type Requisito,
} from "@/components/ui/ChecklistRequisitos";

/**
 * Alta y edicion de una obra.
 *
 * Un mismo formulario para crear y para editar: recibe la `accion` de servidor
 * (crear, o editar ya ligada al id de la obra) y los `valores` iniciales. Asi
 * no se duplican los campos, la validacion en vivo ni el semaforo de
 * requisitos —lo que garantiza que crear y editar apliquen las MISMAS reglas—.
 *
 * Solo el nombre y las dos fechas son obligatorios; el resto —codigo, cliente,
 * ubicacion— es opcional. El `estado` solo aparece al crear: una vez creada,
 * el estado cambia por sus botones de transicion (iniciar, paralizar, cerrar),
 * que respetan la maquina de estados; editarlo aqui a mano la saltaria.
 */

const ESTADOS = [
  { valor: "PLANIFICACION", etiqueta: "Planificación" },
  { valor: "EN_EJECUCION", etiqueta: "En ejecución" },
  { valor: "PARALIZADA", etiqueta: "Paralizada" },
  { valor: "CERRADA", etiqueta: "Cerrada" },
] as const;

export interface ValoresObra {
  nombreObra: string;
  codigoObra: string;
  cliente: string;
  ubicacion: string;
  fechaInicio: string;
  fechaFinProgramada: string;
}

export function FormularioObra({
  accion,
  modo = "crear",
  valores,
  fechaHoy,
  conMeta = false,
  ayuda,
}: {
  /// Accion de servidor: `accionCrearObra`, o `accionEditarObra` ya ligada al id.
  accion: (previo: EstadoObra, datos: FormData) => Promise<EstadoObra>;
  modo?: "crear" | "editar";
  valores?: Partial<ValoresObra>;
  /// Solo para crear: fecha por defecto del campo de inicio.
  fechaHoy?: string;
  /**
   * Si se ofrece adjuntar el Excel del presupuesto meta al crear la obra.
   *
   * Lo decide la pagina segun `meta:crear`: quien no puede cargar un
   * presupuesto no debe ver un campo que va a fallar al enviarlo. El servicio
   * lo comprueba igual -es la frontera de verdad-, pero un campo que siempre
   * responde «no tienes permiso» enseña a ignorar los avisos.
   */
  conMeta?: boolean;
  ayuda?: ReactNode;
}) {
  const editar = modo === "editar";
  const [estado, accionForm] = useActionState<EstadoObra, FormData>(accion, {});

  const [nombre, setNombre] = useState(valores?.nombreObra ?? "");
  const [inicio, setInicio] = useState(
    valores?.fechaInicio ?? fechaHoy ?? "",
  );
  const [fin, setFin] = useState(valores?.fechaFinProgramada ?? "");

  // Los mismos criterios que valida el servidor con `validarObra`, evaluados
  // aqui campo a campo con las funciones puras para que el semaforo no diga
  // verde donde el servidor diria que no.
  const fInicio = fechaDeObra(inicio);
  const fFin = fechaDeObra(fin);
  const requisitos: Requisito[] = [
    { etiqueta: "Nombre de la obra", cumplido: nombre.trim().length > 0 },
    { etiqueta: "Fecha de inicio válida", cumplido: fInicio !== null },
    { etiqueta: "Fecha de fin válida", cumplido: fFin !== null },
    {
      etiqueta: "El fin no es anterior al inicio",
      cumplido: fInicio !== null && fFin !== null && fFin >= fInicio,
    },
  ];
  const listo = todosCumplidos(requisitos);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <form action={accionForm}>
        <Tarjeta>
          <SeccionTarjeta titulo="Identificación" primera>
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
              etiqueta="Código"
              maxLength={40}
              defaultValue={valores?.codigoObra ?? ""}
              ayuda="Opcional, pero no se puede repetir dentro de la empresa. El sistema le asigna además un correlativo propio (OB-000001)."
            />
            <CampoTexto
              id="cliente"
              name="cliente"
              etiqueta="Cliente"
              maxLength={200}
              defaultValue={valores?.cliente ?? ""}
            />
            <CampoTexto
              id="ubicacion"
              name="ubicacion"
              etiqueta="Ubicación"
              maxLength={255}
              defaultValue={valores?.ubicacion ?? ""}
            />
          </SeccionTarjeta>

          <SeccionTarjeta
            titulo="Plazo"
            nota="De aquí salen los días restantes y el avance de calendario del panel."
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

          {/* El estado solo se elige al crear. Ya creada, cambia por sus
              botones de transicion, que respetan la maquina de estados. */}
          {!editar && (
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
                  Lo normal es abrirla en planificación y pasarla a ejecución
                  cuando arranque.
                </p>
              </div>
            </SeccionTarjeta>
          )}

          {/*
            EL PRESUPUESTO, DE UNA VEZ.
            Antes: crear la obra, salir, entrar en Meta y subir el Excel. Los
            campos de la obra se quedan donde estan -aqui se validan en vivo,
            que es lo que una celda de Excel no puede hacer-; lo que se ahorra
            es el viaje. Es opcional: quien todavia no tiene el presupuesto
            crea la obra igual y lo carga despues.
          */}
          {!editar && conMeta && (
            <SeccionTarjeta titulo="Presupuesto meta (opcional)">
              <div className="space-y-3">
                <p className="text-sm opacity-70">
                  Si ya tienes el Excel, adjúntalo y la obra nace con su
                  presupuesto cargado. Si no, créala y lo subes cuando lo
                  tengas.
                </p>

                <div className="space-y-1.5">
                  <label htmlFor="archivo" className="block text-sm font-medium">
                    Archivo de la plantilla
                  </label>
                  <input
                    id="archivo"
                    name="archivo"
                    type="file"
                    accept=".xlsx,.xlsm,.xls"
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--borde)",
                      backgroundColor: "var(--fondo)",
                    }}
                  />
                  <p className="text-xs opacity-60">
                    Descárgala en{" "}
                    <a href="/plantilla-meta" className="underline underline-offset-2">
                      plantilla del presupuesto meta
                    </a>
                    . El plazo en meses sale de las fechas de arriba.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="modo" className="block text-sm font-medium">
                    Con qué detalle se compara con el contractual
                  </label>
                  <select
                    id="modo"
                    name="modo"
                    defaultValue="CAPITULO"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                    style={{
                      borderColor: "var(--borde)",
                      backgroundColor: "var(--fondo)",
                    }}
                  >
                    <option value="CAPITULO">Por capítulo</option>
                    <option value="PARTIDA">Por partida</option>
                    <option value="FRENTE">Por frente</option>
                  </select>
                  <p className="text-xs opacity-60">
                    Por capítulo es lo habitual. Solo cambia el nivel al que se
                    lee la bolsa; se puede recargar la meta después con otro.
                  </p>
                </div>
              </div>
            </SeccionTarjeta>
          )}

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
            <BotonGuardar bloqueado={!listo} editar={editar} />
          </div>
        </Tarjeta>
      </form>

      {/* Columna derecha: el semaforo arriba —lo que gobierna el boton— y la
          ayuda debajo. `sticky` para que el semaforo siga a la vista al
          desplazarse por un formulario largo. */}
      <div className="space-y-6 lg:sticky lg:top-24">
        <ChecklistRequisitos
          requisitos={requisitos}
          titulo={editar ? "Para guardar la obra" : "Para crear la obra"}
        />
        {ayuda}
      </div>
    </div>
  );
}

function BotonGuardar({
  bloqueado,
  editar,
}: {
  bloqueado: boolean;
  editar: boolean;
}) {
  const { pending } = useFormStatus();
  const inhabilitado = bloqueado || pending;

  const Icono = editar ? Save : HardHat;
  const textoAccion = editar ? "Guardar cambios" : "Crear la obra";
  const textoPendiente = editar ? "Guardando..." : "Creando...";

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
          <Icono className="size-4" aria-hidden="true" />
        )}
        {pending ? textoPendiente : textoAccion}
      </button>
      <p className="text-xs opacity-60">
        {bloqueado
          ? "Completa los requisitos de la derecha para habilitar el guardado."
          : editar
            ? "Los cambios se aplican al panel y a la obra al guardar."
            : "Al crearla se abre vacía: el paso siguiente es cargarle el presupuesto."}
      </p>
    </div>
  );
}
