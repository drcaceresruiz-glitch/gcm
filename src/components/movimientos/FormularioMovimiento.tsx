"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  ArrowLeftRight,
  Check,
  LoaderCircle,
  Minus,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  accionCrearMovimiento,
  type EstadoMovimiento,
} from "@/app/(dashboard)/obras/[id]/movimientos/acciones";
import type { TipoMovimiento } from "@/generated/prisma/enums";
import { conSigno, direccionFija, type Direccion } from "@/lib/movimientos";
import { esCero, esNegativo, esPositivo, multiplicar, sumar } from "@/lib/decimal";
import { soles } from "@/utils/formato";
import { CampoTexto } from "@/components/auth/CampoTexto";

/**
 * Alta de un movimiento presupuestal.
 *
 * El formulario no habla de importes con signo: cada linea dice si el
 * dinero ENTRA o SALE de una partida, y la cantidad va siempre en positivo.
 * Es como se dicta un movimiento en obra, y evita la clase de error que un
 * campo con signo invita a cometer.
 *
 * El recuento de entradas, salidas y neto se rehace mientras se escribe, y
 * no es adorno: la regla que hace valida una reconversion es que sume cero,
 * y descubrirlo al pulsar guardar obligaria a recomponer las cifras a
 * ciegas. Se calcula con la misma aritmetica exacta del dominio.
 *
 * Lo que aqui se avisa, el servicio lo vuelve a comprobar. Esto adelanta el
 * error para no perder lo escrito; la decision sigue siendo suya.
 */

export interface OpcionPartida {
  wbsItemId: string;
  codigoPartida: string;
  descripcion: string;
  modalidad: "PRECIOS_UNITARIOS" | "SUMA_ALZADA";
  vigente: string;
  /// Capitulo raiz al que pertenece, para agrupar el desplegable.
  capitulo: string;
}

export interface OpcionCapitulo {
  id: string;
  etiqueta: string;
  /// Niveles por debajo de la raiz, para sangrar el desplegable.
  sangria: number;
}

interface Comun {
  /// Identidad estable de la fila mientras se edita. No viaja al servidor.
  clave: number;
  direccion: Direccion;
  importe: string;
  justificacion: string;
}

interface LineaExistente extends Comun {
  clase: "existente";
  wbsItemId: string;
}

interface LineaNueva extends Comun {
  clase: "nueva";
  parentId: string;
  codigoPartida: string;
  descripcion: string;
  unidad: string;
  metrado: string;
  precioUnitario: string;
  modalidad: "PRECIOS_UNITARIOS" | "SUMA_ALZADA";
}

type Linea = LineaExistente | LineaNueva;

/**
 * Campos que una fila puede cambiar de si misma.
 *
 * Deja fuera `clase` y `clave`: la forma de la linea se decide al anadirla y
 * la clave es su identidad mientras se edita. Incluirlas ademas juntaria dos
 * literales incompatibles y el tipo resultante no admitiria ningun cambio.
 */
type CambiosLinea = Partial<
  Omit<LineaExistente, "clase" | "clave"> & Omit<LineaNueva, "clase" | "clave">
>;

const TIPOS = [
  {
    valor: "RECONVERSION",
    titulo: "Reconversion",
    icono: ArrowLeftRight,
    ayuda: "Saca de unas partidas y mete en otras. La suma tiene que dar cero.",
  },
  {
    valor: "ADICIONAL",
    titulo: "Adicional",
    icono: Plus,
    ayuda: "Aumenta el presupuesto aprobado. Solo entradas, y puede traer partidas nuevas.",
  },
  {
    valor: "DEDUCTIVO",
    titulo: "Deductivo",
    icono: Minus,
    ayuda: "Reduce el presupuesto aprobado. Solo salidas.",
  },
] as const satisfies readonly { valor: TipoMovimiento; titulo: string; icono: typeof Plus; ayuda: string }[];

/** Una linea sobre una partida existente, todavia sin rellenar. */
function lineaVacia(clave: number, direccion: Direccion): LineaExistente {
  return {
    clave,
    clase: "existente",
    wbsItemId: "",
    direccion,
    importe: "",
    justificacion: "",
  };
}

interface Props {
  obraId: string;
  fechaHoy: string;
  partidas: OpcionPartida[];
  capitulos: OpcionCapitulo[];
}

export function FormularioMovimiento({
  obraId,
  fechaHoy,
  partidas,
  capitulos,
}: Props) {
  const [estado, accion] = useActionState<EstadoMovimiento, FormData>(
    accionCrearMovimiento,
    {},
  );

  const [tipo, setTipo] = useState<TipoMovimiento>("RECONVERSION");

  // Una reconversion nace con las dos mitades a la vista: sin una salida y
  // una entrada no es una reconversion, y el servicio la rechazaria. Esas
  // dos claves son fijas y el contador arranca detras de ellas.
  const [lineas, setLineas] = useState<Linea[]>([
    lineaVacia(0, "sale"),
    lineaVacia(1, "entra"),
  ]);
  const clave = useRef(2);

  /// Solo se llama desde manejadores, nunca al pintar: el contador vive en
  /// una ref y leerla durante el render no garantizaria un valor estable.
  const nuevaExistente = (direccion: Direccion): LineaExistente =>
    lineaVacia(clave.current++, direccion);

  const fija = direccionFija(tipo);
  const porId = new Map(partidas.map((p) => [p.wbsItemId, p]));

  function cambiarTipo(nuevo: TipoMovimiento) {
    const nuevaFija = direccionFija(nuevo);

    // Solo un adicional da de alta partidas. Al cambiar de tipo esas lineas
    // dejan de tener sentido, asi que se retiran aqui en vez de viajar al
    // servidor para que las rechace.
    const conservadas: Linea[] =
      nuevo === "ADICIONAL"
        ? lineas
        : lineas.filter((l) => l.clase === "existente");

    const ajustadas = nuevaFija
      ? conservadas.map((l) => ({ ...l, direccion: nuevaFija }))
      : conservadas;

    setTipo(nuevo);
    setLineas(
      ajustadas.length > 0 ? ajustadas : [nuevaExistente(nuevaFija ?? "sale")],
    );
  }

  /// Los cambios abarcan los campos de las dos formas de linea: cada uno
  /// solo se edita desde la fila que lo muestra, asi que no se cruzan.
  function actualizar(clave: number, cambios: CambiosLinea) {
    setLineas((previas) =>
      previas.map((l) => (l.clave === clave ? ({ ...l, ...cambios } as Linea) : l)),
    );
  }

  function eliminar(clave: number) {
    setLineas((previas) => previas.filter((l) => l.clave !== clave));
  }

  // Un importe a medio escribir no es un numero: `sumar` lo descarta y el
  // recuento se corrige solo en cuanto la cifra esta completa.
  const firmados = lineas.map((l) => conSigno(l.direccion, l.importe));
  const entradas = sumar(firmados.filter(esPositivo));
  const salidas = sumar(firmados.filter(esNegativo));
  const neto = sumar(firmados);
  const cuadra = esCero(neto);

  const carga = lineas.map((l) =>
    l.clase === "nueva"
      ? {
          clase: "nueva",
          parentId: l.parentId,
          codigoPartida: l.codigoPartida.trim(),
          descripcion: l.descripcion.trim(),
          unidad: l.unidad.trim(),
          metrado: l.metrado.trim(),
          precioUnitario: l.precioUnitario.trim(),
          modalidad: l.modalidad,
          direccion: l.direccion,
          importe: l.importe.trim(),
          justificacion: l.justificacion.trim(),
        }
      : {
          clase: "existente",
          wbsItemId: l.wbsItemId,
          direccion: l.direccion,
          importe: l.importe.trim(),
          justificacion: l.justificacion.trim(),
        },
  );

  if (partidas.length === 0) {
    return (
      <p
        className="rounded-xl border border-dashed p-8 text-center text-sm text-pretty opacity-70"
        style={{ borderColor: "var(--borde)" }}
      >
        Esta obra no tiene ninguna partida que se pueda ajustar. Las partidas
        de modalidad ALCANCE no llevan importe propio: el dinero esta en su
        partida padre.
      </p>
    );
  }

  return (
    <form action={accion} className="space-y-8" noValidate>
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="lineas" value={JSON.stringify(carga)} />

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
          <span>{estado.error}</span>
        </p>
      )}

      <fieldset>
        <legend className="text-lg font-semibold">Tipo de movimiento</legend>
        <p className="mt-1 mb-3 text-sm opacity-70">
          Decide que puede llevar el movimiento, y el sistema no deja
          mezclarlo despues.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {TIPOS.map((opcion) => {
            const Icono = opcion.icono;
            const elegido = tipo === opcion.valor;

            return (
              <label
                key={opcion.valor}
                className="cursor-pointer rounded-xl border p-4"
                style={{
                  borderColor: elegido
                    ? "var(--color-marca-600)"
                    : "var(--borde)",
                  backgroundColor: elegido
                    ? "color-mix(in oklab, var(--color-marca-500) 10%, transparent)"
                    : "var(--superficie)",
                }}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="tipo"
                    value={opcion.valor}
                    checked={elegido}
                    onChange={() => cambiarTipo(opcion.valor)}
                  />
                  <Icono className="size-4" aria-hidden="true" />
                  {opcion.titulo}
                </span>
                <span className="mt-1.5 block text-xs text-pretty opacity-70">
                  {opcion.ayuda}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">El documento que lo respalda</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            id="fecha"
            name="fecha"
            type="date"
            etiqueta="Fecha"
            defaultValue={fechaHoy}
            ayuda="La del acta o el documento, no la de hoy si se registra despues."
            required
          />
          <CampoTexto
            id="referencia"
            name="referencia"
            type="text"
            etiqueta="Referencia"
            ayuda="Opcional. Numero de acta, carta o correo con el que se acordo."
          />
        </div>

        <CampoTexto
          id="concepto"
          name="concepto"
          type="text"
          etiqueta="Concepto"
          ayuda="Una linea para citarlo despues: «Refuerzo de losa en zona de tanques»."
          required
        />

        <CampoArea
          id="motivo"
          name="motivo"
          etiqueta="Motivo"
          rows={3}
          ayuda="Por que procede. La clausula 1 del contrato admite un adicional por vicios ocultos o cambios de diseno."
          required
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Lineas
            <span className="ml-2 text-sm font-normal opacity-60">
              {lineas.length === 1 ? "1 partida" : `${lineas.length} partidas`}
            </span>
          </h2>

          <div className="flex flex-wrap gap-2">
            <BotonSecundario
              onClick={() => setLineas([...lineas, nuevaExistente(fija ?? "entra")])}
            >
              <Plus className="size-4" aria-hidden="true" />
              Anadir linea
            </BotonSecundario>

            {/* Solo un adicional puede dar de alta partidas: en los demas
                tipos el boton no existe en vez de existir y fallar. */}
            {tipo === "ADICIONAL" && (
              <BotonSecundario
                onClick={() =>
                  setLineas([
                    ...lineas,
                    {
                      clave: clave.current++,
                      clase: "nueva",
                      parentId: "",
                      codigoPartida: "",
                      descripcion: "",
                      unidad: "",
                      metrado: "",
                      precioUnitario: "",
                      modalidad: "PRECIOS_UNITARIOS",
                      direccion: "entra",
                      importe: "",
                      justificacion: "",
                    },
                  ])
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Anadir partida nueva
              </BotonSecundario>
            )}
          </div>
        </div>

        <ul className="space-y-3">
          {lineas.map((linea) => (
            <li key={linea.clave}>
              <FilaLinea
                linea={linea}
                partidas={partidas}
                capitulos={capitulos}
                partida={
                  linea.clase === "existente"
                    ? porId.get(linea.wbsItemId)
                    : undefined
                }
                direccionFijada={fija}
                puedeEliminar={lineas.length > 1}
                onCambio={(cambios) => actualizar(linea.clave, cambios)}
                onEliminar={() => eliminar(linea.clave)}
              />
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-xl border p-4"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        <h2 className="text-sm font-semibold">Asi queda el movimiento</h2>

        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <Total etiqueta="Entra" valor={soles(entradas)} />
          <Total etiqueta="Sale" valor={soles(salidas)} />
          <Total etiqueta="Efecto en el presupuesto" valor={soles(neto)} fuerte />
        </dl>

        {tipo === "RECONVERSION" && <Cuadre cuadra={cuadra} neto={neto} />}

        <div className="mt-4">
          <BotonCrear />
        </div>

        <p className="mt-3 text-xs text-pretty opacity-60">
          Se guarda como borrador: todavia no ajusta el presupuesto. Un
          administrador tiene que aprobarlo, y entonces ya no se puede
          deshacer.
        </p>
      </section>
    </form>
  );
}

/**
 * Lo que el servicio rechazaria, dicho antes de escribir el resto del
 * movimiento. No bloquea el envio: la decision de fondo es del servicio, y
 * duplicar aqui la regla invitaria a que las dos se separaran con el tiempo.
 */
function avisoDeLinea(linea: Linea, partida?: OpcionPartida): string | null {
  if (linea.clase !== "existente" || linea.direccion !== "sale") return null;
  if (!partida) return null;

  // El precio de una partida a suma alzada esta cerrado por contrato:
  // sacarle dinero daria un vigente que no se puede facturar.
  if (partida.modalidad === "SUMA_ALZADA") {
    return "Esta partida esta contratada a suma alzada: su precio esta cerrado y no se le puede quitar dinero. Acuerdalo con el cliente como deductivo.";
  }

  // `conSigno("entra", ...)` devuelve la cantidad sin signo: sirve para
  // saber si hay algo escrito antes de compararlo con lo disponible.
  if (!esPositivo(conSigno("entra", linea.importe))) return null;

  const resto = sumar([partida.vigente, conSigno("sale", linea.importe)]);
  if (esNegativo(resto)) {
    return `Esta partida tiene ${soles(partida.vigente)} disponibles. No se puede sacar mas de lo que tiene.`;
  }

  return null;
}

interface FilaProps {
  linea: Linea;
  partidas: OpcionPartida[];
  capitulos: OpcionCapitulo[];
  partida: OpcionPartida | undefined;
  /// La direccion que impone el tipo, o null si se elige por linea.
  direccionFijada: Direccion | null;
  puedeEliminar: boolean;
  onCambio: (cambios: CambiosLinea) => void;
  onEliminar: () => void;
}

function FilaLinea({
  linea,
  partidas,
  capitulos,
  partida,
  direccionFijada,
  puedeEliminar,
  onCambio,
  onEliminar,
}: FilaProps) {
  const aviso = avisoDeLinea(linea, partida);
  const id = `linea-${linea.clave}`;

  // Una partida nueva puede traer metrado y precio, pero su importe no sale
  // de multiplicarlos: el dinero vive en la linea del movimiento y el
  // `parcial` de la partida nace nulo a proposito. Se ofrece el producto
  // como atajo para no teclearlo mal, sin imponerlo.
  const producto =
    linea.clase === "nueva" && linea.metrado.trim() && linea.precioUnitario.trim()
      ? multiplicar(linea.metrado.trim(), linea.precioUnitario.trim(), 2)
      : null;

  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {direccionFijada ? (
          <p className="text-sm font-medium">
            {linea.direccion === "sale" ? "Sale de" : "Entra en"}
            {linea.clase === "nueva" && (
              <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--color-marca-500) 18%, transparent)",
                }}
              >
                partida nueva
              </span>
            )}
          </p>
        ) : (
          <div
            className="inline-flex overflow-hidden rounded-lg border text-sm"
            style={{ borderColor: "var(--borde)" }}
            role="group"
            aria-label="Direccion del dinero"
          >
            <BotonDireccion
              activo={linea.direccion === "sale"}
              onClick={() => onCambio({ direccion: "sale" })}
            >
              Sale de
            </BotonDireccion>
            <BotonDireccion
              activo={linea.direccion === "entra"}
              onClick={() => onCambio({ direccion: "entra" })}
            >
              Entra en
            </BotonDireccion>
          </div>
        )}

        {puedeEliminar && (
          <button
            type="button"
            onClick={onEliminar}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Quitar
          </button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {linea.clase === "existente" ? (
          <SelectorPartida
            id={`${id}-partida`}
            partidas={partidas}
            valor={linea.wbsItemId}
            direccion={linea.direccion}
            onCambio={(wbsItemId) => onCambio({ wbsItemId })}
          />
        ) : (
          <CamposPartidaNueva
            id={id}
            linea={linea}
            capitulos={capitulos}
            onCambio={onCambio}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <CampoTexto
              id={`${id}-importe`}
              type="text"
              inputMode="decimal"
              etiqueta="Importe"
              value={linea.importe}
              onChange={(e) => onCambio({ importe: e.target.value })}
              ayuda={
                partida && linea.direccion === "sale"
                  ? `Disponible: ${soles(partida.vigente)}`
                  : "Siempre en positivo: la direccion la marca el boton."
              }
            />

            {producto && producto !== linea.importe.trim() && (
              <button
                type="button"
                onClick={() => onCambio({ importe: producto })}
                className="mt-1.5 text-xs font-medium underline opacity-70 hover:opacity-100"
              >
                Usar metrado x precio = {soles(producto)}
              </button>
            )}
          </div>

          <CampoTexto
            id={`${id}-justificacion`}
            type="text"
            etiqueta="Justificacion de la linea"
            value={linea.justificacion}
            onChange={(e) => onCambio({ justificacion: e.target.value })}
            ayuda="Opcional. Por que esta partida en concreto."
          />
        </div>

        {aviso && (
          <p
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
            }}
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{aviso}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Desplegable de partidas, agrupado por capitulo.
 *
 * Se agrupa recorriendo la lista, que ya viene en orden de documento, en
 * lugar de ordenarla otra vez: es el orden en el que el cliente lee su
 * Excel, y buscar «11.11.02» donde uno espera encontrarlo importa mas que
 * cualquier orden alfabetico.
 *
 * Cada opcion lleva su importe vigente porque la pregunta que se hace quien
 * redacta una reconversion es «de donde puedo sacarlo».
 *
 * Y por lo mismo se marcan las de SUMA ALZADA. Su precio esta cerrado por
 * contrato y no se les puede quitar dinero: saberlo ANTES de elegirlas evita
 * recorrer el desplegable a ciegas hasta que salta el aviso. Las de precios
 * unitarios no se rotulan, que son la mayoria y el rotulo seria ruido.
 */
function SelectorPartida({
  id,
  partidas,
  valor,
  direccion,
  onCambio,
}: {
  id: string;
  partidas: OpcionPartida[];
  valor: string;
  /// Solo se explica la restriccion cuando estorba, que es al sacar dinero.
  direccion: Direccion;
  onCambio: (wbsItemId: string) => void;
}) {
  const grupos: [string, OpcionPartida[]][] = [];
  for (const p of partidas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo[0] === p.capitulo) ultimo[1].push(p);
    else grupos.push([p.capitulo, [p]]);
  }

  return (
    <CampoSelect
      id={id}
      etiqueta="Partida"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      ayuda={
        direccion === "sale"
          ? "Las marcadas «suma alzada» tienen el precio cerrado por contrato: no se les puede quitar dinero."
          : undefined
      }
    >
      <option value="">Elige una partida</option>
      {grupos.map(([capitulo, suyas]) => (
        <optgroup key={capitulo} label={capitulo}>
          {suyas.map((p) => (
            <option key={p.wbsItemId} value={p.wbsItemId}>
              {p.codigoPartida} · {p.descripcion} · {soles(p.vigente)}
              {p.modalidad === "SUMA_ALZADA" && " · suma alzada"}
            </option>
          ))}
        </optgroup>
      ))}
    </CampoSelect>
  );
}

/**
 * Alta de una partida que no esta en el presupuesto contratado.
 *
 * Solo se ofrecen capitulos como padre. Colgarla de una partida con importe
 * propio dejaria a esa partida «cubierta» por la nueva y su importe
 * desapareceria del costo directo, sin error y sin rastro.
 *
 * La partida no nace al guardar, sino al aprobar: asi un borrador que se
 * descarta no deja partidas fantasma en un arbol que la linea base
 * congelada impide limpiar.
 */
function CamposPartidaNueva({
  id,
  linea,
  capitulos,
  onCambio,
}: {
  id: string;
  linea: LineaNueva;
  capitulos: OpcionCapitulo[];
  onCambio: (cambios: CambiosLinea) => void;
}) {
  return (
    <div className="space-y-3">
      <CampoSelect
        id={`${id}-capitulo`}
        etiqueta="Capitulo donde cuelga"
        value={linea.parentId}
        onChange={(e) => onCambio({ parentId: e.target.value })}
        ayuda="Solo capitulos: colgarla de una partida con importe borraria el importe de esa partida."
      >
        <option value="">Elige un capitulo</option>

        {/* La sangria de los subcapitulos son espacios DUROS. El navegador
            colapsa los normales dentro de una opcion y la jerarquia se
            perderia: todos los capitulos quedarian al mismo margen. */}
        {capitulos.map((c) => (
          <option key={c.id} value={c.id}>
            {" ".repeat(c.sangria * 3)}
            {c.etiqueta}
          </option>
        ))}
      </CampoSelect>

      <div className="grid gap-3 sm:grid-cols-3">
        <CampoTexto
          id={`${id}-codigo`}
          type="text"
          etiqueta="Codigo"
          value={linea.codigoPartida}
          onChange={(e) => onCambio({ codigoPartida: e.target.value })}
          ayuda="Con la numeracion del presupuesto: 7.02.04."
        />
        <div className="sm:col-span-2">
          <CampoTexto
            id={`${id}-descripcion`}
            type="text"
            etiqueta="Descripcion"
            value={linea.descripcion}
            onChange={(e) => onCambio({ descripcion: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <CampoTexto
          id={`${id}-unidad`}
          type="text"
          etiqueta="Unidad"
          value={linea.unidad}
          onChange={(e) => onCambio({ unidad: e.target.value })}
        />
        <CampoTexto
          id={`${id}-metrado`}
          type="text"
          inputMode="decimal"
          etiqueta="Metrado"
          value={linea.metrado}
          onChange={(e) => onCambio({ metrado: e.target.value })}
        />
        <CampoTexto
          id={`${id}-precio`}
          type="text"
          inputMode="decimal"
          etiqueta="Precio unitario"
          value={linea.precioUnitario}
          onChange={(e) => onCambio({ precioUnitario: e.target.value })}
        />

        <CampoSelect
          id={`${id}-modalidad`}
          etiqueta="Modalidad"
          value={linea.modalidad}
          onChange={(e) =>
            onCambio({
              modalidad: e.target.value as LineaNueva["modalidad"],
            })
          }
        >
          <option value="PRECIOS_UNITARIOS">Precios unitarios</option>
          <option value="SUMA_ALZADA">Suma alzada</option>
        </CampoSelect>
      </div>
    </div>
  );
}

function BotonDireccion({
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
      className="px-3 py-1.5 font-medium"
      style={{
        backgroundColor: activo ? "var(--color-marca-600)" : "transparent",
        color: activo ? "#fff" : undefined,
      }}
    >
      {children}
    </button>
  );
}

/**
 * El estado de la regla que hace valida una reconversion.
 *
 * Se dice cuanto falta y de que lado, no solo que no cuadra: con varias
 * lineas a la vista, «sobran 500» es accionable y «no cuadra» obliga a
 * sumar a mano.
 */
function Cuadre({ cuadra, neto }: { cuadra: boolean; neto: string }) {
  if (cuadra) {
    return (
      <p
        className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
        style={{
          backgroundColor:
            "color-mix(in oklab, var(--color-exito) 15%, transparent)",
        }}
      >
        <Check className="size-4 shrink-0" aria-hidden="true" />
        La reconversion cuadra: sale tanto como entra.
      </p>
    );
  }

  const sobra = esPositivo(neto);
  const magnitud = sobra ? neto : (multiplicar(neto, "-1", 2) ?? neto);

  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor:
          "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
      }}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        Una reconversion tiene que sumar cero, y{" "}
        {sobra
          ? `entra ${soles(magnitud)} mas de lo que sale`
          : `sale ${soles(magnitud)} mas de lo que entra`}
        . Ajusta los importes antes de guardar.
      </span>
    </p>
  );
}

function Total({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string;
  valor: string;
  fuerte?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd
        className={`mt-0.5 tabular-nums ${fuerte ? "text-lg font-semibold" : "text-base"}`}
      >
        {valor}
      </dd>
    </div>
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

/** Version de CampoTexto para texto largo: el motivo del movimiento. */
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
