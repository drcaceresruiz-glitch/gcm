import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerLookahead } from "@/services/lookahead.service";
import { puede } from "@/lib/rbac";
import { env } from "@/lib/env";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import {
  enlaceEvidencia,
  enPaginas,
  normalizarModo,
  POR_PAGINA,
} from "@/lib/evidencia-qr";
import { BarraCodigos } from "@/components/evidencia/BarraCodigos";

export const metadata: Metadata = { title: "Códigos QR de evidencia" };

/**
 * La hoja de codigos QR para pegar en obra.
 *
 * Se imprime, se recorta y cada codigo va al frente de trabajo que le toca.
 * Quien esta ahi lo escanea y cae en el sitio exacto donde se adjunta la foto.
 *
 * Los codigos se dibujan EN EL SERVIDOR, como SVG. Es la unica forma de que la
 * hoja salga nitida en papel a cualquier tamano —un PNG escalado se emborrona
 * y el telefono deja de leerlo— y ademas evita cargar la libreria en el
 * navegador de un movil de obra.
 *
 * El enlace apunta a la aplicacion normal: sin sesion lleva al login. Un codigo
 * pegado en una columna no puede ser una puerta trasera a las fotos.
 */

const ETIQUETA_FLUJO = new Map(
  FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
);

interface Codigo {
  clave: string;
  /// Lo que se lee bajo el codigo: el frente de trabajo.
  titulo: string;
  /// Segunda linea: la restriccion concreta, cuando el codigo es de una.
  detalle: string | null;
  svg: string;
}

export default async function CodigosEvidenciaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ por?: string; semanas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { por, semanas } = await searchParams;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  // Quien imprime los codigos va a adjuntar evidencia: manda el permiso de
  // gestionar el Lookahead, no el de solo mirarlo.
  if (!puede(sesion, "lookahead:gestionar")) redirect(`/obras/${id}/lookahead`);

  const modo = normalizarModo(por);
  const datos = await obtenerLookahead(sesion, id, semanas);

  // Solo las tareas ya analizadas: una que nadie ha mirado no tiene
  // restricciones a las que colgar la foto, y su codigo llevaria a una fila
  // vacia. Se imprimen menos codigos que antes, y eso es la mejora: ya no
  // salen siete por tarea de los que la mayoria no se escanea nunca.
  const filas = (datos?.filas ?? []).filter((f) => f.fase !== "SIN_ANALIZAR");

  const codigos: Codigo[] = [];

  // Un solo codigo para toda la obra: el que se pega en la caseta. Lleva al
  // menu, donde se elige tarea y restriccion desde el propio telefono.
  if (modo === "obra") {
    codigos.push({
      clave: "obra",
      titulo: obra.nombreObra,
      detalle: "Escanea para cargar una foto de evidencia",
      svg: await QRCode.toString(
        enlaceEvidencia(env.APP_URL, id, { obra: true }),
        { type: "svg", margin: 1, errorCorrectionLevel: "M" },
      ),
    });
  }

  for (const fila of modo === "obra" ? [] : filas) {
    const nombre = `${fila.codigo ? `${fila.codigo} ` : ""}${fila.nombre}`;

    if (modo === "tarea") {
      codigos.push({
        clave: `t${fila.uid}`,
        titulo: nombre,
        detalle: null,
        svg: await QRCode.toString(
          enlaceEvidencia(env.APP_URL, id, { uid: fila.uid }),
          { type: "svg", margin: 1, errorCorrectionLevel: "M" },
        ),
      });
      continue;
    }

    for (const celda of fila.restricciones) {
      if (!celda.id) continue;
      codigos.push({
        clave: celda.id,
        titulo: nombre,
        detalle: ETIQUETA_FLUJO.get(celda.tipo) ?? celda.tipo,
        svg: await QRCode.toString(
          enlaceEvidencia(env.APP_URL, id, { restriccionId: celda.id }),
          { type: "svg", margin: 1, errorCorrectionLevel: "M" },
        ),
      });
    }
  }

  const paginas = enPaginas(codigos, POR_PAGINA[modo]);
  const columnas =
    modo === "obra"
      ? "grid-cols-1"
      : modo === "tarea"
        ? "grid-cols-3"
        : "grid-cols-4";

  return (
    <div>
      <BarraCodigos obraId={id} modo={modo} total={codigos.length} />

      {codigos.length === 0 ? (
        <p className="mx-auto max-w-[210mm] text-sm opacity-70">
          No hay restricciones que imprimir en esta ventana. Vuelve al
          Lookahead, elige las tareas y di{" "}
          <strong>qué flujos le aplican</strong> a cada una —el código QR cuelga
          de una restricción—, o amplía la ventana de semanas.
        </p>
      ) : (
        paginas.map((pagina, i) => (
          <section
            key={i}
            // Cada seccion es una hoja A4. El salto se fuerza ENTRE hojas y no
            // se deja a `break-inside` de cada tarjeta, que cada navegador
            // interpreta a su manera: un QR partido por la mitad no lo lee
            // ningun telefono.
            className="mx-auto mb-8 w-full max-w-[210mm] bg-white text-black print:mb-0"
            style={{
              breakAfter: i < paginas.length - 1 ? "page" : "auto",
              // Esta hoja se RECORTA con tijera. Con las variables del tema,
              // el borde sale casi blanco sobre papel blanco -y en modo
              // oscuro, gris sobre negro-. Se blinda como los otros dos
              // documentos que salen de la app en papel.
              colorScheme: "light",
            }}
          >
            <header
              className="mb-4 flex items-baseline justify-between gap-3 border-b border-black pb-2"
            >
              <div>
                <h1 className="text-base font-semibold">{obra.nombreObra}</h1>
                <p className="text-xs opacity-70">
                  Evidencia fotográfica · escanea y adjunta la foto
                </p>
              </div>
              <span className="text-xs tabular-nums opacity-60">
                Hoja {i + 1} de {paginas.length}
              </span>
            </header>

            <ul className={`grid ${columnas} gap-4`}>
              {pagina.map((c) => (
                <li
                  key={c.clave}
                  className={`flex break-inside-avoid flex-col items-center gap-1 rounded-lg border border-black p-2 text-center ${
                    // El de la obra va solo en la hoja, grande y centrado: se
                    // pega en la caseta y hay que poder escanearlo de lejos.
                    modo === "obra" ? "mx-auto max-w-[120mm] gap-3 p-6" : ""
                  }`}
                >
                  {/* SVG generado aqui a partir de nuestra propia URL, no de
                      texto de nadie: no hay nada que inyectar. */}
                  <div
                    className="w-full [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: c.svg }}
                  />
                  <p
                    className={
                      modo === "obra"
                        ? "text-lg font-semibold"
                        : "text-[11px] font-medium leading-tight"
                    }
                  >
                    {c.titulo}
                  </p>
                  {c.detalle && (
                    <p
                      className={
                        modo === "obra" ? "text-sm opacity-80" : "text-[10px] opacity-70"
                      }
                    >
                      {c.detalle}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
