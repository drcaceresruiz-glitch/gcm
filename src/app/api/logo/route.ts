import { obtenerSesion } from "@/services/sesion.service";
import { archivoLogo } from "@/services/logo.service";

/**
 * Sirve el logo de la empresa de quien pregunta.
 *
 * **No lleva id en la direccion, y eso es la mitad del diseno.** La empresa
 * sale de la SESION, no de la URL: asi no existe forma de pedir el logo de
 * otra constructora ni de averiguar cuales hay probando identificadores. Con
 * un `/api/logo/<companyId>` habria que comprobar en cada peticion que ese id
 * es el tuyo, y esa comprobacion es justo la que algun dia se olvida.
 *
 * El `?v=` que trae la pagina no se lee aqui: solo sirve para que el
 * navegador considere otra direccion cuando el logo cambia. Ver
 * `logoDeEmpresa`.
 */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion) return new Response("No autorizado", { status: 401 });

  const logo = await archivoLogo(sesion);
  if (!logo) return new Response("Sin logo", { status: 404 });

  return new Response(new Uint8Array(logo.contenido), {
    headers: {
      "Content-Type": logo.mime,
      // Un ano e inmutable, porque la direccion cambia con el hash cuando se
      // cambia el logo. Privada: es de esta empresa, no de una CDN.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
