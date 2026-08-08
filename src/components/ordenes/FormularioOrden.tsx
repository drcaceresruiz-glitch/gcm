"use client";

import { Fragment, useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  Check,
  LayoutList,
  LoaderCircle,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  accionCrearOrden,
  type EstadoOrden,
} from "@/app/(dashboard)/obras/[id]/ordenes/acciones";
import {
  calcularCascadaOrden,
  descuadreDelReparto,
  sumarLineas,
} from "@/lib/ordenes";
import { porcentajeAFraccion } from "@/lib/presupuesto";
import { esNegativo, esPositivo, multiplicar, sumar } from "@/lib/decimal";
import { soles } from "@/utils/formato";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * Alta de una orden de compra o de servicio.
 *
 * Dos cosas se recalculan mientras se escribe, y ninguna es adorno.
 *
 * La CASCADA, porque el neto —no el total— es lo que consume presupuesto, y
 * quien teclea una orden tiene delante el papel con el total. Verlos a la vez
 * evita el error de repartir la cifra del banco.
 *
 * El REPARTO, porque tiene que sumar exactamente el neto. Descubrirlo al
 * guardar obligaria a recomponer los importes a ciegas.
 *
 * Se calculan con las mismas funciones que usa el servidor, asi que la vista
 * previa no puede discrepar de lo que se guarda.
 */

export interface OpcionImputacion {
  wbsItemId: string;
  codigoPartida: string;
  descripcion: string;
  /// Vigente de la partida, o su parcial si la obra no tiene linea base.
  referencia: string;
  capitulo: string;
}

interface OpcionProveedor {
  id: string;
  razonSocial: string;
  ruc: string;
}

interface LineaEstado {
  clave: number;
  esAgrupador: boolean;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precioUnitario: string;
  importe: string;
}

interface ImputacionEstado {
  clave: number;
  wbsItemId: string;
  importe: string;
}

const lineaVacia = (clave: number): LineaEstado => ({
  clave,
  esAgrupador: false,
  descripcion: "",
  cantidad: "",
  unidad: "",
  precioUnitario: "",
  importe: "",
});

const imputacionVacia = (clave: number): ImputacionEstado => ({
  clave,
  wbsItemId: "",
  importe: "",
});

export interface OpcionFormaPago {
  id: string;
  nombre: string;
  texto: string;
}

interface Props {
  obraId: string;
  fechaHoy: string;
  proveedores: OpcionProveedor[];
  partidas: OpcionImputacion[];
  formasPago: OpcionFormaPago[];
  /// Partidas habituales de cada proveedor en esta obra, por id de proveedor.
  habituales: Record<string, string[]>;
}

export function FormularioOrden({
  obraId,
  fechaHoy,
  proveedores,
  partidas,
  formasPago,
  habituales,
}: Props) {
  const [estado, accion] = useActionState<EstadoOrden, FormData>(
    accionCrearOrden,
    {},
  );

  const [proveedorId, setProveedorId] = useState("");

  /**
   * La forma de pago se copia de la plantilla pero queda EDITABLE, asi que es
   * un campo controlado y no un `defaultValue`: lo pactado con un proveedor
   * concreto casi siempre tiene un matiz que la plantilla no recoge.
   */
  const [formaPago, setFormaPago] = useState("");

  /**
   * Con detalle o solo cabecera.
   *
   * Las 16 ordenes historicas se cargan por cabecera: para el comprometido
   * hacen falta los importes, no las especificaciones de cada difusor. Las
   * nuevas se teclean con su detalle.
   */
  const [conDetalle, setConDetalle] = useState(false);
  const [subtotalManual, setSubtotalManual] = useState("");
  const [descuento, setDescuento] = useState("");
  const [igv, setIgv] = useState("18");

  const [lineas, setLineas] = useState<LineaEstado[]>([lineaVacia(0)]);
  const [imputaciones, setImputaciones] = useState<ImputacionEstado[]>([
    imputacionVacia(0),
  ]);
  const clave = useRef(1);

  // --- Lo que se recalcula al escribir ------------------------------------
  const subtotal = conDetalle
    ? sumarLineas(
        lineas.map((l) => ({ esAgrupador: l.esAgrupador, importe: l.importe })),
      )
    : sumar([subtotalManual || "0"]);

  const cascada = calcularCascadaOrden({
    subtotal,
    descuentoComercial: descuento || "0",
    porcentajeIgv: porcentajeAFraccion(igv) ?? "0",
  });

  const repartido = sumar(imputaciones.map((i) => i.importe));
  const descuadre = descuadreDelReparto(
    cascada.neto,
    imputaciones.map((i) => i.importe),
  );

  const carga = {
    lineas: conDetalle
      ? lineas.map((l) => ({
          esAgrupador: l.esAgrupador,
          descripcion: l.descripcion.trim(),
          cantidad: l.cantidad.trim() || undefined,
          unidad: l.unidad.trim() || undefined,
          precioUnitario: l.precioUnitario.trim() || undefined,
          importe: l.importe.trim(),
        }))
      : [],
    imputaciones: imputaciones.map((i) => ({
      wbsItemId: i.wbsItemId,
      importe: i.importe.trim(),
    })),
  };

  /**
   * Cambia una linea y, si toco la cantidad o el precio, recalcula el
   * importe.
   *
   * En las tres ordenes reales el importe es siempre cantidad x precio: 6 x
   * 1,254.56 = 7,527.36 en CABREJO, 4 x 4,729.57 = 18,918.28 en SIV AIRE.
   * Teclearlo a mano ademas de los otros dos es trabajo de sobra y una
   * ocasion de equivocarse.
   *
   * El importe SIGUE siendo editable: hay lineas globales que traen su total
   * sin desglose, y las agrupadoras no tienen cantidad ni precio. Solo se
   * recalcula al tocar los factores, nunca al escribir en el importe.
   */
  function cambiarLinea(clave: number, cambios: Partial<LineaEstado>) {
    const recalcula =
      cambios.cantidad !== undefined || cambios.precioUnitario !== undefined;

    setLineas((previas) =>
      previas.map((l) => {
        if (l.clave !== clave) return l;

        const linea = { ...l, ...cambios };
        if (!recalcula) return linea;

        const producto =
          linea.cantidad.trim() && linea.precioUnitario.trim()
            ? multiplicar(linea.cantidad.trim(), linea.precioUnitario.trim(), 2)
            : null;

        return producto === null ? linea : { ...linea, importe: producto };
      }),
    );
  }

  /**
   * Al elegir proveedor, se cargan sus partidas habituales en el reparto.
   *
   * Solo si el reparto esta VACIO: si ya se escribio algo, cambiar de
   * proveedor no puede barrer el trabajo hecho. Y los importes se dejan en
   * blanco a proposito: la partida se repite de una orden a otra, la cifra
   * nunca.
   */
  function elegirProveedor(id: string) {
    setProveedorId(id);

    const suyas = habituales[id] ?? [];
    const vacio = imputaciones.every((i) => !i.wbsItemId && !i.importe.trim());
    if (suyas.length === 0 || !vacio) return;

    setImputaciones(
      suyas.map((wbsItemId) => ({
        clave: clave.current++,
        wbsItemId,
        importe: "",
      })),
    );
  }

  function cambiarImputacion(
    clave: number,
    cambios: Partial<ImputacionEstado>,
  ) {
    setImputaciones((previas) =>
      previas.map((i) => (i.clave === clave ? { ...i, ...cambios } : i)),
    );
  }

  return (
    <form action={accion} className="space-y-8" noValidate>
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="lineas" value={JSON.stringify(carga.lineas)} />
      <input
        type="hidden"
        name="imputaciones"
        value={JSON.stringify(carga.imputaciones)}
      />
      {!conDetalle && (
        <input type="hidden" name="subtotal" value={subtotalManual} />
      )}
      <input type="hidden" name="descuentoComercial" value={descuento} />
      <input type="hidden" name="porcentajeIgv" value={igv} />

      {estado.error && <Aviso mensaje={estado.error} />}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">El documento</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoSelect
            id="proveedorId"
            name="proveedorId"
            etiqueta="Proveedor"
            value={proveedorId}
            onChange={(e) => elegirProveedor(e.target.value)}
            ayuda={
              (habituales[proveedorId]?.length ?? 0) > 0
                ? "Sus partidas habituales se han cargado abajo. Se pueden quitar o anadir otras."
                : undefined
            }
          >
            <option value="">Elige el proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razonSocial} · RUC {p.ruc}
              </option>
            ))}
          </CampoSelect>

          <CampoSelect
            id="tipo"
            name="tipo"
            etiqueta="Tipo"
            defaultValue="SERVICIO"
            ayuda="Las del cliente se titulan todas «orden de servicio», incluso cuando suministran equipos."
          >
            <option value="SERVICIO">Orden de servicio</option>
            <option value="COMPRA">Orden de compra</option>
          </CampoSelect>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <CampoTexto
            id="numero"
            name="numero"
            type="text"
            etiqueta="Numero"
            ayuda="Como en el papel: 2026-07-00113."
          />
          <CampoTexto
            id="fecha"
            name="fecha"
            type="date"
            etiqueta="Fecha"
            defaultValue={fechaHoy}
          />
          <CampoTexto
            id="referencia"
            name="referencia"
            type="text"
            etiqueta="Referencia"
            ayuda="Opcional. La orden del cliente final, si la hay."
          />
        </div>

        <CampoTexto
          id="descripcion"
          name="descripcion"
          type="text"
          etiqueta="Concepto"
          ayuda="Lo que el papel llama «Partida»: «CRIOCORD ESTRUCTURAS METALICAS»."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            {formasPago.length > 0 && (
              <CampoSelect
                id="plantillaFormaPago"
                etiqueta="Forma de pago habitual"
                value=""
                onChange={(e) => {
                  const elegida = formasPago.find((f) => f.id === e.target.value);
                  if (elegida) setFormaPago(elegida.texto);
                }}
                ayuda="Copia una guardada. Despues se puede ajustar."
              >
                <option value="">Elegir una guardada...</option>
                {formasPago.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nombre}
                  </option>
                ))}
              </CampoSelect>
            )}

            <CampoArea
              id="formaPago"
              name="formaPago"
              etiqueta="Forma de pago"
              rows={3}
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value)}
              ayuda="Tal cual viene: «50% adelanto, 40% contra instalacion, 10% contra dossier»."
            />
          </div>
          <CampoArea
            id="observaciones"
            name="observaciones"
            etiqueta="Observaciones"
            rows={3}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Importes</h2>

          <div
            className="inline-flex overflow-hidden rounded-lg border text-sm"
            style={{ borderColor: "var(--borde)" }}
            role="group"
            aria-label="Como se indica el importe"
          >
            <BotonModo activo={!conDetalle} onClick={() => setConDetalle(false)}>
              <Receipt className="size-4" aria-hidden="true" />
              Solo totales
            </BotonModo>
            <BotonModo activo={conDetalle} onClick={() => setConDetalle(true)}>
              <LayoutList className="size-4" aria-hidden="true" />
              Con detalle
            </BotonModo>
          </div>
        </div>

        <p className="text-sm text-pretty opacity-70">
          {conDetalle
            ? "El subtotal sale de las lineas. Marca como agrupadora la linea que solo repite el total de su bloque: si no, ese dinero se cuenta dos veces."
            : "Para las ordenes antiguas basta con el subtotal del papel. El detalle de lineas es opcional."}
        </p>

        {conDetalle ? (
          <Lineas
            lineas={lineas}
            onCambio={cambiarLinea}
            onQuitar={(c) =>
              setLineas((p) => (p.length > 1 ? p.filter((l) => l.clave !== c) : p))
            }
            onAnadir={() =>
              setLineas((p) => [...p, lineaVacia(clave.current++)])
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoTexto
              id="subtotalManual"
              type="text"
              inputMode="decimal"
              etiqueta="Subtotal"
              value={subtotalManual}
              onChange={(e) => setSubtotalManual(e.target.value)}
              ayuda="Antes del descuento y del IGV."
            />
          </div>
        )}
      </section>

      <section
        className="rounded-xl border p-4"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        <h2 className="text-sm font-semibold">Asi queda la orden</h2>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="descuento"
            type="text"
            inputMode="decimal"
            etiqueta="Descuento comercial"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            ayuda="En positivo. Suele usarse para dejar un neto redondo."
          />
          <CampoTexto
            id="igv"
            type="text"
            inputMode="decimal"
            etiqueta="IGV %"
            value={igv}
            onChange={(e) => setIgv(e.target.value)}
          />
        </div>

        <dl className="mt-4 space-y-1 text-sm">
          <Linea etiqueta="Subtotal" valor={soles(cascada.subtotal)} />
          {cascada.descuentoComercial !== "0.00" && (
            <Linea
              etiqueta="Descuento comercial"
              valor={`- ${soles(cascada.descuentoComercial)}`}
            />
          )}
          <Linea
            etiqueta="Neto"
            sufijo="consume presupuesto"
            valor={soles(cascada.neto)}
            destacado
          />
          <Linea etiqueta="IGV" sufijo="credito fiscal" valor={soles(cascada.igv)} />
          <Linea etiqueta="Total" sufijo="sale del banco" valor={soles(cascada.total)} />
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Contra que partidas carga</h2>
          <BotonSecundario
            onClick={() =>
              setImputaciones((p) => [...p, imputacionVacia(clave.current++)])
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            Anadir partida
          </BotonSecundario>
        </div>

        <p className="text-sm text-pretty opacity-70">
          El reparto tiene que sumar el <strong>neto</strong>, no el total: el
          IGV no consume presupuesto. Una orden puede cargar a varias partidas.
        </p>

        <ul className="space-y-3">
          {imputaciones.map((imputacion) => (
            <li key={imputacion.clave}>
              <FilaImputacion
                imputacion={imputacion}
                partidas={partidas}
                puedeQuitar={imputaciones.length > 1}
                onCambio={(cambios) => cambiarImputacion(imputacion.clave, cambios)}
                onQuitar={() =>
                  setImputaciones((p) =>
                    p.filter((i) => i.clave !== imputacion.clave),
                  )
                }
              />
            </li>
          ))}
        </ul>

        <Reparto
          neto={cascada.neto}
          repartido={repartido}
          descuadre={descuadre}
        />

        {/* Se configura usando: al guardar se recuerdan estas partidas para
            este proveedor. Una pantalla de configuracion aparte seria una que
            nadie visitaria. */}
        {proveedorId && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="recordarPartidas"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              Recordar estas partidas para{" "}
              <strong>
                {proveedores.find((p) => p.id === proveedorId)?.razonSocial}
              </strong>{" "}
              en esta obra
              <span className="block text-xs opacity-70">
                La proxima orden suya las traera cargadas. Se anaden a las que
                ya tenga; no sustituyen su lista.
              </span>
            </span>
          </label>
        )}
      </section>

      <div className="space-y-3">
        {/* El mismo error que hay arriba, repetido junto al boton.
            El formulario es largo y quien pulsa guardar esta al final: un
            aviso a tres pantallas de distancia no se ve, y el rechazo parece
            que "no hizo nada". */}
        {estado.error && <Aviso mensaje={estado.error} />}

        <BotonCrear />
        <p className="text-xs text-pretty opacity-60">
          Se guarda como borrador: todavia no compromete presupuesto. Alguien
          con permiso para aprobar tiene que hacerlo, y entonces empieza a
          contar.
        </p>
      </div>
    </form>
  );
}

/**
 * El estado del reparto.
 *
 * Dice cuanto falta y de que lado, no solo que no cuadra: con varias partidas
 * a la vista, «faltan 1,980.00» es accionable, y esa cifra en concreto delata
 * el error mas probable, que es haber repartido el total en vez del neto.
 */
function Reparto({
  neto,
  repartido,
  descuadre,
}: {
  neto: string;
  repartido: string;
  descuadre: string | null;
}) {
  const cuadra = descuadre === null;
  const sobra = descuadre !== null && esPositivo(descuadre);
  const magnitud = descuadre === null ? "0.00" : sobra ? descuadre : descuadre.slice(1);

  return (
    <div
      className="rounded-lg px-4 py-3"
      style={{
        backgroundColor: cuadra
          ? "color-mix(in oklab, var(--color-exito) 15%, transparent)"
          : "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
      }}
    >
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div>
          <dt className="inline opacity-70">Neto de la orden </dt>
          <dd className="inline font-semibold tabular-nums">{soles(neto)}</dd>
        </div>
        <div>
          <dt className="inline opacity-70">Repartido </dt>
          <dd className="inline font-semibold tabular-nums">{soles(repartido)}</dd>
        </div>
      </dl>

      <p className="mt-1.5 flex items-start gap-2 text-sm">
        {cuadra ? (
          <>
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>El reparto cuadra con el neto.</span>
          </>
        ) : (
          <>
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {sobra ? "Se reparten" : "Faltan por repartir"}{" "}
              <strong>{soles(magnitud)}</strong>
              {sobra ? " de mas" : ""}. El reparto tiene que sumar el neto.
            </span>
          </>
        )}
      </p>
    </div>
  );
}

function FilaImputacion({
  imputacion,
  partidas,
  puedeQuitar,
  onCambio,
  onQuitar,
}: {
  imputacion: ImputacionEstado;
  partidas: OpcionImputacion[];
  puedeQuitar: boolean;
  onCambio: (cambios: Partial<ImputacionEstado>) => void;
  onQuitar: () => void;
}) {
  const elegida = partidas.find((p) => p.wbsItemId === imputacion.wbsItemId);

  // Agrupado en orden de documento, como en el formulario de movimientos.
  const grupos: [string, OpcionImputacion[]][] = [];
  for (const p of partidas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo[0] === p.capitulo) ultimo[1].push(p);
    else grupos.push([p.capitulo, [p]]);
  }

  const id = `imputacion-${imputacion.clave}`;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <CampoSelect
          id={`${id}-partida`}
          etiqueta="Partida"
          value={imputacion.wbsItemId}
          onChange={(e) => onCambio({ wbsItemId: e.target.value })}
        >
          <option value="">Elige una partida</option>
          {grupos.map(([capitulo, suyas]) => (
            <optgroup key={capitulo} label={capitulo}>
              {suyas.map((p) => (
                <option key={p.wbsItemId} value={p.wbsItemId}>
                  {p.codigoPartida} · {p.descripcion} · {soles(p.referencia)}
                </option>
              ))}
            </optgroup>
          ))}
        </CampoSelect>

        <div className="flex items-end gap-2">
          <div className="w-40">
            <CampoTexto
              id={`${id}-importe`}
              type="text"
              inputMode="decimal"
              etiqueta="Importe"
              value={imputacion.importe}
              onChange={(e) => onCambio({ importe: e.target.value })}
              ayuda={elegida ? `Presupuesto: ${soles(elegida.referencia)}` : "Sin IGV."}
            />
          </div>

          {puedeQuitar && (
            <button
              type="button"
              onClick={onQuitar}
              className="mb-7 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
              style={{ borderColor: "var(--borde)" }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Quitar
            </button>
          )}
        </div>
      </div>

      {/* Aviso, no bloqueo: comprometer por encima del presupuesto es algo
          que pasa, y se corrige con una reconversion o un adicional. Lo que
          no puede es pasar desapercibido. */}
      {elegida && esNegativo(restar(elegida.referencia, imputacion.importe)) && (
        <p className="mt-2 text-sm opacity-80">
          Esta partida tiene {soles(elegida.referencia)} de presupuesto:
          imputarle mas la dejara por encima.
        </p>
      )}
    </div>
  );
}

/**
 * Resta exacta. `lib/decimal` no tiene resta: se niega multiplicando por -1.
 * Anteponer un "-" al texto produce "--100" cuando el valor ya es negativo, y
 * `sumar` lo descarta EN SILENCIO, convirtiendo la resta en un cero.
 */
function restar(a: string, b: string): string {
  return sumar([a, multiplicar(b || "0", "-1", 2) ?? "0"]);
}

/**
 * Las lineas del detalle.
 *
 * La casilla de agrupadora es lo unico que impide contar el dinero dos veces:
 * las ordenes reales abren cada bloque con una linea que repite la suma de
 * sus hijas. Va acompanada de su explicacion, porque marcarla mal no da
 * ningun error: solo duplica el importe.
 */
function Lineas({
  lineas,
  onCambio,
  onQuitar,
  onAnadir,
}: {
  lineas: LineaEstado[];
  onCambio: (clave: number, cambios: Partial<LineaEstado>) => void;
  onQuitar: (clave: number) => void;
  onAnadir: () => void;
}) {
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {lineas.map((l) => (
          <li key={l.clave}>
            <FilaLinea
              linea={l}
              puedeQuitar={lineas.length > 1}
              onCambio={(cambios) => onCambio(l.clave, cambios)}
              onQuitar={() => onQuitar(l.clave)}
            />
          </li>
        ))}
      </ul>

      <BotonSecundario onClick={onAnadir}>
        <Plus className="size-4" aria-hidden="true" />
        Anadir linea
      </BotonSecundario>
    </div>
  );
}

function FilaLinea({
  linea,
  puedeQuitar,
  onCambio,
  onQuitar,
}: {
  linea: LineaEstado;
  puedeQuitar: boolean;
  onCambio: (cambios: Partial<LineaEstado>) => void;
  onQuitar: () => void;
}) {
  const id = `linea-${linea.clave}`;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: linea.esAgrupador
          ? "var(--color-alerta)"
          : "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={linea.esAgrupador}
            onChange={(e) => onCambio({ esAgrupador: e.target.checked })}
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            <span className="font-medium">Solo repite el total de su bloque</span>
            <span className="block text-xs opacity-70">
              Como «TOTAL ESTRUCTURAS». No suma: sus lineas ya lo hacen.
            </span>
          </span>
        </label>

        {puedeQuitar && (
          <button
            type="button"
            onClick={onQuitar}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Quitar
          </button>
        )}
      </div>

      <div className="mt-3">
        <CampoTexto
          id={`${id}-descripcion`}
          type="text"
          etiqueta="Descripcion"
          value={linea.descripcion}
          onChange={(e) => onCambio({ descripcion: e.target.value })}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <CampoTexto
          id={`${id}-cantidad`}
          type="text"
          inputMode="decimal"
          etiqueta="Cantidad"
          value={linea.cantidad}
          onChange={(e) => onCambio({ cantidad: e.target.value })}
        />
        <CampoTexto
          id={`${id}-unidad`}
          type="text"
          etiqueta="Unidad"
          value={linea.unidad}
          onChange={(e) => onCambio({ unidad: e.target.value })}
        />
        <CampoTexto
          id={`${id}-precio`}
          type="text"
          inputMode="decimal"
          etiqueta="P. unitario"
          value={linea.precioUnitario}
          onChange={(e) => onCambio({ precioUnitario: e.target.value })}
        />
        <CampoTexto
          id={`${id}-importe`}
          type="text"
          inputMode="decimal"
          etiqueta="Importe"
          value={linea.importe}
          onChange={(e) => onCambio({ importe: e.target.value })}
          ayuda="Sale de cantidad x precio. Se puede corregir."
        />
      </div>
    </div>
  );
}

function Linea({
  etiqueta,
  sufijo,
  valor,
  destacado,
}: {
  etiqueta: string;
  sufijo?: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 rounded px-2 py-1"
      style={{
        backgroundColor: destacado
          ? "color-mix(in oklab, var(--color-marca-500) 12%, transparent)"
          : undefined,
      }}
    >
      <dt className={destacado ? "font-semibold" : ""}>
        {etiqueta}
        {sufijo && (
          <span className="ml-1.5 text-xs font-normal opacity-60">{sufijo}</span>
        )}
      </dt>
      <dd className={`shrink-0 tabular-nums ${destacado ? "font-semibold" : ""}`}>
        {valor}
      </dd>
    </div>
  );
}

function BotonModo({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium"
      style={{
        backgroundColor: activo ? "var(--color-marca-600)" : "transparent",
        color: activo ? "#fff" : undefined,
      }}
    >
      {children}
    </button>
  );
}

function BotonSecundario({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
      style={{ borderColor: "var(--borde)" }}
    >
      {children}
    </button>
  );
}

function BotonCrear() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      )}
      {pending ? "Guardando..." : "Guardar borrador"}
    </button>
  );
}

interface CampoSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  etiqueta: string;
  ayuda?: string;
}

/** Version de CampoTexto para desplegables, con la misma accesibilidad. */
function CampoSelect({
  etiqueta,
  ayuda,
  id,
  children,
  ...props
}: CampoSelectProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={id}
        aria-describedby={idAyuda}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        {...props}
      >
        {children}
      </select>
      {ayuda && (
        <p id={idAyuda} className="text-xs opacity-60">
          {ayuda}
        </p>
      )}
    </div>
  );
}

interface CampoAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  etiqueta: string;
  ayuda?: string;
}

/** Version de CampoTexto para texto largo: forma de pago y observaciones. */
function CampoArea({ etiqueta, ayuda, id, ...props }: CampoAreaProps) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <textarea
        id={id}
        aria-describedby={idAyuda}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-xs opacity-60">
          {ayuda}
        </p>
      )}
    </div>
  );
}

function Aviso({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
      }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}
