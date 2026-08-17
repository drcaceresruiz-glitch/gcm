import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { datosTablero } from "@/services/tablero.service";
import { COOKIE_TABLERO, modulosValidos } from "@/lib/tablero";
import { puede } from "@/lib/rbac";
import { Tablero } from "@/components/tablero/Tablero";

export const metadata: Metadata = { title: "Tablero" };

/**
 * El tablero de supervision de la obra.
 *
 * Vivio en el panel, con un desplegable para elegir obra. Ahora la obra sale
 * de la ruta, que es lo que siempre describieron sus modulos: todos hablan de
 * UNA obra.
 *
 * `datosTablero` recibe los modulos ENCENDIDOS y carga solo esos. Traer los de
 * los once tumbo produccion en agosto de 2026, asi que la cookie no es una
 * comodidad: es lo que sostiene el tiempo de carga de esta pantalla.
 */
export default async function TableroObraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;

  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  if (!puede(sesion, "obra:leer")) redirect(`/obras/${id}`);

  const modulos = modulosValidos((await cookies()).get(COOKIE_TABLERO)?.value);

  /**
   * Devuelve null si la obra no es de esta empresa, y `obtenerObra` ya lo
   * habria cortado antes con un 404. Se comprueba igual: manipular el id de la
   * URL no puede acabar en una pantalla a medio pintar.
   */
  const datos = await datosTablero(sesion, id, modulos);
  if (!datos) notFound();

  return <Tablero datos={datos} modulosIniciales={modulos} />;
}
