import "server-only";

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { obraAdmiteCambios } from "@/lib/obras";
import {
  diaDeClave,
  diasEntre,
  esEstreno,
  estadoDelReloj,
  siguienteLote,
  textoAviso,
  tocaRecordar,
  MAX_CORREOS_POR_PASADA,
  MAX_OBRAS_POR_PASADA,
  type EstadoReloj,
  type MotivoAviso,
} from "@/lib/avisos";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import { enviarCorreo, correoRestricciones } from "@/services/mailer.service";
import { despacharPorCanal, suscripcionesResueltas } from "@/services/avisos-envio";
import type { EventoAviso } from "@/generated/prisma/enums";

/**
 * El reloj de los avisos: lo unico de GCM que corre solo.
 *
 * Lo llama un cron de cPanel contra `/api/avisos/reloj`, cada pocos minutos.
 * De aqui salen los dos momentos que nadie puede disparar desde una pantalla:
 * el recordatorio de lo que lleva dias sin levantarse y el repaso del dia.
 *
 * POR QUE NO CUELGA DE UNA ACCION DEL USUARIO
 *
 * `enviarCorreo` es sincrono y sin cola: treinta correos dentro de una accion
 * de servidor la dejarian esperando a treinta conversaciones SMTP, y LiteSpeed
 * corta mucho antes. Ademas, un recordatorio no lo provoca nadie: lo provoca
 * que pase el tiempo, y el tiempo no pulsa botones.
 *
 * POR QUE NO CUELGA DEL LATIDO DEL TELEFONO EMISOR
 *
 * Porque la purga de la cola de SMS ya cuelga de ahi y se acepto a sabiendas:
 * es limpieza, y que se retrase no rompe nada. Un aviso si. Si el movil de la
 * empresa se queda sin bateria, el dia que menos conviene es justo el dia que
 * no saldria ningun recordatorio.
 *
 * COMO SE TROCEA
 *
 * Unas pocas obras por pasada, con un cursor circular y un presupuesto de
 * tiempo. Recorrerlas todas en una peticion HTTP es exactamente lo que este
 * hosting corta.
 */

const CLAVE = "avisos";

/// Presupuesto de una pasada. Muy por debajo de lo que LiteSpeed tolera: se
/// comprueba ENTRE obras y se corta dejando el cursor puesto.
const PRESUPUESTO_MS = 20_000;

/// Una pasada que lleva mas de esto sin cerrar se da por muerta y se retoma.
/// Sin esta caducidad, un proceso que revienta a mitad bloquearia el reloj
/// para siempre —el mismo fallo que el candado de `desplegar.sh` ya tuvo—.
const PASADA_MUERTA_MS = PRESUPUESTO_MS * 3;

/// Cuantas filas de tarea caben en un correo antes de resumir ("y otras 30").
const MAX_LINEAS_CORREO = 25;

export interface ResumenPasada {
  ok: boolean;
  obras: number;
  avisosApp: number;
  correos: number;
  siguiente: string | null;
  cortadaPorTiempo: boolean;
  /// Otra pasada estaba corriendo: esta se declina sin hacer nada.
  solapada?: boolean;
  error?: string;
}

/** Cuando corrio por ultima vez, para poder decir que no esta corriendo. */
export async function estadoReloj(): Promise<{
  estado: EstadoReloj;
  ultima: Date | null;
}> {
  const fila = await prisma.relojTarea.findUnique({
    where: { clave: CLAVE },
    select: { terminadaAt: true, iniciadaAt: true },
  });
  const ultima = fila?.terminadaAt ?? fila?.iniciadaAt ?? null;
  return { estado: estadoDelReloj(ultima, new Date()), ultima };
}

/**
 * Una pasada del reloj.
 *
 * No recibe sesion: no la hay. Quien la autoriza es el token de la ruta, y el
 * alcance es toda la plataforma —por eso cada consulta lleva su `projectId` y
 * su `companyId` explicitos, y no se hereda ninguno—.
 */
export async function pasadaDelReloj(): Promise<ResumenPasada> {
  const inicio = Date.now();
  const ahora = new Date();

  const previa = await prisma.relojTarea.findUnique({ where: { clave: CLAVE } });

  const enCurso =
    previa !== null &&
    previa.terminadaAt === null &&
    ahora.getTime() - previa.iniciadaAt.getTime() < PASADA_MUERTA_MS;

  if (enCurso) {
    return {
      ok: true,
      obras: 0,
      avisosApp: 0,
      correos: 0,
      siguiente: previa.cursor,
      cortadaPorTiempo: false,
      solapada: true,
    };
  }

  await prisma.relojTarea.upsert({
    where: { clave: CLAVE },
    create: { clave: CLAVE, iniciadaAt: ahora },
    update: { iniciadaAt: ahora, terminadaAt: null, error: null },
  });

  let obrasVistas = 0;
  let avisosApp = 0;
  let correos = 0;
  let cortadaPorTiempo = false;
  let cursor = previa?.cursor ?? null;
  let error: string | null = null;

  try {
    // Solo obras que admiten cambios: una cerrada no tiene restricciones que
    // liberar, y avisar de ella seria ruido sobre trabajo terminado.
    const todas = await prisma.project.findMany({
      orderBy: { id: "asc" },
      select: { id: true, companyId: true, nombreObra: true, estado: true },
    });
    const vivas = todas.filter((o) => obraAdmiteCambios(o.estado));

    const { lote, siguiente } = siguienteLote(
      vivas,
      cursor,
      MAX_OBRAS_POR_PASADA,
    );
    cursor = siguiente;

    for (const obra of lote) {
      if (Date.now() - inicio > PRESUPUESTO_MS) {
        cortadaPorTiempo = true;
        break;
      }

      const r = await pasadaDeObra(obra, ahora, MAX_CORREOS_POR_PASADA - correos);
      obrasVistas += 1;
      avisosApp += r.avisosApp;
      correos += r.correos;
      // El cursor avanza obra a obra: si la siguiente revienta, lo ya hecho
      // no se repite.
      cursor = obra.id;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error("[reloj] La pasada fallo:", e);
  }

  // `terminadaAt` se escribe TAMBIEN cuando falla: una pasada que revienta y
  // deja esto en null bloquearia el reloj hasta que caduque.
  await prisma.relojTarea.update({
    where: { clave: CLAVE },
    data: {
      terminadaAt: new Date(),
      cursor,
      obrasVistas,
      avisosCreados: avisosApp + correos,
      error: error?.slice(0, 300) ?? null,
    },
  });

  return {
    ok: error === null,
    obras: obrasVistas,
    avisosApp,
    correos,
    siguiente: cursor,
    cortadaPorTiempo,
    ...(error ? { error } : {}),
  };
}

// ---------------------------------------------------------------------------

interface ObraDelReloj {
  id: string;
  companyId: string;
  nombreObra: string;
}

async function pasadaDeObra(
  obra: ObraDelReloj,
  ahora: Date,
  correosDisponibles: number,
): Promise<{ avisosApp: number; correos: number }> {
  const ajustes = await prisma.ajustesAvisosObra.findUnique({
    where: { projectId: obra.id },
    select: { activo: true, diasRecordatorio: true, horaResumen: true, createdAt: true },
  });

  // Sin fila, la obra nunca configuro nada. El recordatorio y el resumen NO se
  // dan por defecto: son los dos que insisten, y empezar a insistirle a quien
  // no lo pidio es la forma mas rapida de que apague los avisos enteros.
  if (!ajustes || !ajustes.activo) return { avisosApp: 0, correos: 0 };

  const umbral = ajustes.diasRecordatorio;

  // La primera pasada sobre una obra con cuarenta restricciones viejas
  // mandaria cuarenta recordatorios de golpe, y quien acaba de configurar los
  // avisos concluiria —con razon— que esto es spam.
  if (esEstreno(ajustes.createdAt, ahora, umbral)) {
    return { avisosApp: 0, correos: 0 };
  }

  const resueltas = await suscripcionesResueltas(obra.id);
  if (resueltas.length === 0) return { avisosApp: 0, correos: 0 };

  const abiertas = await prisma.restriccion.findMany({
    where: { resuelta: false, tarea: { projectId: obra.id } },
    select: {
      tipo: true,
      createdAt: true,
      tarea: { select: { uid: true } },
    },
  });
  if (abiertas.length === 0) return { avisosApp: 0, correos: 0 };

  const nombres = await nombresDeTareas(
    obra.id,
    abiertas.map((r) => r.tarea.uid),
  );

  const todos: MotivoAviso[] = abiertas.map((r) => ({
    uid: r.tarea.uid,
    tarea: nombres.get(r.tarea.uid) ?? `Tarea ${r.tarea.uid}`,
    tipo: r.tipo,
    diasAbierta: diasEntre(r.createdAt, ahora),
  }));

  let avisosApp = 0;
  let correos = 0;

  // Recordatorio: solo lo que hoy toca. Cada N dias, no todos los dias.
  const paraRecordar = todos.filter((m) => tocaRecordar(m.diasAbierta, umbral));
  if (paraRecordar.length > 0) {
    const r = await despachar(obra, "RECORDAR", paraRecordar, resueltas, {
      correosDisponibles: correosDisponibles - correos,
    });
    avisosApp += r.avisosApp;
    correos += r.correos;
  }

  // Resumen: una vez al dia, a partir de la hora que diga la obra.
  if (ahora.getHours() >= ajustes.horaResumen) {
    const r = await despachar(obra, "RESUMEN", todos, resueltas, {
      correosDisponibles: correosDisponibles - correos,
    });
    avisosApp += r.avisosApp;
    correos += r.correos;
  }

  return { avisosApp, correos };
}

async function despachar(
  obra: ObraDelReloj,
  evento: EventoAviso,
  motivos: readonly MotivoAviso[],
  resueltas: Awaited<ReturnType<typeof suscripcionesResueltas>>,
  limites: { correosDisponibles: number },
): Promise<{ avisosApp: number; correos: number }> {
  const dia = diaDeClave(new Date());

  const app = await despacharPorCanal({
    contexto: { companyId: obra.companyId, projectId: obra.id },
    evento,
    motivos,
    resueltas,
    canal: "APP",
    dia,
    entregar: async () => true,
  });

  let correos = 0;
  if (limites.correosDisponibles > 0) {
    const r = await despacharPorCanal({
      contexto: { companyId: obra.companyId, projectId: obra.id },
      evento,
      motivos,
      resueltas,
      canal: "CORREO",
      dia,
      tope: limites.correosDisponibles,
      entregar: async (persona, suyos) => {
        if (!persona.email) return false;

        const texto = textoAviso(evento, suyos);
        const enlace = `${env.APP_URL.replace(/\/$/, "")}/obras/${obra.id}/lookahead`;

        const { enviado } = await enviarCorreo({
          para: persona.email,
          ...correoRestricciones({
            nombre: persona.nombre,
            obra: obra.nombreObra,
            titulo: texto.titulo,
            cuerpo: texto.cuerpo,
            lineas: suyos.slice(0, MAX_LINEAS_CORREO).map((m) => ({
              tarea: m.tarea,
              flujo: etiqueta(m.tipo),
              dias: m.diasAbierta,
            })),
            masCuantas: Math.max(0, suyos.length - MAX_LINEAS_CORREO),
            enlace,
          }),
        });
        return enviado;
      },
    });
    correos = r;
  }

  return { avisosApp: app, correos };
}

const ETIQUETAS = new Map(FLUJOS_RESTRICCION.map((f) => [f.tipo, f.etiqueta]));
function etiqueta(tipo: MotivoAviso["tipo"]): string {
  return ETIQUETAS.get(tipo) ?? tipo;
}

/// Los nombres viven en el cronograma vigente: el Lookahead se ancla por uid.
async function nombresDeTareas(
  projectId: string,
  uids: readonly number[],
): Promise<Map<number, string>> {
  const lista = [...new Set(uids)];
  if (lista.length === 0) return new Map();

  const cronograma = await prisma.cronograma.findFirst({
    where: { projectId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: {
      tareas: {
        where: { uid: { in: lista } },
        select: { uid: true, codigo: true, nombre: true },
      },
    },
  });

  return new Map(
    (cronograma?.tareas ?? []).map((t) => [
      t.uid,
      `${t.codigo ? `${t.codigo} ` : ""}${t.nombre}`,
    ]),
  );
}
