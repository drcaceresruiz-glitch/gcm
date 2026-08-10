import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra } from "@/services/obras.service";
import { obtenerLookahead } from "@/services/lookahead.service";
import { puede } from "@/lib/rbac";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import { MenuEvidencia } from "@/components/evidencia/MenuEvidencia";

export const metadata: Metadata = { title: "Cargar evidencia" };

/**
 * Donde aterriza el codigo QR de la obra.
 *
 * Es la pantalla del que esta A PIE DE OBRA con el telefono en una mano: una
 * sola pregunta, donde va esta foto, y el camino mas corto para responderla.
 * Por eso no reutiliza la matriz del Lookahead —siete columnas no se tocan con
 * el dedo— sino una lista que se va abriendo.
 *
 * Se entra por la puerta de siempre: si el QR se escanea sin sesion, el sistema
 * lleva al login y vuelve aqui. Un codigo pegado en una columna no abre nada
 * que no abriera ya la persona.
 */
export default async function EvidenciaObraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  /// La misma ventana que el Lookahead, por si se quiere alargar desde el
  /// telefono para alcanzar una tarea que aun no entra.
  searchParams: Promise<{ semanas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { semanas } = await searchParams;
  const obra = await obtenerObra(sesion, id);
  if (!obra) redirect("/panel");
  if (!puede(sesion, "lookahead:leer")) redirect(`/obras/${id}`);

  const datos = await obtenerLookahead(sesion, id, semanas);

  const etiquetaFlujo = Object.fromEntries(
    FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Cargar evidencia</h2>
        <p className="mt-0.5 max-w-2xl text-sm opacity-70">
          Elige el frente de trabajo y la restricción que estás documentando. La
          foto se reduce en tu propio teléfono antes de subirse, así que funciona
          con el dato móvil de la obra.
        </p>
      </div>

      {datos ? (
        <MenuEvidencia
          obraId={id}
          datos={datos}
          etiquetaFlujo={etiquetaFlujo}
        />
      ) : (
        <p className="text-sm opacity-70">
          No tienes permiso para ver el Lookahead de esta obra.
        </p>
      )}
    </div>
  );
}
