import "server-only";

import { prisma } from "@/lib/prisma";
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
  type EncargoDirecto,
  type EstadoReloj,
  type MotivoAviso,
  type Persona,
} from "@/lib/avisos";
import {
  anclaDeHito,
  avisosDeHitos,
  type AvisoDeHito,
  type HitoParaAviso,
} from "@/lib/avisos-hitos";
import {
  avisoDeHitoEnBandeja,
  despacharLotes,
  entregarCorreo,
  entregarCorreoDeHito,
  entregarSms,
  entregarSmsDeHito,
  personasPorClave,
  repartoDeAviso,
  suscripcionesResueltas,
} from "@/services/avisos-envio";
import { avisarValorizacionesPendientes } from "@/services/avisos-valorizacion";
import { avisarNotasVencidas } from "@/services/avisos-notas";
import { avisarBolsaComprometida } from "@/services/avisos-bolsa";
import type { EventoAviso, TipoRestriccion } from "@/generated/prisma/enums";

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

export interface ResumenPasada {
  ok: boolean;
  obras: number;
  avisosApp: number;
  correos: number;
  sms: number;
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
      sms: 0,
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
  let sms = 0;
  let cortadaPorTiempo = false;
  let cursor = previa?.cursor ?? null;
  let error: string | null = null;

  try {
    // Solo obras que admiten cambios: una cerrada no tiene restricciones que
    // liberar, y avisar de ella seria ruido sobre trabajo terminado. Desde que
    // existen las copias de auditoria esto importa mas: sin el filtro, cargar
    // un respaldo pondria a la obra restaurada a mandar correos y SMS sobre
    // restricciones que se resolvieron —o no— hace meses.
    const todas = await prisma.project.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        companyId: true,
        nombreObra: true,
        // La cadencia de la obra: de ella cuelga, por herencia, la de cada
        // contratista que no tenga la suya. Ver `lib/cadencia-valorizacion`.
        diaCorteSemanal: true,
        estado: true,
        archivadaEn: true,
      },
    });
    // PARALIZADA sigue contando como viva para avisos: paralizar no apaga los
    // recordatorios de lo que ya estaba abierto (restricciones vencidas,
    // valorizaciones pendientes). Cambiar eso es un cambio de otro alcance.
    const vivas = todas.filter((o) => obraAdmiteCambios(o, { permiteEnParalizada: true }));

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
      sms += r.sms;
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
      avisosCreados: avisosApp + correos + sms,
      error: error?.slice(0, 300) ?? null,
    },
  });

  return {
    ok: error === null,
    obras: obrasVistas,
    avisosApp,
    correos,
    sms,
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
  /// ISO 1..7. La cadencia por defecto de las valorizaciones de la obra.
  diaCorteSemanal: number;
}

async function pasadaDeObra(
  obra: ObraDelReloj,
  ahora: Date,
  correosDisponibles: number,
): Promise<{ avisosApp: number; correos: number; sms: number }> {
  const nada = { avisosApp: 0, correos: 0, sms: 0 };

  const ajustes = await prisma.ajustesAvisosObra.findUnique({
    where: { projectId: obra.id },
    select: {
      activo: true,
      diasRecordatorio: true,
      horaResumen: true,
      maxSmsDia: true,
      createdAt: true,
    },
  });

  // El interruptor general de la obra apaga TODO lo que suena solo, la bolsa
  // incluida: si alguien apago los avisos, se apagaron.
  if (ajustes && !ajustes.activo) return nada;

  /**
   * LA BOLSA SE MIRA AUNQUE LA OBRA NUNCA HAYA CONFIGURADO NADA.
   *
   * Es la unica excepcion a la regla de abajo, y la justifica lo que dice el
   * aviso. El recordatorio y el resumen INSISTEN, asi que no se dan por
   * defecto: empezar a insistirle a quien no lo pidio es la forma mas rapida
   * de que apague los avisos enteros. Este suena como mucho dos veces en toda
   * la vida de la obra -al quedar poca bolsa y al acabarse- y lo que dice es
   * que la obra se esta quedando sin dinero. Callarlo hasta que alguien entre
   * a configurar una pantalla que no sabe que existe seria exactamente lo que
   * el usuario pidio evitar: «en vez de asumirlo a sabiendas».
   *
   * Se guarda su propio recuerdo en `EstadoBolsaObra` -tabla aparte- para no
   * tener que crear aqui la fila de ajustes, que encenderia de rebote todo lo
   * demas. Y solo rehace la cuenta cara cada seis horas.
   */
  const avisosBolsa = await avisarBolsaComprometida(
    { id: obra.id, companyId: obra.companyId },
    ahora,
  );

  // Sin fila, la obra nunca configuro nada, y el resto de los avisos no se dan
  // por defecto por lo que se acaba de explicar.
  if (!ajustes) return { ...nada, avisosApp: avisosBolsa };

  const umbral = ajustes.diasRecordatorio;

  // La primera pasada sobre una obra con cuarenta restricciones viejas
  // mandaria cuarenta recordatorios de golpe, y quien acaba de configurar los
  // avisos concluiria —con razon— que esto es spam.
  if (esEstreno(ajustes.createdAt, ahora, umbral)) {
    return { ...nada, avisosApp: avisosBolsa };
  }

  /**
   * Las notas con recordatorio vencido y sin atender.
   *
   * Va AQUI, antes de mirar hitos y restricciones, y no despues como
   * `avisarValorizacionesPendientes`: una nota no depende de que la obra
   * tenga ni un hito ni una restriccion abierta —hay obras que solo usan la
   * bitacora libre—, y colgarla del `if` de mas abajo la dejaria sin sonar
   * nunca en esas obras. Solo escribe en la campanita: no consume
   * presupuesto de correo ni de SMS.
   */
  const avisosNotas = await avisarNotasVencidas(
    { id: obra.id, companyId: obra.companyId },
    ahora,
  );

  const resueltas = await suscripcionesResueltas(obra.id);

  /**
   * Los hitos se miran AUNQUE la obra no tenga ni una suscripcion viva.
   *
   * Es la unica diferencia de fondo con las restricciones, y la justifica el
   * dato: un hito lleva el nombre de su responsable escrito encima, asi que
   * hay a quien escribir sin depender de que alguien acertara a configurar
   * una suscripcion. Callar la fecha comprometida de la obra porque nadie
   * configuro los avisos seria perder lo unico que hace util a un hito.
   */
  const hitos = await hitosQueTocanHoy(obra.id, ahora, umbral);

  const abiertas =
    resueltas.length === 0
      ? []
      : await prisma.restriccion.findMany({
          where: { resuelta: false, tarea: { projectId: obra.id } },
          select: {
            tipo: true,
            createdAt: true,
            fechaCompromiso: true,
            responsableUserId: true,
            responsableContactoId: true,
            tarea: { select: { uid: true } },
          },
        });

  // `avisosNotas` y `avisosBolsa` no son parte de `nada`: aunque no haya ni
  // hitos ni restricciones abiertas, ya pudo haber sonado un recordatorio de
  // nota o el aviso de la bolsa.
  if (hitos.length === 0 && abiertas.length === 0) {
    return { avisosApp: avisosNotas + avisosBolsa, correos: 0, sms: 0 };
  }

  const personas = await personasPorClave(obra.id);

  // Los hitos van POR DELANTE en el reparto del presupuesto de correos de la
  // pasada. Son pocos —dos o tres en una obra entera— y hablan de una fecha
  // que no vuelve; el recordatorio y el resumen de restricciones vuelven
  // manana. Si algo se queda fuera por tope, que sea lo que se repite.
  const porHitos = await despacharHitos(obra, hitos, resueltas, personas, {
    maxSmsDia: ajustes.maxSmsDia,
    correosDisponibles,
  });

  let avisosApp = porHitos.avisosApp + avisosNotas + avisosBolsa;
  let correos = porHitos.correos;
  let sms = porHitos.sms;

  /**
   * Las valorizaciones que tocaban y no constan.
   *
   * Va aqui dentro y no antes del `if (!ajustes || !ajustes.activo)`: el
   * interruptor de la obra apaga TODO lo que suena solo, y hacer una
   * excepcion con este seria justo lo que lleva a que alguien apague los
   * avisos enteros por no poder callar uno.
   *
   * Solo escribe en la campanita, asi que no consume presupuesto de correo ni
   * de SMS: se suma a `avisosApp` y no toca los otros dos contadores.
   */
  avisosApp += await avisarValorizacionesPendientes(
    {
      id: obra.id,
      companyId: obra.companyId,
      diaCorteSemanal: obra.diaCorteSemanal,
    },
    ahora,
  );

  if (abiertas.length === 0) return { avisosApp, correos, sms };

  const nombres = await nombresDeTareas(
    obra.id,
    abiertas.map((r) => r.tarea.uid),
  );

  const todos: MotivoAviso[] = abiertas.map((r) => ({
    uid: r.tarea.uid,
    tarea: nombres.get(r.tarea.uid) ?? `Tarea ${r.tarea.uid}`,
    tipo: r.tipo,
    diasAbierta: diasEntre(r.createdAt, ahora),
    fechaCompromiso: r.fechaCompromiso,
    // Negativo = ya se paso. Es lo que decide si el texto habla de la espera o
    // de la promesa rota.
    diasParaLaFecha: r.fechaCompromiso
      ? diasEntre(ahora, r.fechaCompromiso)
      : null,
  }));

  // A QUIEN LE TOCA, aunque no este suscrito a ese flujo.
  //
  // Una suscripcion es una regla general y depende de que alguien la
  // configurara bien; esto es una restriccion con el nombre de una persona
  // escrito encima. `repartirAvisos` funde las dos vias antes de armar los
  // lotes, asi que quien llegue por ambas recibe UN aviso con la union.
  const suyas = new Map<string, MotivoAviso[]>();

  abiertas.forEach((r, i) => {
    const clave = r.responsableUserId
      ? `u:${r.responsableUserId}`
      : r.responsableContactoId
        ? `c:${r.responsableContactoId}`
        : null;
    // Sin persona resoluble no hay a quien escribir: se dio de baja o se
    // desactivo despues de que le asignaran la restriccion. Lo cubre la
    // suscripcion por flujo, y el panel «Que falta» lo cuenta como sin
    // responsable.
    if (!clave || !personas.has(clave)) return;
    suyas.set(clave, [...(suyas.get(clave) ?? []), todos[i]!]);
  });

  /// Los encargos de un subconjunto de motivos. El SMS no se enciende solo:
  /// detras hay una SIM que se paga, y nadie pidio gastarla en su nombre.
  const encargosDe = (deEste: readonly MotivoAviso[]): EncargoDirecto[] => {
    const enJuego = new Set(deEste.map((m) => `${m.uid}:${m.tipo}`));
    return [...suyas.entries()].flatMap(([clave, ms]) => {
      const suyosAhora = ms.filter((m) => enJuego.has(`${m.uid}:${m.tipo}`));
      if (suyosAhora.length === 0) return [];
      return [
        {
          persona: personas.get(clave)!,
          motivos: suyosAhora,
          canales: { app: true, correo: true, sms: false },
        },
      ];
    });
  };

  // Recordatorio: lo que hoy toca por antiguedad, MAS lo que se prometio y ya
  // vencio. Lo segundo no espera al ciclo de N dias: una fecha pasada es una
  // conversacion pendiente hoy, no dentro de tres dias.
  const paraRecordar = todos.filter(
    (m) =>
      tocaRecordar(m.diasAbierta, umbral) ||
      (m.diasParaLaFecha !== null && m.diasParaLaFecha !== undefined && m.diasParaLaFecha < 0),
  );
  if (paraRecordar.length > 0) {
    const r = await despachar(obra, "RECORDAR", paraRecordar, resueltas, {
      maxSmsDia: ajustes.maxSmsDia,
      correosDisponibles: correosDisponibles - correos,
      directos: encargosDe(paraRecordar),
    });
    avisosApp += r.avisosApp;
    correos += r.correos;
    sms += r.sms;
  }

  // Resumen: una vez al dia, a partir de la hora que diga la obra.
  //
  // Aqui SIN encargos directos: el resumen es una foto del dia para quien
  // supervisa, y el responsable ya recibio el recordatorio de lo suyo. Volver
  // a escribirle por la tarde lo mismo que le llego por la manana es
  // exactamente como se ensena a la gente a no leer los avisos.
  if (ahora.getHours() >= ajustes.horaResumen) {
    const r = await despachar(obra, "RESUMEN", todos, resueltas, {
      maxSmsDia: ajustes.maxSmsDia,
      correosDisponibles: correosDisponibles - correos,
    });
    avisosApp += r.avisosApp;
    correos += r.correos;
    sms += r.sms;
  }

  return { avisosApp, correos, sms };
}

/**
 * Un evento por los tres canales.
 *
 * El reparto se calcula UNA vez y se reparte entre canales, en vez de uno por
 * canal: el tope de SMS degrada a correo lo que no cabe, y para saber si ese
 * correo ya iba a salir hay que tener delante el reparto entero.
 */
async function despachar(
  obra: ObraDelReloj,
  evento: EventoAviso,
  motivos: readonly MotivoAviso[],
  resueltas: Awaited<ReturnType<typeof suscripcionesResueltas>>,
  limites: {
    maxSmsDia: number;
    correosDisponibles: number;
    directos?: readonly EncargoDirecto[];
  },
): Promise<{ avisosApp: number; correos: number; sms: number }> {
  const dia = diaDeClave(new Date());
  const contexto = { companyId: obra.companyId, projectId: obra.id };

  const todos = await repartoDeAviso({
    projectId: obra.id,
    evento,
    motivos,
    resueltas,
    maxSmsDia: limites.maxSmsDia,
    dia,
    directos: limites.directos,
  });
  if (todos.length === 0) return { avisosApp: 0, correos: 0, sms: 0 };

  const comun = { contexto, evento, todos, dia };

  const avisosApp = await despacharLotes({
    ...comun,
    canal: "APP",
    entregar: (persona, suyos) => avisoEnBandeja(contexto, evento, persona, suyos),
  });

  const sms = await despacharLotes({
    ...comun,
    canal: "SMS",
    entregar: (persona, suyos) =>
      entregarSms(contexto, obra.nombreObra, persona, suyos),
  });

  // El correo va el ULTIMO y con el presupuesto que quede de la pasada: es el
  // unico canal lento —una conversacion SMTP por persona— y si algo se queda
  // fuera por tiempo, mejor que sea este y no la campanita ni el SMS.
  const correos =
    limites.correosDisponibles > 0
      ? await despacharLotes({
          ...comun,
          canal: "CORREO",
          tope: limites.correosDisponibles,
          entregar: (persona, suyos) =>
            entregarCorreo(contexto, obra.nombreObra, evento, persona, suyos),
        })
      : 0;

  return { avisosApp, correos, sms };
}

/**
 * Los hitos de la obra que HOY merecen un aviso.
 *
 * El nombre y la fecha no estan en `HitoObra` —solo el ancla y el
 * responsable—: viven en la fila del cronograma vigente, que es la que se
 * mueve cuando se replanifica. Por eso se leen de alli en cada pasada y no se
 * copian: un hito que se corrio tres dias tiene que avisar con la fecha nueva.
 *
 * Un hito cuya fila ya no esta en el cronograma vigente NO avisa. Pasa al
 * importar un corte nuevo, que sustituye las tareas enteras: sin fila no hay
 * ni nombre ni fecha, y avisar de una fecha inventada es peor que callar. El
 * `HitoObra` sigue ahi para cuando la fila vuelva.
 */
async function hitosQueTocanHoy(
  projectId: string,
  ahora: Date,
  umbral: number,
): Promise<AvisoDeHito[]> {
  const hitos = await prisma.hitoObra.findMany({
    where: { projectId },
    select: {
      uid: true,
      diasAviso: true,
      responsableUserId: true,
      responsableContactoId: true,
    },
  });
  if (hitos.length === 0) return [];

  const uids = hitos.map((h) => h.uid);

  const [vigente, avances] = await Promise.all([
    prisma.cronograma.findFirst({
      where: { projectId },
      orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
      select: {
        tareas: {
          where: { uid: { in: uids } },
          select: { uid: true, nombre: true, fin: true },
        },
      },
    }),
    prisma.avanceTarea.findMany({
      where: { projectId, uid: { in: uids } },
      select: { uid: true, porcentaje: true },
    }),
  ]);

  const filas = new Map((vigente?.tareas ?? []).map((t) => [t.uid, t]));

  // Un hito se da por cumplido al llegar al 100%: no tiene otra forma de
  // cerrarse —no lleva dinero ni duracion— y `avanceTarea` es donde se
  // reporta, sea a mano o al cerrar un Plan Semanal.
  const cumplidos = new Set(
    avances.filter((a) => Number(a.porcentaje) >= 100).map((a) => a.uid),
  );

  const paraDecidir: HitoParaAviso[] = hitos.flatMap((h) => {
    const fila = filas.get(h.uid);
    if (!fila) return [];

    return [
      {
        uid: h.uid,
        nombre: fila.nombre,
        // La fila se guardo a medianoche UTC, asi que esto devuelve el mismo
        // dia de calendario que se escribio.
        fecha: fila.fin.toISOString().slice(0, 10),
        diasAviso: h.diasAviso,
        cumplido: cumplidos.has(h.uid),
        responsableClave: h.responsableUserId
          ? `u:${h.responsableUserId}`
          : h.responsableContactoId
            ? `c:${h.responsableContactoId}`
            : null,
      },
    ];
  });

  return avisosDeHitos(paraDecidir, diaDeClave(ahora), umbral);
}

/**
 * Despacha los avisos de hito, UNO POR HITO.
 *
 * No se agrupan varios hitos en un mensaje, al reves que las restricciones, y
 * es por la clave que impide repetir: su ancla es `hito:uid:evento`, de un
 * solo hito. Agrupando dos en un aviso habria que inventar un ancla conjunta,
 * y entonces cumplir uno de los dos cambiaria la clave del otro y volveria a
 * sonar. Ademas un hito se lee de un vistazo —un nombre y una fecha— y dos
 * juntos ya no.
 *
 * El coste de no agrupar lo absorben los topes que ya estaban: el cuarto SMS
 * del dia de una persona **degrada a correo**, no se descarta.
 */
async function despacharHitos(
  obra: ObraDelReloj,
  avisos: readonly AvisoDeHito[],
  resueltas: Awaited<ReturnType<typeof suscripcionesResueltas>>,
  personas: ReadonlyMap<string, Persona>,
  limites: { maxSmsDia: number; correosDisponibles: number },
): Promise<{ avisosApp: number; correos: number; sms: number }> {
  let avisosApp = 0;
  let correos = 0;
  let sms = 0;

  if (avisos.length === 0) return { avisosApp, correos, sms };

  const dia = diaDeClave(new Date());
  const contexto = { companyId: obra.companyId, projectId: obra.id };

  for (const aviso of avisos) {
    /**
     * `MotivoAviso` exige un flujo y un hito no tiene ninguno. Da igual cual
     * se ponga —igual que en `motivosDeHechos` para las tareas que quedan
     * listas—: `seFiltraPorFlujo` no filtra los eventos de hito, el ancla de
     * la clave la pone `anclaDeHito`, y los textos de hito no lo miran.
     */
    const motivos: MotivoAviso[] = [
      {
        uid: aviso.uid,
        tarea: aviso.nombre,
        tipo: "INFORMACION" as TipoRestriccion,
        diasAbierta: Math.max(0, -aviso.diasParaLaFecha),
        diasParaLaFecha: aviso.diasParaLaFecha,
      },
    ];

    // Quien se hizo cargo, si sigue siendo alcanzable. Con clave y sin
    // persona significa que se dio de baja despues: la fila conserva la traza
    // —lo dice la pantalla— pero ya no hay a quien escribir, y lo recogen las
    // suscripciones de la obra.
    const responsable = aviso.responsableClave
      ? (personas.get(aviso.responsableClave) ?? null)
      : null;

    const todos = await repartoDeAviso({
      projectId: obra.id,
      evento: aviso.evento,
      motivos,
      resueltas,
      maxSmsDia: limites.maxSmsDia,
      dia,
      // El SMS nace apagado tambien aqui: detras hay una SIM que se paga, y
      // nadie pidio gastarla en su nombre. Quien quiera el hito por SMS lo
      // enciende en su suscripcion.
      directos: responsable
        ? [
            {
              persona: responsable,
              motivos,
              canales: { app: true, correo: true, sms: false },
            },
          ]
        : [],
    });
    if (todos.length === 0) continue;

    const comun = {
      contexto,
      evento: aviso.evento,
      todos,
      dia,
      ancla: anclaDeHito(aviso.uid, aviso.evento),
    };

    avisosApp += await despacharLotes({
      ...comun,
      canal: "APP",
      entregar: (persona) => avisoDeHitoEnBandeja(contexto, aviso, persona),
    });

    sms += await despacharLotes({
      ...comun,
      canal: "SMS",
      entregar: (persona) =>
        entregarSmsDeHito(contexto, obra.nombreObra, aviso, persona),
    });

    // El correo va el ULTIMO y con lo que quede del presupuesto de la pasada,
    // por lo mismo que en las restricciones: es el unico canal lento.
    const quedan = limites.correosDisponibles - correos;
    if (quedan > 0) {
      correos += await despacharLotes({
        ...comun,
        canal: "CORREO",
        tope: quedan,
        entregar: (persona) =>
          entregarCorreoDeHito(contexto, obra.nombreObra, aviso, persona),
      });
    }
  }

  return { avisosApp, correos, sms };
}

/// La campanita. Solo la tienen los usuarios de GCM; alguien de fuera no.
async function avisoEnBandeja(
  contexto: { companyId: string; projectId: string },
  evento: EventoAviso,
  persona: { clave: string },
  motivos: MotivoAviso[],
): Promise<boolean> {
  if (!persona.clave.startsWith("u:")) return false;

  const texto = textoAviso(evento, motivos);
  await prisma.aviso.create({
    data: {
      companyId: contexto.companyId,
      projectId: contexto.projectId,
      userId: persona.clave.slice(2),
      evento,
      titulo: texto.titulo.slice(0, 200),
      cuerpo: texto.cuerpo.slice(0, 400),
      camino: "/lookahead",
    },
  });
  return true;
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
