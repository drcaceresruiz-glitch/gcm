"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Handshake,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import {
  accionAnadirLineaMeta,
  accionEditarLineaMeta,
  accionEliminarLineaMeta,
  accionMoverLineaMeta,
  type EstadoLinea,
} from "@/app/(dashboard)/obras/[id]/meta/acciones-lineas";
import type { LineaDeLaMeta } from "@/services/meta-edicion.service";
import { soles } from "@/utils/formato";
import { codigoPadre, subtotalesPorAncestro } from "@/lib/jerarquia-partidas";
import {
  bloquesDeContratista,
  cotizadoDelBloque,
  esNeutro,
} from "@/lib/cascada-contratista";
import { AjusteDelContratista } from "@/components/meta/AjusteDelContratista";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * El borrador de la meta, corregible linea a linea.
 *
 * Hasta ahora la meta solo entraba por Excel: un precio mal tecleado obligaba
 * a rehacer la plantilla y volver a subirla, perdiendo por el camino los
 * recargos ya ajustados. Aqui se corrige lo que sea sin salir de la pantalla.
 *
 * Se edita UNA fila a la vez, y a proposito. Una tabla entera de campos
 * abiertos invita a tocar diez cosas y guardar sin releer ninguna, y esto es
 * el costo de la obra. Abrir una fila obliga a mirar esa fila.
 *
 * El importe no se teclea cuando hay metrado y precio: lo calcula el
 * servidor, con la misma regla que la formula del Excel.
 */
export function TablaMetaEditable({
  obraId,
  version,
  lineas,
  puedeEditar,
}: {
  obraId: string;
  version: number;
  lineas: readonly LineaDeLaMeta[];
  puedeEditar: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);

  /*
   * Lo que suma cada capitulo. Mismo criterio que el costo directo -manda
   * `subtotalesPorAncestro`- para que la cifra de la cabecera y el total del
   * pie no puedan contradecirse.
   *
   * Las lineas SIN codigo son costos propios de la meta: no cuelgan de ningun
   * capitulo y por eso no entran en ningun subtotal, aunque si cuenten en el
   * total de la meta. Es correcto: no pertenecen al arbol del contrato.
   */
  /*
   * Que partidas cubre cada contratista y cuanto sumaban en su cotizacion.
   *
   * La regla vive en `bloquesDeContratista` y NO se copia aqui: el servicio
   * usa la misma al guardar, y dos copias acabarian discrepando el dia que
   * alguien afine una sola.
   */
  const bloques = useMemo(() => {
    const conCodigo = lineas
      .filter((l) => l.codigoRef !== null)
      .map((l) => ({
        codigo: l.codigoRef!,
        tipo: l.tipo,
        parcial: l.parcial,
        parcialCotizado: l.parcialCotizado,
        ajuste: {
          descuento: l.descuentoContratista,
          gastosGenerales: l.ggContratista,
          utilidad: l.utilidadContratista,
        },
      }));
    const codigos = new Set(conCodigo.map((l) => l.codigo));
    const mapa = bloquesDeContratista(conCodigo, (c) => codigoPadre(c, codigos));

    const cotizado = new Map<string, string>();
    for (const [jefe, partidas] of mapa) {
      cotizado.set(jefe, cotizadoDelBloque(conCodigo, partidas));
    }
    return cotizado;
  }, [lineas]);

  /**
   * Lo que sumaria el bloque de un capitulo que TODAVIA no tiene porcentajes.
   *
   * Hace falta para poder abrir el formulario la primera vez: sin ajuste no
   * hay bloque, y sin bloque no habria cifra que ensenar mientras se teclea.
   * Se toman todas sus partidas, que es lo que pasaria a ser su bloque.
   */
  const cotizadoSinAjuste = useMemo(() => {
    const conCodigo = lineas.filter((l) => l.codigoRef !== null);
    const codigos = new Set(conCodigo.map((l) => l.codigoRef!));
    return (codigo: string): string => {
      const suyas = conCodigo.filter((l) => {
        if (l.tipo !== "PARTIDA") return false;
        let padre = codigoPadre(l.codigoRef!, codigos);
        while (padre) {
          if (padre === codigo) return true;
          padre = codigoPadre(padre, codigos);
        }
        return false;
      });
      return cotizadoDelBloque(
        suyas.map((l) => ({
          codigo: l.codigoRef!,
          tipo: l.tipo,
          parcial: l.parcial,
          parcialCotizado: l.parcialCotizado,
          ajuste: { descuento: null, gastosGenerales: null, utilidad: null },
        })),
        suyas.map((l) => l.codigoRef!),
      );
    };
  }, [lineas]);

  const subtotales = useMemo(
    () =>
      subtotalesPorAncestro(
        lineas
          .filter((l) => l.codigoRef !== null)
          .map((l) => ({
            codigo: l.codigoRef!,
            parcial: l.tipo === "PARTIDA" ? l.parcial : null,
          })),
      ),
    [lineas],
  );

  /*
   * En una obra que no admite cambios no se ofrece: `editarLineaMeta` lo
   * rechaza, y un boton que siempre falla invita a probar. El motivo se
   * explica una vez por pantalla, no en cada control.
   * Mismas opciones que el servidor: sin excepciones.
   * Va DESPUES del ultimo hook: un `return` por delante de una llamada a
   * un hook cambia el orden entre renders y React lo prohibe.
   */
  const sinEscritura = useMotivoSinEscritura() !== null;
  if (sinEscritura) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Líneas del borrador v{version}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
            {puedeEditar
              ? "Corrige aquí lo que haga falta: no hay que volver al Excel ni perder los recargos ya ajustados. Al aprobar la meta, esto queda congelado."
              : "Solo lectura: no tienes permiso para cambiar el presupuesto meta."}
          </p>
        </div>

        {puedeEditar && !anadiendo && (
          <button
            type="button"
            onClick={() => setAnadiendo(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Añadir una partida
          </button>
        )}
      </div>

      {anadiendo && (
        <FormularioLinea
          obraId={obraId}
          modo="anadir"
          alTerminar={() => setAnadiendo(false)}
        />
      )}

      {/*
        COMO SE USA ESTA TABLA, escrito donde se usa.
        Va en la pantalla y no solo en el manual: quien acaba de subir un Excel
        con 400 lineas y ve cuatro flechas nuevas no va a abrir el manual, va a
        pulsar. Es un `details` para que no estorbe a quien ya lo sabe.
      */}
      {puedeEditar && (
        <details
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          <summary className="cursor-pointer font-medium">
            Cómo ordenar y completar el presupuesto
          </summary>

          <div className="mt-3 space-y-3 text-pretty opacity-80">
            <p>
              Cada línea es un <strong>capítulo</strong> (un título que agrupa)
              o una <strong>partida</strong> (lo que se mide y se cobra). No se
              elige: <strong>es capítulo lo que tiene algo dentro</strong>. Si
              metes una partida debajo de otra, la de arriba pasa a ser capítulo
              sola —y pierde su importe, porque un capítulo vale la suma de lo
              que tiene dentro—.
            </p>

            <div>
              <p className="font-medium">Las cuatro flechas de cada fila</p>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li>
                  <strong>↑ y ↓</strong> mueven la línea entre sus hermanas, sin
                  cambiar de quién cuelga. Se lleva consigo todo lo que tenga
                  dentro.
                </li>
                <li>
                  <strong>→</strong> la mete dentro de la línea de arriba. Es lo
                  que se usa cuando el Excel traía «PRIMER PISO» y debajo, al
                  mismo nivel, los bloques que en realidad cuelgan de él.
                </li>
                <li>
                  <strong>←</strong> la saca un nivel hacia fuera.
                </li>
              </ul>
            </div>

            <p>
              <strong>Los códigos se renumeran solos</strong> después de cada
              movimiento: 1, 1.01, 1.01.01, 2… No hace falta teclearlos ni
              cuadrarlos a mano, y por eso no se pueden editar.
            </p>

            <p>
              <strong>Para completar precios</strong>, pulsa el lápiz de la
              línea y escribe la unidad, la cantidad y el precio unitario. El
              importe lo calcula GCM multiplicando. Solo se teclea a mano cuando
              la partida va a suma alzada, sin cantidad.
            </p>

            <p>
              <strong>Al borrar un capítulo</strong> no se borra lo que tiene
              dentro: sus partidas suben un nivel y se renumera todo.
            </p>

            <p className="opacity-80">
              Todo esto es sobre el <strong>borrador</strong>. Cuando apruebas
              la meta queda congelada y ya no se toca: para cambiarla se carga
              una versión nueva.
            </p>
          </div>
        </details>
      )}

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs uppercase opacity-60"
              style={{ borderBottom: "1px solid var(--borde)" }}
            >
              <th className="p-2">Código</th>
              <th className="p-2">Descripción</th>
              <th className="p-2">Und.</th>
              <th className="p-2 text-right">Metrado</th>
              <th className="p-2 text-right">P. unitario</th>
              <th className="p-2 text-right">Importe</th>
              {puedeEditar && <th className="p-2" />}
            </tr>
          </thead>

          <tbody>
            {lineas.map((l) =>
              editando === l.id ? (
                <tr key={l.id}>
                  <td colSpan={puedeEditar ? 7 : 6} className="p-0">
                    <FormularioLinea
                      obraId={obraId}
                      modo="editar"
                      linea={l}
                      alTerminar={() => setEditando(null)}
                    />
                  </td>
                </tr>
              ) : ajustando === l.id ? (
                <tr key={l.id}>
                  <td colSpan={puedeEditar ? 7 : 6} className="p-0">
                    <AjusteDelContratista
                      obraId={obraId}
                      lineaId={l.id}
                      capitulo={`${l.codigoRef ?? ""} ${l.descripcion}`.trim()}
                      cotizado={
                        bloques.get(l.codigoRef ?? "") ??
                        cotizadoSinAjuste(l.codigoRef ?? "")
                      }
                      descuento={l.descuentoContratista ?? ""}
                      gastosGenerales={l.ggContratista ?? ""}
                      utilidad={l.utilidadContratista ?? ""}
                      alTerminar={() => setAjustando(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr
                  key={l.id}
                  style={{
                    borderTop: "1px solid var(--borde)",
                    backgroundColor:
                      l.tipo === "CAPITULO" ? "var(--superficie)" : undefined,
                    fontWeight: l.tipo === "CAPITULO" ? 600 : undefined,
                  }}
                >
                  <td className="p-2 tabular-nums">
                    {l.codigoRef ?? (
                      // Sin codigo es un costo propio de la meta: no va al
                      // contrato ni al cronograma, y conviene que se vea.
                      <span className="text-xs opacity-60">propio</span>
                    )}
                  </td>
                  <td className="p-2">{l.descripcion}</td>
                  <td className="p-2">{l.unidad ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">{l.metrado ?? ""}</td>
                  <td className="p-2 text-right tabular-nums">
                    {l.precioUnitario ?? ""}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {l.tipo === "CAPITULO"
                      ? subtotales.has(l.codigoRef ?? "")
                        ? soles(subtotales.get(l.codigoRef ?? "")!)
                        : ""
                      : l.parcial
                        ? soles(l.parcial)
                        : ""}
                  </td>
                  {puedeEditar && (
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* Mover solo tiene sentido en el arbol. Una linea
                            propia de la meta no cuelga de ningun capitulo, asi
                            que no hay adonde moverla. */}
                        {l.codigoRef !== null && (
                          <Mover obraId={obraId} linea={l} />
                        )}
                        {/* Lo que cobra el contratista se pone en la fila que
                            agrupa: en una partida suelta no hay bloque que
                            ajustar, y el servicio lo rechaza igual. */}
                        {l.tipo === "CAPITULO" && l.codigoRef !== null && (
                          <button
                            type="button"
                            onClick={() => setAjustando(l.id)}
                            className="rounded p-1 opacity-70 hover:opacity-100"
                            aria-label={`Lo que cobra el contratista de ${l.descripcion}`}
                            title="Lo que cobra el contratista"
                          >
                            <Handshake
                              className="size-4"
                              aria-hidden="true"
                              style={
                                esNeutro({
                                  descuento: l.descuentoContratista,
                                  gastosGenerales: l.ggContratista,
                                  utilidad: l.utilidadContratista,
                                })
                                  ? undefined
                                  : { color: "var(--color-marca-600)" }
                              }
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditando(l.id)}
                          className="rounded p-1 opacity-70 hover:opacity-100"
                          aria-label={`Corregir ${l.descripcion}`}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </button>
                        <BotonEliminar obraId={obraId} linea={l} />
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Campo({
  nombre,
  etiqueta,
  valor,
  ancho,
  requerido,
}: {
  nombre: string;
  etiqueta: string;
  valor?: string | null;
  ancho: string;
  requerido?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="opacity-70">{etiqueta}</span>
      <input
        type="text"
        name={nombre}
        defaultValue={valor ?? ""}
        required={requerido}
        inputMode={nombre === "descripcion" || nombre === "unidad" || nombre === "codigoRef" ? "text" : "decimal"}
        className={`mt-1 ${ancho} rounded-lg border px-2 py-1.5 text-sm`}
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      />
    </label>
  );
}

function FormularioLinea({
  obraId,
  modo,
  linea,
  alTerminar,
}: {
  obraId: string;
  modo: "editar" | "anadir";
  linea?: LineaDeLaMeta;
  alTerminar: () => void;
}) {
  const [estado, accion] = useActionState<EstadoLinea, FormData>(
    modo === "editar" ? accionEditarLineaMeta : accionAnadirLineaMeta,
    {},
  );

  // Se cierra SOLO si guardo. Cerrar siempre -que es lo que hacia al
  // principio- se lleva por delante el mensaje de error justo cuando hace
  // falta leerlo.
  useEffect(() => {
    if (estado.ok) alTerminar();
  }, [estado.ok, alTerminar]);

  return (
    <form
      action={accion}
      className="space-y-3 p-3"
      style={{ backgroundColor: "var(--superficie)" }}
    >
      <input type="hidden" name="obraId" value={obraId} />
      {linea && <input type="hidden" name="lineaId" value={linea.id} />}

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {estado.error}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {modo === "anadir" && (
          <Campo
            nombre="codigoRef"
            etiqueta="Código (vacío = costo propio)"
            ancho="w-40"
          />
        )}
        {modo === "editar" && linea?.codigoRef && (
          <p className="text-xs opacity-70">
            Código <strong>{linea.codigoRef}</strong>
            <span className="block opacity-70">
              no se cambia: es la referencia contra el contrato
            </span>
          </p>
        )}

        <Campo
          nombre="descripcion"
          etiqueta="Descripción"
          valor={linea?.descripcion}
          ancho="w-72"
          requerido
        />
        <Campo nombre="unidad" etiqueta="Und." valor={linea?.unidad} ancho="w-20" />
        <Campo nombre="metrado" etiqueta="Metrado" valor={linea?.metrado} ancho="w-28" />
        <Campo
          nombre="precioUnitario"
          etiqueta="P. unitario"
          valor={linea?.precioUnitario}
          ancho="w-32"
        />
        {/* El importe solo se teclea en una suma alzada: con metrado y precio
            lo calcula el servidor, y escribirlo aqui no serviria de nada. */}
        <Campo
          nombre="parcial"
          etiqueta="Importe (solo si no hay metrado)"
          valor={linea?.metrado && linea?.precioUnitario ? "" : linea?.parcial}
          ancho="w-36"
        />
      </div>

      <div className="flex items-center gap-3">
        <BotonGuardar />
        <button
          type="button"
          onClick={alTerminar}
          className="inline-flex items-center gap-1.5 text-sm font-medium underline opacity-70"
        >
          <X className="size-3.5" aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </form>
  );
}

function BotonGuardar() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Check className="size-4" aria-hidden="true" />
      )}
      Guardar
    </button>
  );
}

/**
 * Quitar una linea.
 *
 * Pide confirmacion en dos pasos y no con un `confirm()` del navegador: el
 * mismo patron de revelar que ya usan paralizar y arrancar, para que el gesto
 * sea deliberado sin sacar al usuario de la pagina.
 */
function BotonEliminar({
  obraId,
  linea,
}: {
  obraId: string;
  linea: LineaDeLaMeta;
}) {
  const [estado, accion] = useActionState<EstadoLinea, FormData>(
    accionEliminarLineaMeta,
    {},
  );
  const [seguro, setSeguro] = useState(false);


  if (!seguro) {
    return (
      <button
        type="button"
        onClick={() => setSeguro(true)}
        className="rounded p-1 opacity-70 hover:opacity-100"
        aria-label={`Quitar ${linea.descripcion}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={accion} className="flex items-center gap-2">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="lineaId" value={linea.id} />
      {estado.error && (
        <span role="alert" className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </span>
      )}
      <button
        type="submit"
        className="rounded px-2 py-1 text-xs font-medium text-white"
        style={{ backgroundColor: "var(--color-peligro)" }}
      >
        Quitar
      </button>
      <button
        type="button"
        onClick={() => setSeguro(false)}
        className="text-xs underline opacity-70"
      >
        No
      </button>
    </form>
  );
}


/**
 * Las cuatro flechas que colocan una linea en el arbol.
 *
 * VAN JUNTAS Y EN ESTE ORDEN —subir, bajar, meter dentro, sacar— porque es el
 * orden en que se usan: primero se pone la linea donde va y despues se decide
 * de quien cuelga.
 *
 * El movimiento se hace con el arbol ENTERO en el servidor, no aqui: mover en
 * la pantalla y guardar despues obligaria a llevar dos copias del presupuesto
 * y a decidir cual manda cuando alguien recarga a medias.
 *
 * Si el movimiento no cabe —la primera de un bloque no se puede subir— el
 * servidor devuelve el motivo y se enseña ahi mismo, en vez de dejar el boton
 * sin hacer nada, que es como se aprende a desconfiar de una pantalla.
 */
function Mover({ obraId, linea }: { obraId: string; linea: LineaDeLaMeta }) {
  const [estado, accion] = useActionState<EstadoLinea, FormData>(
    accionMoverLineaMeta,
    {},
  );

  const flechas = [
    { direccion: "subir", Icono: ChevronUp, texto: "Subir" },
    { direccion: "bajar", Icono: ChevronDown, texto: "Bajar" },
    { direccion: "sangrar", Icono: ChevronRight, texto: "Meter dentro de la de arriba" },
    { direccion: "quitar-sangria", Icono: ChevronLeft, texto: "Sacar un nivel" },
  ] as const;

  return (
    <form action={accion} className="flex items-center gap-0.5">
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="lineaId" value={linea.id} />

      {(estado.error || estado.aviso) && (
        <span
          role="alert"
          className="mr-1 max-w-56 text-xs text-pretty"
          style={{
            color: estado.error ? "var(--color-peligro)" : undefined,
            opacity: estado.error ? 1 : 0.7,
          }}
        >
          {estado.error ?? estado.aviso}
        </span>
      )}

      {flechas.map(({ direccion, Icono, texto }) => (
        <button
          key={direccion}
          type="submit"
          name="direccion"
          value={direccion}
          className="rounded p-1 opacity-60 hover:opacity-100"
          title={`${texto} — ${linea.descripcion.slice(0, 40)}`}
          aria-label={`${texto}: ${linea.descripcion.slice(0, 40)}`}
        >
          <Icono className="size-4" aria-hidden="true" />
        </button>
      ))}
    </form>
  );
}