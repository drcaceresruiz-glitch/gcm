import { Download, FileText, Printer, Scale, Sheet } from "lucide-react";

import { EnviarPresupuesto } from "./EnviarPresupuesto";

/**
 * Los tres presupuestos, para verlos, imprimirlos o guardarlos.
 *
 * El del cliente va PRIMERO y separado de los otros dos, que llevan el rotulo
 * de internos. No es decoracion: el contractual es el unico que puede salir
 * de la empresa, y los otros dos ensenan el costo y la bolsa. Poner los tres
 * en fila y con el mismo aspecto es como se adjunta el que no era.
 *
 * "Ver" abre el PDF en el navegador -de ahi se imprime con Ctrl+P- y
 * "Descargar" lo guarda. Es la misma ruta con distinto parametro: no hay dos
 * documentos que puedan decir cosas distintas.
 *
 * "Excel" es el MISMO presupuesto en hoja de calculo, con las cifras como
 * numero para poder trabajarlas. Sale de las mismas cifras que el PDF
 * -`presupuesto-documento.service`-, asi que los dos no pueden discrepar. Y
 * lleva el mismo rotulo de interno donde toca: un .xlsx se reenvia igual de
 * facil que un .pdf.
 */
export function DescargarPresupuestos({
  obraId,
  puedeVerCosto,
  puedeEnviar,
}: {
  obraId: string;
  /// `meta:leer`. Sin el solo se ofrece el contractual, que es lo unico que
  /// esa persona puede abrir -el servidor lo comprueba igual-.
  puedeVerCosto: boolean;
  /// Solo quien puede editar la obra manda su presupuesto a un cliente: es un
  /// acto contractual, no una lectura.
  puedeEnviar: boolean;
}) {
  const base = `/obras/${obraId}/presupuesto/pdf`;
  const hoja = `/obras/${obraId}/presupuesto/excel`;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Imprimir y descargar</h2>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Se generan en el momento con lo que hay ahora en la obra. No se
          guarda ninguna copia: un presupuesto guardado se queda viejo sin que
          nadie se entere.
        </p>
      </div>

      <Documento
        titulo="Presupuesto contractual"
        nota="Para el cliente. Partidas, metrados y precios pactados, sin ninguna cifra de costo."
        icono={<FileText className="size-4" aria-hidden="true" />}
        href={`${base}?doc=contractual`}
        excel={`${hoja}?doc=contractual`}
      />

      {puedeVerCosto && (
        <>
          <Documento
            titulo="Presupuesto meta"
            nota="Interno. Lo que cuesta construir la obra, sueldos y pólizas incluidos."
            interno
            icono={<FileText className="size-4" aria-hidden="true" />}
            href={`${base}?doc=meta`}
            excel={`${hoja}?doc=meta`}
          />
          <Documento
            titulo="Contractual frente a meta"
            nota="Interno. Los dos enfrentados línea a línea, con la bolsa de la obra."
            interno
            icono={<Scale className="size-4" aria-hidden="true" />}
            href={`${base}?doc=comparativa`}
            excel={`${hoja}?doc=comparativa`}
          />
        </>
      )}

      {puedeEnviar && <EnviarPresupuesto obraId={obraId} />}
    </section>
  );
}

function Documento({
  titulo,
  nota,
  href,
  excel,
  icono,
  interno,
}: {
  titulo: string;
  nota: string;
  href: string;
  /// La misma tabla en hoja de calculo. Mismo dato, otro envase.
  excel: string;
  icono: React.ReactNode;
  interno?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
      style={{
        borderColor: interno ? "var(--color-alerta)" : "var(--borde)",
      }}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          {icono}
          {titulo}
          {interno && (
            <span
              className="rounded px-1.5 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--color-alerta) 20%, transparent)",
              }}
            >
              interno
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-pretty opacity-70">{nota}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/*
          `target="_blank"` en el de VER y no en el de descargar: abrir el
          visor encima de la pantalla de la obra obliga a volver atras para
          seguir trabajando, y la descarga no navega a ningun sitio.
        */}
        <a
          href={`${href}&ver=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Printer className="size-4" aria-hidden="true" />
          Ver e imprimir
        </a>
        <a
          href={excel}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          <Sheet className="size-4" aria-hidden="true" />
          Excel
        </a>
        <a
          href={href}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          <Download className="size-4" aria-hidden="true" />
          Descargar PDF
        </a>
      </div>
    </div>
  );
}
