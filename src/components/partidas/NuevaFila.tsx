"use client";

import { useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, Plus } from "lucide-react";

import { accionCrearPartida } from "@/app/(dashboard)/obras/[id]/acciones";
import {
  siguienteCodigoHijo,
  quienSeQuedaLaNumeracion,
} from "@/lib/jerarquia-partidas";

export interface OpcionCapitulo {
  id: string;
  codigo: string;
  etiqueta: string;
  sangria: number;
}

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
type Modalidad = "PRECIOS_UNITARIOS" | "SUMA_ALZADA";

const VACIO = {
  codigoPartida: "",
  descripcion: "",
  unidad: "",
  metrado: "",
  precioUnitario: "",
  parcial: "",
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
  capitulos,
  codigosUsados,
  pedido,
}: {
  obraId: string;
  codigoSugerido: string;
  /// Los capitulos existentes, para elegir de cual cuelga la partida.
  capitulos: OpcionCapitulo[];
  /// Los codigos ya ocupados, para proponer el siguiente hueco libre.
  codigosUsados: string[];
  /**
   * Alta pedida desde la tabla, con el «+» de un capitulo.
   *
   * Lleva un `sello` que cambia en cada pulsacion: sin el, pulsar dos veces
   * el mismo capitulo no haria nada la segunda, porque el id seria igual y
   * no habria cambio que detectar.
   */
  pedido?: { capituloId: string; sello: number };
}) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("PARTIDA");
  const [campos, setCampos] = useState({ ...VACIO, codigoPartida: codigoSugerido });
  const [parentId, setParentId] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("PRECIOS_UNITARIOS");
  const [error, setError] = useState<string | null>(null);
  /// Por que no se pudo proponer un codigo. Distinto de `error`: aqui no ha
  /// fallado nada todavia, se esta avisando antes de teclear.
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);
  const [guardando, guardar] = useTransition();

  /**
   * El codigo que le toca a una partida dentro de `capitulo`, y si no le toca
   * ninguno, POR QUE.
   *
   * El «por que» importa tanto como el codigo: en un presupuesto importado al
   * que despues se le anadieron capitulos conviven "4" y "4.0", y desde
   * entonces todo "4.x" cuelga de "4.0". Pulsar el «+» del "4" dejaba la
   * casilla vacia y el servicio rechazaba despues cualquier cosa que se
   * tecleara, sin que nada dijera que el problema no era lo tecleado.
   */
  function proponer(capitulo: OpcionCapitulo | undefined) {
    if (!capitulo) return { codigo: "", aviso: null };

    const usados = new Set(codigosUsados);
    const propuesto = siguienteCodigoHijo(capitulo.codigo, usados);
    if (propuesto) return { codigo: propuesto, aviso: null };

    const rival = quienSeQuedaLaNumeracion(capitulo.codigo, usados);
    return {
      codigo: "",
      aviso: rival
        ? `Los códigos que le tocarían a «${capitulo.codigo}» ya cuelgan de ` +
          `«${rival}». Elige «${rival}» en la lista, o escribe un código a mano.`
        : `No hay ningún código libre que cuelgue de «${capitulo.codigo}». ` +
          `Escríbelo a mano.`,
    };
  }

  /**
   * Se atiende la peticion DURANTE el renderizado, no en un efecto.
   *
   * Es el mismo patron que `CeldaEditable` usa para sincronizarse con su
   * prop: un efecto pintaria primero el formulario con el capitulo anterior y
   * lo corregiria despues, y ese parpadeo se ve.
   */
  const [selloAtendido, setSelloAtendido] = useState(0);

  if (pedido && pedido.sello !== selloAtendido) {
    setSelloAtendido(pedido.sello);
    setAbierto(true);
    setTipo("PARTIDA");
    setError(null);
    setParentId(pedido.capituloId);

    const { codigo, aviso } = proponer(
      capitulos.find((c) => c.id === pedido.capituloId),
    );
    setCampos({ ...VACIO, codigoPartida: codigo });
    setAvisoCodigo(aviso);
  }

  /**
   * Al elegir capitulo, el codigo se propone solo.
   *
   * Es el nudo de todo esto: antes habia que SABER que "2.1" cuelga del
   * capitulo 2.0, y quien acababa de crear el 4.0 tecleaba 2.1 sin darse
   * cuenta de que la estaba metiendo en otro sitio. `siguienteCodigoHijo`
   * conoce las tres convenciones —"4.0" tiene hijas "4.1", pero "7.02.00" las
   * tiene en "7.02.01"— y se autocomprueba: si no encuentra un codigo que de
   * verdad vuelva a ese capitulo, no propone nada y se teclea a mano.
   */
  function elegirCapitulo(id: string) {
    setParentId(id);
    setError(null);

    const capitulo = capitulos.find((c) => c.id === id);
    if (!capitulo) {
      setAvisoCodigo(null);
      return;
    }

    const { codigo, aviso } = proponer(capitulo);
    setAvisoCodigo(aviso);
    // Si no hay codigo que proponer se DEJA el que hubiera: borrarlo perderia
    // lo que la persona ya estuviera escribiendo.
    if (codigo) setCampos((c) => ({ ...c, codigoPartida: codigo }));
  }

  function enviar() {
    setError(null);

    guardar(async () => {
      const r = await accionCrearPartida(obraId, {
        codigoPartida: campos.codigoPartida,
        descripcion: campos.descripcion,
        tipo,
        // Un capitulo cuelga de la raiz o de otro capitulo por su codigo; el
        // desplegable solo gobierna donde va una PARTIDA.
        parentId: tipo === "PARTIDA" && parentId !== "" ? parentId : null,
        modalidad: tipo === "CAPITULO" ? undefined : modalidad,
        // Un capitulo no lleva cifras: se mandan en null aunque hubieran
        // quedado escritas de antes de cambiar el tipo.
        unidad: tipo === "CAPITULO" ? null : campos.unidad || null,
        metrado: tipo === "CAPITULO" ? null : campos.metrado || null,
        // En suma alzada el precio unitario no participa: el importe esta
        // cerrado y multiplicarlo inventaria una cifra que nadie pacto.
        precioUnitario:
          tipo === "CAPITULO" || modalidad === "SUMA_ALZADA"
            ? null
            : campos.precioUnitario || null,
        parcial:
          tipo !== "CAPITULO" && modalidad === "SUMA_ALZADA"
            ? campos.parcial || null
            : null,
      });

      if (!r.ok) {
        setError(r.error ?? "No se pudo crear.");
        return;
      }

      /**
       * Se queda ABIERTO, con el tipo y el capitulo elegidos: teclear un
       * presupuesto son decenas de filas seguidas dentro del mismo capitulo.
       *
       * Y se propone YA el codigo siguiente, contando la que se acaba de
       * crear. Antes se limpiaba a vacio y habia que acordarse de por donde
       * iba la numeracion en cada fila, que es justo lo que hacia teclear un
       * presupuesto una tarea de paciencia.
       */
      const capitulo = capitulos.find((c) => c.id === parentId);
      const yaUsados = new Set([...codigosUsados, campos.codigoPartida]);
      const siguiente = capitulo
        ? (siguienteCodigoHijo(capitulo.codigo, yaUsados) ?? "")
        : "";

      setCampos({ ...VACIO, codigoPartida: siguiente });
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
  const esAlzada = modalidad === "SUMA_ALZADA";

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

        {/* Solo para partidas: un capitulo cuelga de la raiz o de otro
            capitulo, y eso lo dice su codigo. */}
        {!esCapitulo && capitulos.length > 0 && (
          <label className="mt-4 block text-xs">
            <span className="mb-0.5 block font-medium opacity-70">
              Capítulo donde cuelga
            </span>
            <select
              value={parentId}
              onChange={(e) => elegirCapitulo(e.target.value)}
              className="w-full max-w-lg rounded border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            >
              <option value="">Elige un capítulo</option>

              {/* La sangria son espacios DUROS: el navegador colapsa los
                  normales dentro de una opcion y todos los subcapitulos
                  quedarian al mismo margen. */}
              {capitulos.map((c) => (
                <option key={c.id} value={c.id}>
                  {" ".repeat(c.sangria * 3)}
                  {c.etiqueta}
                </option>
              ))}
            </select>
            <span className="mt-0.5 block opacity-60">
              Al elegirlo, el código se propone solo.
            </span>
          </label>
        )}

        {/* No es un error —todavia no ha fallado nada—, es el aviso de que
            este capitulo no puede numerar hijas porque otro se quedo con su
            numeracion. Sin el, la casilla del codigo se quedaba vacia y el
            servicio rechazaba despues cualquier cosa que se escribiera. */}
        {!esCapitulo && avisoCodigo && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs text-pretty"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
            }}
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {avisoCodigo}
          </p>
        )}

        {/* La modalidad, al crear y no despues. Antes toda partida nacia a
            precios unitarios y habia que corregirla en la tabla; y como al
            crearla el importe salia de metrado x precio, una suma alzada
            nacia con una cifra que nadie habia pactado. */}
        {!esCapitulo && (
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Cómo está contratada">
            {(["PRECIOS_UNITARIOS", "SUMA_ALZADA"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modalidad === m}
                onClick={() => setModalidad(m)}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{
                  borderColor: modalidad === m ? "var(--color-marca-600)" : "var(--borde)",
                  backgroundColor:
                    modalidad === m
                      ? "color-mix(in oklab, var(--color-marca-600) 12%, transparent)"
                      : undefined,
                  fontWeight: modalidad === m ? 600 : 400,
                }}
              >
                {m === "PRECIOS_UNITARIOS" ? "Precios unitarios" : "Suma alzada"}
              </button>
            ))}
          </div>
        )}

        {!esCapitulo && (
          <p className="mt-2 text-xs text-pretty opacity-70">
            {esAlzada
              ? "El precio está cerrado por todo el alcance: el metrado es referencial y aunque se ejecute más, el importe pactado no cambia. El riesgo es del contratista."
              : "El importe sale de metrado × precio. Si en obra sale más cantidad, el importe sube y se valoriza: el riesgo es del cliente."}
          </p>
        )}

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
                placeholder={esAlzada ? "glb" : "m3"}
              />
              <Campo
                etiqueta="Metrado"
                ancho="w-28"
                inputMode="decimal"
                value={campos.metrado}
                onChange={(e) => setCampos({ ...campos, metrado: e.target.value })}
                placeholder="12.5"
                ayuda={esAlzada ? "Referencial" : undefined}
              />

              {/* En suma alzada no hay precio unitario que multiplicar: se
                  pide el importe cerrado y punto. Ensenar los dos campos
                  invitaria a rellenarlos y a esperar que cuadren. */}
              {esAlzada ? (
                <Campo
                  etiqueta="Importe cerrado"
                  ancho="w-36"
                  inputMode="decimal"
                  value={campos.parcial}
                  onChange={(e) => setCampos({ ...campos, parcial: e.target.value })}
                  placeholder="2500.00"
                  ayuda="El precio pactado"
                />
              ) : (
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
              )}
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
