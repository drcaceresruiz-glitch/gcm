import { NextResponse } from "next/server";
import { verificarSalud } from "@/services/salud.service";

/**
 * Comprobacion de salud.
 *
 * La usa el despliegue para confirmar que la version nueva quedo viva y
 * conectada. Nunca revela detalles del error al exterior: solo el estado.
 */
export const dynamic = "force-dynamic";

/**
 * Si lo que corre es lo que se subio.
 *
 * `desfasado` es el estado que el 2026-08-15 nadie pudo ver: el FTP habia
 * dejado `app.js` de la version nueva y el paquete seguia sin aplicarse, asi
 * que `/api/health` cantaba la version nueva mientras corria la vieja.
 *
 * `desconocida` cuando el paquete no trae su SHA —uno anterior a esta
 * comprobacion— porque no saberlo y estar al dia no son lo mismo, y decir
 * "ok" sin poder comprobarlo es como se pierde la siguiente media hora.
 */
function coherenciaDelDespliegue(
  paquete: string | null,
  arranque: string | null,
): "ok" | "desfasado" | "desconocida" {
  if (paquete === null || arranque === null) return "desconocida";
  return paquete === arranque ? "ok" : "desfasado";
}

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
      // `version` es el SHA del PAQUETE, o sea el codigo que de verdad corre.
      // Antes salia de `app.js` y eso engano: `app.js` lo deja el FTP en su
      // sitio ANTES de que nadie aplique el paquete, asi que decia la version
      // nueva mientras corria la vieja. Si el paquete no lo trae —uno anterior
      // a esta comprobacion— se cae al del arranque, que es lo unico que hay.
      version: salud.shaPaquete ?? salud.shaArranque ?? "dev",
      // El del punto de entrada, expuesto aparte para poder VER el hueco.
      arranque: salud.shaArranque ?? "dev",
      // La comparacion, ya hecha, porque nadie deberia tener que compararlas a
      // ojo: "desfasado" = el FTP dejo una version que todavia no se aplico.
      coherencia: coherenciaDelDespliegue(salud.shaPaquete, salud.shaArranque),
      // "pendiente" = hay un paquete subido que nadie aplico, o sea que esta
      // NO es la ultima version. Se dice aqui para poder saberlo con un curl,
      // sin entrar al servidor a mirar fechas de archivos.
      despliegue: salud.desplieguePendiente ? "pendiente" : "al dia",
      // "nunca" = falta crear la linea del cron en cPanel; "parado" = existe
      // y lleva media hora sin correr. Sin esto, unos avisos que no salen se
      // ven exactamente igual que unos avisos que no hacian falta.
      reloj: salud.reloj,
      // Cuantos correos hay en `GCM_OPERADORES`. El NUMERO, nunca los correos.
      // 0 = falta la variable y NADIE puede dar de alta constructoras, que es
      // un despliegue a medias imposible de ver de otra forma: `/operador`
      // devuelve al panel igual cuando falta la lista que cuando tu correo no
      // esta en ella. Con el numero se distinguen los dos casos.
      operadores: salud.operadores,
      // "falta" = no hay `CORREO_CLAVE_CIFRADO`, y entonces ninguna
      // constructora puede guardar su buzon propio Y la recogida de respuestas
      // de los contratistas no mira ningun buzon —sin quejarse—. El SI o NO,
      // nunca la frase: la llave no sale de aqui.
      cifrado: salud.cifradoConfigurado ? "configurado" : "falta",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
