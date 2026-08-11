import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import {
  obraParaPase,
  obtenerPase,
  hayCodigoPendiente,
} from "@/services/pase.service";
import { FormularioPase } from "@/components/pase/FormularioPase";

/**
 * Donde aterriza el codigo QR de la caseta.
 *
 * Tres caminos, en este orden:
 *
 * 1. **Quien ya tiene sesion de GCM** no pasa por aqui: se le lleva a la
 *    pantalla de evidencia de siempre. El residente que escanea el mismo
 *    sticker que su ayudante no tiene por que pedirse un codigo a si mismo.
 * 2. **Quien ya tiene el telefono reconocido** entra directo a cargar. El
 *    reconocimiento dura lo que dure la obra: pedir codigo cada manana seria
 *    garantizar que nadie documenta nada.
 * 3. **El resto** se identifica y recibe su codigo.
 */
export default async function PasePage({
  params,
}: {
  params: Promise<{ obraId: string }>;
}) {
  const { obraId } = await params;

  // 1. Usuario de GCM: a la pantalla normal, que ademas puede mas cosas.
  const sesion = await obtenerSesion();
  if (sesion) redirect(`/obras/${obraId}/evidencia`);

  // 2. Pase ya reconocido en este telefono.
  const pase = await obtenerPase(obraId);
  if (pase) redirect(`/pase/${obraId}/cargar`);

  const obra = await obraParaPase(obraId);
  if (!obra) {
    // Obra inexistente, cerrada o de una empresa suspendida: el mismo texto
    // para los tres. Decir cual seria contar cosas de una obra ajena a quien
    // todavia no ha demostrado tener nada que ver con ella.
    return (
      <div className="flex flex-1 flex-col justify-center text-center">
        <h1 className="text-xl font-semibold">Este código ya no sirve</h1>
        <p className="mt-2 text-sm opacity-70">
          La obra no admite cargar evidencia. Pregunta a quien lleva la obra.
        </p>
      </div>
    );
  }

  return (
    <FormularioPase
      obraId={obraId}
      obra={obra.nombre}
      conCodigoPendiente={await hayCodigoPendiente()}
    />
  );
}
