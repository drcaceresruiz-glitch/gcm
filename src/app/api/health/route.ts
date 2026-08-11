import { NextResponse } from "next/server";
import { verificarSalud } from "@/services/salud.service";

/**
 * Comprobacion de salud.
 *
 * La usa el despliegue para confirmar que la version nueva quedo viva y
 * conectada. Nunca revela detalles del error al exterior: solo el estado.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const salud = await verificarSalud();

  if (!salud.baseDatosConectada) {
    return NextResponse.json(
      { estado: "error", baseDatos: "sin conexion" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      estado: "ok",
      baseDatos: "conectada",
      latenciaMs: salud.latenciaMs,
      version: process.env["BUILD_SHA"] ?? "dev",
      // "pendiente" = hay un paquete subido que nadie aplico, o sea que esta
      // NO es la ultima version. Se dice aqui para poder saberlo con un curl,
      // sin entrar al servidor a mirar fechas de archivos.
      despliegue: salud.desplieguePendiente ? "pendiente" : "al dia",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
