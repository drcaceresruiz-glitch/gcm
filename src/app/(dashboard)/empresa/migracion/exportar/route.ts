import { Readable } from "node:stream";

import { obtenerSesion } from "@/services/sesion.service";
import { exportarEmpresa } from "@/services/migracion-empresa.service";

/**
 * Descarga el archivo de migracion de la empresa.
 *
 * POST y no GET, y no es una formalidad: la frase que firma el archivo viaja
 * en el cuerpo. En un GET iria en la barra de direcciones, y de ahi al
 * historial del navegador, al registro del servidor y al «Enviar enlace».
 *
 * Ruta y no accion de servidor por lo mismo que el respaldo de obra: una
 * accion devuelve su resultado por el payload de React, y por ahi no caben
 * cientos de MB de fotos. La respuesta se TRANSMITE segun se arma el zip,
 * que en este hosting es lo que evita el corte por tiempo de espera.
 */
export async function POST(peticion: Request) {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const datos = await peticion.formData();
  const frase = String(datos.get("frase") ?? "");

  const resultado = await exportarEmpresa(sesion, frase);

  if (!resultado.ok) {
    // El texto sale del servicio: es el que explica si falta permiso, si la
    // frase es corta o si la empresa todavia no esta congelada.
    return new Response(resultado.error, { status: 400 });
  }

  const { archivo, nombreArchivo } = resultado.migracion;

  return new Response(
    Readable.toWeb(archivo as Readable) as ReadableStream<Uint8Array>,
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
        // Lleva la constructora entera: no se queda en ninguna cache.
        "Cache-Control": "no-store",
      },
    },
  );
}
