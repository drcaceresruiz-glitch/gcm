import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desafioAbierto } from "@/services/dosFactores.service";
import { VIGENCIA_CODIGO_MINUTOS } from "@/lib/dosFactores";
import { FormularioCodigo } from "@/components/auth/FormularioCodigo";

export const metadata: Metadata = { title: "Verificación" };

/**
 * Segundo paso del acceso. Ruta publica en el proxy porque quien llega aqui
 * todavia NO tiene sesion: acerto la clave y nada mas.
 *
 * Sin desafio abierto no hay nada que verificar y se vuelve al login. Eso
 * cubre tanto a quien escribe la URL a mano como a quien deja la pestana
 * abierta hasta que el codigo caduca.
 */
export default async function VerificarCodigoPage() {
  const desafio = await desafioAbierto();
  if (!desafio) redirect("/login");

  return (
    <FormularioCodigo
      minutos={VIGENCIA_CODIGO_MINUTOS}
      canal={desafio.canal}
      destino={desafio.destinoTapado}
    />
  );
}
