import { decimal, precio, metrado } from "@/utils/formato";
import { etiquetaImpuesto } from "@/lib/ordenes";
import type { OrdenImpresa } from "@/services/ordenes.service";

/**
 * La orden tal como se le manda al proveedor.
 *
 * Se imprime desde el navegador y no se genera en el servidor. En CloudLinux
 * no se pueden instalar modulos nativos —lo mismo que obligo al adaptador
 * puro de Prisma— asi que Chromium queda descartado, y con 20 Entry Processes
 * en el alojamiento compartido, componer PDF en Node saldria caro por cada
 * documento. El navegador ya sabe hacerlo, gratis y sin dependencias.
 *
 * NO usa las variables del tema. Un documento que sale a un tercero tiene que
 * imprimirse igual siempre; con `var(--fondo)` saldria en gris sobre negro
 * para quien tenga el modo oscuro puesto.
 */

interface Props {
  orden: OrdenImpresa;
}

const TITULO: Record<string, string> = {
  COMPRA: "ORDEN DE COMPRA",
  SERVICIO: "ORDEN DE SERVICIO",
};

const CUENTA: Record<string, string> = {
  AHORROS: "Ahorros",
  CORRIENTE: "Corriente",
};

const MONEDA: Record<string, string> = { PEN: "Soles", USD: "Dólares" };

export function DocumentoOrden({ orden }: Props) {
  const { emisor, proveedor } = orden;

  const fecha = orden.fecha.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

  const cuenta = [
    proveedor.banco,
    proveedor.tipoCuenta ? CUENTA[proveedor.tipoCuenta] : null,
    proveedor.monedaCuenta ? MONEDA[proveedor.monedaCuenta] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className="mx-auto w-full max-w-[210mm] bg-white p-10 text-[11px] leading-relaxed text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
      style={{ colorScheme: "light" }}
    >
      <Sello estado={orden.estado} />
      <Cabecera
        emisor={emisor}
        titulo={TITULO[orden.tipo] ?? "ORDEN"}
        numero={orden.numero}
        fecha={fecha}
      />

      <section className="mt-5 border border-black">
        <Dato etiqueta="EMPRESA / PERSONA">
          {proveedor.razonSocial}
          <span className="ml-3 font-normal">RUC: {proveedor.ruc}</span>
        </Dato>
        <Dato etiqueta="REFERENCIA">{orden.descripcion}</Dato>
        <Dato etiqueta="OBRA">
          {orden.obra.nombreObra}
          {orden.obra.cliente && (
            <span className="ml-3 font-normal">
              Cliente: {orden.obra.cliente}
            </span>
          )}
        </Dato>
        {orden.referencia && (
          <Dato etiqueta="EN ATENCIÓN A">{orden.referencia}</Dato>
        )}
      </section>

      {orden.lineas.length > 0 ? (
        <TablaLineas lineas={orden.lineas} />
      ) : (
        <p className="mt-5 border border-black px-2 py-3 text-center">
          Orden registrada solo por cabecera: el detalle está en el documento
          original del proveedor.
        </p>
      )}

      <Totales orden={orden} />

      <section className="mt-5 space-y-3 break-inside-avoid">
        {orden.formaPago && (
          <Parrafo titulo="FORMA DE PAGO">{orden.formaPago}</Parrafo>
        )}

        {(orden.observaciones || emisor.observacionesOrden) && (
          <Parrafo titulo="OBSERVACIONES">
            {[emisor.observacionesOrden, orden.observaciones]
              .filter(Boolean)
              .join("\n")}
          </Parrafo>
        )}

        {(cuenta || proveedor.cuentaBancaria || proveedor.cci) && (
          <Parrafo titulo="ABONAR A">
            {[
              cuenta,
              proveedor.cuentaBancaria && `Cta. ${proveedor.cuentaBancaria}`,
              proveedor.cci && `CCI ${proveedor.cci}`,
            ]
              .filter(Boolean)
              .join("\n")}
          </Parrafo>
        )}

        <Parrafo titulo="FACTURAR A">
          {`${emisor.razonSocial}\nRUC: ${emisor.ruc}${
            emisor.direccion ? `\n${emisor.direccion}` : ""
          }`}
        </Parrafo>
      </section>

      <Firma emisor={emisor} />
    </article>
  );
}

/**
 * Aviso de que el papel no vale.
 *
 * Se imprime, no solo se ve en pantalla: es justo cuando alguien manda por
 * correo el PDF de un borrador cuando hace falta que el propio documento
 * diga que todavia no compromete a nadie.
 */
function Sello({ estado }: { estado: string }) {
  if (estado === "APROBADA") return null;

  const texto =
    estado === "BORRADOR"
      ? "BORRADOR — no compromete presupuesto hasta que se apruebe"
      : "ANULADA — este pedido quedó sin efecto";

  return (
    <p className="mb-4 border-2 border-black px-3 py-2 text-center text-xs font-bold tracking-wide uppercase">
      {texto}
    </p>
  );
}

function Cabecera({
  emisor,
  titulo,
  numero,
  fecha,
}: {
  emisor: OrdenImpresa["emisor"];
  titulo: string;
  numero: string;
  fecha: string;
}) {
  const contacto = [emisor.telefono, emisor.email].filter(Boolean).join(" · ");

  return (
    <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
      <div>
        <p className="text-base font-bold tracking-tight uppercase">
          {emisor.razonSocial}
        </p>
        <p className="mt-0.5">RUC {emisor.ruc}</p>
        {emisor.direccion && <p>{emisor.direccion}</p>}
        {contacto && <p>{contacto}</p>}
      </div>

      <div className="shrink-0 border border-black px-4 py-2 text-right">
        <p className="text-sm font-bold tracking-wide">{titulo}</p>
        <p className="mt-1 font-mono text-sm font-bold">N° {numero}</p>
        <p className="mt-1">FECHA: {fecha}</p>
      </div>
    </header>
  );
}

/** Fila de dato con etiqueta a la izquierda, como en el papel del cliente. */
function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 border-b border-black px-2 py-1.5 last:border-b-0">
      <span className="w-36 shrink-0 font-bold">{etiqueta}:</span>
      <span className="font-bold">{children}</span>
    </div>
  );
}

/**
 * El detalle.
 *
 * Las lineas agrupadoras salen con fondo gris y sin cantidad ni precio. En el
 * papel del cliente van con el mismo aspecto que las demas, y eso invita a
 * sumar la columna y contar su dinero dos veces —el mismo tropiezo que el
 * Excel del presupuesto—. Aqui se dibujan como lo que son: el subtotal del
 * bloque que viene debajo.
 */
function TablaLineas({ lineas }: { lineas: OrdenImpresa["lineas"] }) {
  return (
    <table className="mt-5 w-full border-collapse border border-black">
      <thead>
        <tr className="bg-neutral-100 text-left">
          <Th className="w-16 text-right">CANT.</Th>
          <Th className="w-14">UND.</Th>
          <Th>DESCRIPCIÓN</Th>
          <Th className="w-24 text-right">P. UNIT.</Th>
          <Th className="w-28 text-right">IMPORTE</Th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((linea, i) => (
          <tr
            key={i}
            className={`break-inside-avoid ${linea.esAgrupador ? "bg-neutral-100 font-bold" : ""}`}
          >
            <Td className="text-right">
              {linea.esAgrupador ? "" : metrado(linea.cantidad, "")}
            </Td>
            <Td>{linea.esAgrupador ? "" : (linea.unidad ?? "")}</Td>
            <Td style={{ paddingLeft: `${0.5 + linea.nivel * 0.9}rem` }}>
              {linea.descripcion}
            </Td>
            <Td className="text-right">
              {linea.esAgrupador ? "" : precio(linea.precioUnitario, "")}
            </Td>
            <Td className="text-right">{decimal(linea.importe, "")}</Td>
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
 * La cascada del papel, en el orden en que la lee el proveedor.
 *
 * El descuento comercial solo aparece si lo hay: una linea "DESCUENTO 0.00"
 * hace dudar de si se olvido aplicarlo.
 */
function Totales({ orden }: { orden: OrdenImpresa }) {
  const hayDescuento = Number(orden.descuentoComercial) !== 0;

  return (
    <section className="mt-4 flex justify-end break-inside-avoid">
      <table className="w-72 border-collapse border border-black">
        <tbody>
          <Total etiqueta="SUB-TOTAL" importe={orden.subtotal} />
          {hayDescuento && (
            <Total
              etiqueta="DESCUENTO COMERCIAL"
              importe={orden.descuentoComercial}
            />
          )}
          {hayDescuento && <Total etiqueta="SUB-TOTAL" importe={orden.neto} />}
          {orden.tipoImpuesto !== "NINGUNO" && (
            <Total
              etiqueta={etiquetaImpuesto(orden.tipoImpuesto, orden)}
              importe={orden.impuesto}
            />
          )}
          <Total etiqueta="TOTAL" importe={orden.total} destacado />
        </tbody>
      </table>
    </section>
  );
}

function Total({
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
        {decimal(importe)}
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
 * mano. Quien falte se rellena en `/empresa/datos`.
 */
function Firma({ emisor }: { emisor: OrdenImpresa["emisor"] }) {
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
