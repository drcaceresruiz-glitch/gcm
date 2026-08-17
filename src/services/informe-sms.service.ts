import { prisma } from "@/lib/prisma";
import { componerInforme } from "./informe.service";
import { enviarSms, hayCanalSms } from "./sms.service";
import { textoSms } from "@/lib/informe-mensaje";
import { normalizarCelular } from "@/lib/contacto";
import { PRIORIDAD_AVISO } from "@/lib/sms-cola";
import type { SesionActiva } from "./sesion.service";

/**
 * Mandar el informe resumido por SMS.
 *
 * POR QUE UN SMS SI YA HAY CORREO: en obra hay sitios sin datos y gente que no
 * abre el correo. Un SMS de 160 caracteres llega donde no llega nada mas, y por
 * eso NO lleva enlace: seria inutil ahi y ademas las operadoras lo marcarian
 * como spam.
 *
 * El texto lo compone el SERVIDOR con `textoSms`, del mismo `componerInforme`
 * que alimenta la pantalla, el CSV, el PDF y el correo. Del formulario solo
 * vienen la obra, el corte y los numeros: ni una cifra.
 */

/// Cuantos numeros de una vez. Un informe se manda a la plana de la obra, no a
/// una lista de difusion; y cada SMS gasta saldo de una SIM de verdad.
export const MAX_NUMEROS_SMS = 10;

export type ResultadoEnvioSmsInforme =
  | { ok: true; enviados: number; total: number; texto: string }
  | { ok: false; error: string };

/**
 * Los celulares que escribio el usuario, en su forma canonica.
 *
 * Se rechaza el LOTE si uno esta mal, en vez de mandar a los buenos y callar:
 * quien escribe cinco numeros y ve «enviado» da por hecho que llegaron los
 * cinco. `normalizarCelular` es la misma que usa el resto de la aplicacion, asi
 * que aqui vale escribirlos con espacios o con el +51 delante.
 */
export function analizarNumeros(
  entrada: string,
): { ok: true; lista: string[] } | { ok: false; error: string } {
  const partes = entrada
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (partes.length === 0) return { ok: false, error: "Escribe al menos un celular." };

  const malos: string[] = [];
  const buenos = new Set<string>();

  for (const parte of partes) {
    const numero = normalizarCelular(parte);
    if (numero) buenos.add(numero);
    else malos.push(parte);
  }

  if (malos.length > 0) {
    return {
      ok: false,
      error: `No parecen celulares: ${malos.join(", ")}. Van nueve cifras, empezando por 9.`,
    };
  }

  if (buenos.size > MAX_NUMEROS_SMS) {
    return {
      ok: false,
      error: `Son ${buenos.size} numeros y el maximo es ${MAX_NUMEROS_SMS}.`,
    };
  }

  return { ok: true, lista: [...buenos] };
}

export async function enviarInformePorSms(
  sesion: SesionActiva,
  obraId: string,
  datos: { corteISO?: string; numeros: string },
): Promise<ResultadoEnvioSmsInforme> {
  const destinos = analizarNumeros(datos.numeros);
  if (!destinos.ok) return { ok: false, error: destinos.error };

  // El permiso lo comprueba `componerInforme`, igual que el correo: sacar el
  // informe de la aplicacion no puede ser mas facil que verlo dentro.
  const informe = await componerInforme(sesion, obraId, datos.corteISO);

  if (informe.estado === "sin-permiso") {
    return { ok: false, error: "No tienes permiso para ver este cronograma." };
  }
  if (informe.estado === "sin-obra") return { ok: false, error: "Obra no encontrada." };
  if (informe.estado === "sin-cronograma") {
    return { ok: false, error: "La obra todavía no tiene cronograma cargado." };
  }

  // Se pregunta ANTES de enviar para poder decir POR QUE no se pudo. Sin esto,
  // `enviarSms` se traga el fallo —hace bien: nunca tumba lo que lo llamo— y la
  // pantalla diria «enviado a 0» sin explicar nada.
  if (!(await hayCanalSms(sesion.companyId))) {
    return {
      ok: false,
      error:
        "Esta empresa todavía no tiene por dónde enviar SMS. " +
        "Hace falta vincular el teléfono emisor en Empresa → Configuración.",
    };
  }

  const texto = textoSms(informe.datos);

  // Prioridad de aviso, nunca la del codigo: un informe no puede adelantar en
  // la cola a un codigo de acceso que caduca en diez minutos.
  let enviados = 0;
  for (const numero of destinos.lista) {
    const r = await enviarSms(sesion.companyId, numero, texto, {
      projectId: obraId,
      prioridad: PRIORIDAD_AVISO,
    });
    if (r.enviado) enviados += 1;
  }

  // Misma constancia que el correo, y por el mismo motivo: «¿quien le mando
  // esto al cliente?» tiene que tener respuesta. CREATE sobre "EnvioInforme"
  // porque `AuditAction` no tiene un valor de «envio» y anadirlo exige una
  // migracion; queda anotado el canal para poder distinguirlos.
  //
  // El TEXTO se guarda entero: son 160 caracteres y es la unica forma de saber
  // que decia el mensaje que se mando, ya que no queda copia en ningun buzon.
  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      projectId: obraId,
      entidad: "EnvioInforme",
      entidadId: obraId,
      accion: "CREATE",
      despues: {
        canal: "SMS",
        corte: informe.datos.fechaCorte.toISOString().slice(0, 10),
        para: destinos.lista,
        enviados,
        texto,
      },
    },
  });

  return { ok: true, enviados, total: destinos.lista.length, texto };
}
