import { decimal, metrado, porcentaje, precio } from "@/utils/formato";
import type { CascadaComercial, TipoImpuestoContractual } from "@/lib/presupuesto";
import { SIMBOLO, type LineaDetalle, type Moneda } from "@/lib/propuesta-detalle";
import type { EmisorPropuesta, Propuesta } from "@/services/propuesta.service";
import { esCero, restar } from "@/lib/decimal";

/**
 * La propuesta economica tal como se le entrega al cliente.
 *
 * Mismo criterio que la orden de compra: se imprime desde el NAVEGADOR y no
 * se compone en el servidor. Guardar como PDF desde el dialogo de impresion
 * da el mismo documento que se ve en pantalla, sin Chromium en el alojamiento
 * ni un segundo maquetador que mantener en paralelo.
 *
 * NO usa las variables del tema. Un papel que sale a un tercero tiene que
 * imprimirse igual siempre; con `var(--fondo)` saldria en gris sobre negro
 * para quien tenga el modo oscuro puesto.
 *
 * No decide nada: recibe ya resueltas las lineas (al detalle elegido) y la
 * cascada (a la forma de facturar elegida). Asi lo que se ve en pantalla, lo
 * que se imprime y lo que se descarga en Excel salen del mismo calculo.
 */

export interface VistaPropuesta {
  lineas: LineaDetalle[];
  cascada: CascadaComercial;
  impuesto: TipoImpuestoContractual;
  porcentajeIgv: string;
  porcentajeRetencion: string;
  /// Texto libre bajo los datos del cliente. Vacio = no se pinta.
  presentacion: string;
  /// Texto libre antes de la firma. Vacio = no se pinta.
  observaciones: string;
  moneda: Moneda;
  /// El tipo de cambio usado. Solo se imprime al emitir en dolares: un precio
  /// convertido sin decir a que cambio no hay forma de comprobarlo.
  tipoCambio: string | null;
}

/** Las fracciones de la base (0.18) se leen como porcentaje (18.00%). */
function pct(fraccion: string): string {
  return porcentaje(Number(fraccion) * 100, 2);
}

export function DocumentoPropuesta({
  propuesta,
  vista,
}: {
  propuesta: Propuesta;
  vista: VistaPropuesta;
}) {
  const { obra, emisor, logo, revision } = propuesta;

  const fecha = revision.fechaRevision.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <article
      className="mx-auto w-full max-w-[210mm] bg-white p-10 text-[11px] leading-relaxed text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
      style={{ colorScheme: "light" }}
    >
      {/* Se imprime, no solo se ve: es justo cuando alguien manda por correo
          el PDF de un borrador cuando hace falta que el propio papel diga que
          todavia no compromete a nadie. */}
      {!revision.aprobada && (
        <p className="mb-4 border-2 border-black px-3 py-2 text-center text-xs font-bold tracking-wide uppercase">
          Borrador — esta propuesta aún no está aprobada y puede cambiar
        </p>
      )}

      <Cabecera
        emisor={emisor}
        logo={logo}
        version={revision.version}
        fecha={fecha}
      />

      <section className="mt-5 border border-black">
        <Dato etiqueta="CLIENTE">{obra.cliente ?? "—"}</Dato>
        <Dato etiqueta="OBRA">
          {obra.nombreObra}
          {obra.codigoObra && (
            <span className="ml-3 font-normal">Código: {obra.codigoObra}</span>
          )}
        </Dato>
        {obra.ubicacion && <Dato etiqueta="UBICACIÓN">{obra.ubicacion}</Dato>}
      </section>

      {vista.presentacion.trim() !== "" && (
        <section className="mt-5 break-inside-avoid">
          <p className="whitespace-pre-line">{vista.presentacion}</p>
        </section>
      )}

      <TablaPartidas lineas={vista.lineas} moneda={vista.moneda} />
      <Resumen vista={vista} porcentajes={revision.porcentajes} />

      <section className="mt-5 space-y-3 break-inside-avoid">
        {vista.observaciones.trim() !== "" && (
          <Parrafo titulo="OBSERVACIONES">{vista.observaciones}</Parrafo>
        )}
        {revision.clausulas && (
          <Parrafo titulo="CONDICIONES">{revision.clausulas}</Parrafo>
        )}
      </section>

      <Firma emisor={emisor} />
    </article>
  );
}

function Cabecera({
  emisor,
  logo,
  version,
  fecha,
}: {
  emisor: EmisorPropuesta;
  logo: Propuesta["logo"];
  version: number;
  fecha: string;
}) {
  const contacto = [emisor.telefono, emisor.email].filter(Boolean).join(" · ");

  return (
    <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
      <div>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo.src}
            alt={logo.alt}
            width={logo.ancho}
            height={logo.alto}
            className="mb-2 h-12 w-auto max-w-52 object-contain"
          />
        )}
        <p className="text-base font-bold tracking-tight uppercase">
          {emisor.razonSocial}
        </p>
        <p className="mt-0.5">RUC {emisor.ruc}</p>
        {emisor.direccion && <p>{emisor.direccion}</p>}
        {contacto && <p>{contacto}</p>}
      </div>

      <div className="shrink-0 border border-black px-4 py-2 text-right">
        <p className="text-sm font-bold tracking-wide">PROPUESTA ECONÓMICA</p>
        <p className="mt-1 font-mono text-sm font-bold">Rev. {version}</p>
        <p className="mt-1">FECHA: {fecha}</p>
      </div>
    </header>
  );
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 border-b border-black px-2 py-1.5 last:border-b-0">
      <span className="w-32 shrink-0 font-bold">{etiqueta}:</span>
      <span className="font-bold">{children}</span>
    </div>
  );
}

/**
 * El detalle de partidas.
 *
 * Cada fila lleva cifra solo si no tiene ninguna fila visible por debajo; lo
 * decide `aplicarDetalle`. Aqui solo se pinta. Un capitulo con sus partidas a
 * la vista sale sin importe -pintarlo igual invita a sumar la columna y contar
 * el mismo dinero dos veces, el tropiezo clasico del Excel del presupuesto-, y
 * en cambio SI lo lleva cuando sus partidas se han resumido: entonces es el
 * unico sitio donde aparece ese dinero.
 */
function TablaPartidas({
  lineas,
  moneda,
}: {
  lineas: LineaDetalle[];
  moneda: Moneda;
}) {
  return (
    <table className="mt-5 w-full border-collapse border border-black">
      <thead>
        <tr className="bg-neutral-100 text-left">
          <Th className="w-20">ÍTEM</Th>
          <Th>DESCRIPCIÓN</Th>
          <Th className="w-14">UND.</Th>
          <Th className="w-20 text-right">METRADO</Th>
          <Th className="w-24 text-right">P. UNIT. {SIMBOLO[moneda]}</Th>
          <Th className="w-28 text-right">PARCIAL {SIMBOLO[moneda]}</Th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l) => (
          <tr
            key={l.codigo}
            className={`break-inside-avoid ${l.esCapitulo || l.esSubtotal ? "bg-neutral-100 font-bold" : ""}`}
          >
            <Td className="font-mono">{l.codigo}</Td>
            <Td style={{ paddingLeft: `${0.5 + l.nivel * 0.9}rem` }}>
              {l.descripcion}
            </Td>
            <Td>{l.unidad ?? ""}</Td>
            <Td className="text-right">{metrado(l.metrado, "")}</Td>
            <Td className="text-right">{precio(l.precioUnitario, "")}</Td>
            <Td className="text-right">{decimal(l.importe, "")}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border border-black px-2 py-1 text-[10px] font-bold tracking-wide ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`border border-black px-2 py-1 align-top ${className}`}
      style={style}
    >
      {children}
    </td>
  );
}

/**
 * La cascada, en el orden que pide SUNAT para una cotizacion:
 * costo directo + gastos generales + utilidad = subtotal; menos el descuento
 * comercial da el VALOR DE VENTA; mas el IGV, el PRECIO DE VENTA.
 *
 * Las lineas que valen cero no se pintan. Un "DESCUENTO 0.00" hace dudar de
 * si se olvido aplicarlo, y un "IGV 0.00" parece una averia cuando en realidad
 * es un recibo por honorarios, que no lo lleva.
 *
 * PRECIO DE VENTA solo aparece si de verdad difiere del valor de venta: sin
 * IGV y sin retencion asumida son la misma cifra, y repetirla dos veces
 * seguidas con dos nombres distintos solo confunde a quien la lee.
 */
function Resumen({
  vista,
  porcentajes,
}: {
  vista: VistaPropuesta;
  porcentajes: Propuesta["revision"]["porcentajes"];
}) {
  const { cascada, impuesto } = vista;
  const simbolo = SIMBOLO[vista.moneda];

  // El simbolo va en CADA cifra, no solo en la cabecera de una columna. Es
  // un papel que se entrega a un tercero: el precio que va a pagar no puede
  // salir sin decir en que moneda esta.
  const dinero = (valor: string) => `${simbolo} ${decimal(valor)}`;

  /*
   * Las dos preguntas de dinero, resueltas RESTANDO y no con `Number`.
   *
   * Deciden que filas salen en el documento que se le manda al cliente: si
   * aparece la linea de descuento y si el precio de venta se ensena aparte
   * del valor de venta. `Number(a) !== Number(b)` sobre dos importes es el
   * error que `lib/decimal` existe para evitar, y aqui se cobraba caro por
   * partida doble: un descuento de cero podia salir impreso, y dos cifras
   * iguales escritas con distinto numero de decimales -«92000» y
   * «92000.00»- se enseñaban como si fueran distintas.
   */
  const hayDescuento = !esCero(cascada.descuento);
  const hayIgv = impuesto === "IGV";
  const hayRetencion = impuesto === "RENTA";
  const precioDistinto = !esCero(
    restar(cascada.precioVenta, cascada.valorVenta) ?? "0",
  );

  return (
    <section className="mt-4 break-inside-avoid">
      <div className="flex justify-end">
        <table className="w-96 border-collapse border border-black">
          <tbody>
            <Fila etiqueta="COSTO DIRECTO" importe={dinero(cascada.costoDirecto)} />
            <Fila
              etiqueta={`GASTOS GENERALES (${pct(porcentajes.gastosGenerales)})`}
              importe={dinero(cascada.gastosGenerales)}
            />
            <Fila
              etiqueta={`UTILIDAD (${pct(porcentajes.utilidad)})`}
              importe={dinero(cascada.utilidad)}
            />
            <Fila etiqueta="SUBTOTAL" importe={dinero(cascada.subtotal)} />
            {hayDescuento && (
              <Fila
                etiqueta={`DESCUENTO COMERCIAL (${pct(porcentajes.descuento)})`}
                importe={dinero(cascada.descuento)}
              />
            )}
            <Fila
              etiqueta="VALOR DE VENTA"
              importe={dinero(cascada.valorVenta)}
              destacado={!precioDistinto}
            />
            {hayIgv && (
              <Fila
                etiqueta={`IGV (${pct(vista.porcentajeIgv)})`}
                importe={dinero(cascada.igv)}
              />
            )}
            {precioDistinto && (
              <Fila
                etiqueta="PRECIO DE VENTA"
                importe={dinero(cascada.precioVenta)}
                destacado
              />
            )}
            {hayRetencion && (
              <Fila
                etiqueta={`RETENCIÓN DE RENTA (${pct(vista.porcentajeRetencion)})`}
                importe={dinero(cascada.retencionRenta)}
              />
            )}
            {hayRetencion && (
              <Fila etiqueta="NETO A RECIBIR" importe={dinero(cascada.netoARecibir)} />
            )}
          </tbody>
        </table>
      </div>

      {/* Un precio convertido sin decir a que cambio no hay forma de
          comprobarlo, y el cliente no puede cerrar el trato sobre el. */}
      {vista.moneda === "USD" && vista.tipoCambio !== null && (
        <p className="mt-2 text-right text-[10px]">
          Importes convertidos desde soles al tipo de cambio{" "}
          {vista.tipoCambio}.
        </p>
      )}

      {/* Por que no hay IGV. Sin esta linea, un cliente que compara dos
          propuestas piensa que falta un impuesto. */}
      {!hayIgv && (
        <p className="mt-2 text-right text-[10px]">
          {hayRetencion
            ? "Importes no afectos a IGV: se emite recibo por honorarios, sujeto a retención de renta de cuarta categoría."
            : "Importes no afectos a IGV."}
        </p>
      )}
    </section>
  );
}

function Fila({
  etiqueta,
  importe,
  destacado = false,
}: {
  etiqueta: string;
  importe: string;
  destacado?: boolean;
}) {
  return (
    <tr className={destacado ? "bg-neutral-100" : ""}>
      <td className="border border-black px-2 py-1 font-bold">{etiqueta}</td>
      <td
        className={`border border-black px-2 py-1 text-right font-mono ${destacado ? "text-sm font-bold" : ""}`}
      >
        {importe}
      </td>
    </tr>
  );
}

/** Bloque de texto libre que conserva los saltos de linea del original. */
function Parrafo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="break-inside-avoid">
      <p className="text-[10px] font-bold tracking-wide">{titulo}</p>
      <p className="whitespace-pre-line">{children}</p>
    </div>
  );
}

/**
 * El pie con la firma.
 *
 * Si no hay representante configurado se imprime igual la linea, con la razon
 * social debajo: un documento sin sitio donde firmar obliga a rehacerlo a
 * mano. Quien falte se rellena en /empresa/datos.
 */
function Firma({ emisor }: { emisor: EmisorPropuesta }) {
  return (
    <footer className="mt-16 flex justify-center break-inside-avoid">
      <div className="w-72 border-t border-black pt-1.5 text-center">
        <p className="font-bold">
          {emisor.representanteLegal ?? emisor.razonSocial}
        </p>
        {emisor.cargoRepresentante && <p>{emisor.cargoRepresentante}</p>}
      </div>
    </footer>
  );
}
