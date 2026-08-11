import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { obtenerPase } from "@/services/pase.service";
import { menuDePase } from "@/services/lookahead.service";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import { MenuEvidencia } from "@/components/evidencia/MenuEvidencia";
import { accionSalirDelPase } from "../acciones";
import { accionSubirEvidenciaConPase } from "./acciones";

/**
 * Cargar evidencia con un pase de obra.
 *
 * Es la MISMA lista que ve un usuario de GCM en `/obras/[id]/evidencia`
 * —mismo componente, misma forma de buscar y de bajar hasta la restriccion—
 * pero servida por la otra puerta. Que sea el mismo componente no es ahorro
 * de codigo: es que quien lleva la obra y quien esta en el andamio tienen que
 * ver lo mismo, o el residente no podra explicar por telefono donde hay que
 * tocar.
 */
export default async function CargarConPasePage({
  params,
}: {
  params: Promise<{ obraId: string }>;
}) {
  const { obraId } = await params;

  const pase = await obtenerPase(obraId);
  // Sin pase vigente, a la puerta. Cubre el caso de que lo hayan revocado
  // mientras la pestana seguia abierta, que en obra pasa.
  if (!pase) redirect(`/pase/${obraId}`);

  const datos = await menuDePase(pase);

  const etiquetaFlujo = Object.fromEntries(
    FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]),
  );

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Cargar evidencia</h1>
          <p className="mt-0.5 truncate text-sm opacity-70">{pase.nombre}</p>
        </div>

        <form action={accionSalirDelPase.bind(null, obraId)}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--borde)" }}
          >
            <LogOut className="size-4 opacity-70" aria-hidden="true" />
            Salir
          </button>
        </form>
      </header>

      <p className="mb-4 text-sm opacity-70">
        Elige el frente de trabajo y la restricción que estás documentando. La
        foto se reduce en tu propio teléfono antes de subirse, así que funciona
        con el dato móvil de la obra.
      </p>

      <MenuEvidencia
        obraId={obraId}
        datos={datos}
        etiquetaFlujo={etiquetaFlujo}
        accion={accionSubirEvidenciaConPase}
      />
    </>
  );
}
