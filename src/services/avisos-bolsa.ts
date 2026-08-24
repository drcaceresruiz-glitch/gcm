import "server-only";

import { prisma } from "@/lib/prisma";
import {
  estadoDeLaBolsa,
  textoDelAviso,
  tocaAvisar,
  UMBRAL_BOLSA_POR_DEFECTO,
  type EstadoBolsa,
} from "@/lib/aviso-bolsa";
import { comparacionDeObra } from "@/services/meta.service";
import { bolsaComprometidaDe } from "@/services/adendas.service";

/**
 * El aviso de «a esta obra se le esta acabando la bolsa».
 *
 * PEDIDO ASI: «deberia haber avisos cuando la bolsa se vea comprometida, se
 * acerca o se pone en negativo, que permita configurar estos avisos. En vez de
 * asumirlo a sabiendas, que lo puede permitir».
 *
 * Hasta ahora la bolsa comprometida solo existia en la pantalla de la meta:
 * quien no entraba a mirarla no se enteraba de nada. Y es justo la cifra que
 * nadie mira todos los dias, porque baja despacio y de una en una: una adenda
 * aqui, un frente que se cierra por encima alla.
 *
 * ## Suena en el CRUCE, y por eso hace falta memoria
 *
 * La decision de forma la explica `lib/aviso-bolsa.ts`: se avisa cuando el
 * estado EMPEORA, una vez por escalon, y se rearma si la bolsa se recupera.
 * Eso obliga a recordar en que estado quedo la obra la ultima vez, y ese
 * recuerdo vive en `EstadoBolsaObra` -tabla propia: ver el comentario del
 * modelo para por que no son dos columnas de `AjustesAvisosObra`-.
 *
 * ## Y por eso mismo no se recalcula en cada pasada
 *
 * Es la cuenta mas cara de todo el reloj: cruza el presupuesto vigente entero
 * -linea base mas movimientos aprobados, partida a partida- con la meta
 * entera. En un hosting donde cargar el cronograma completo en una pantalla ya
 * tumbo produccion dos veces, hacerla cada pocos minutos por obra seria
 * repetir ese error a sabiendas.
 *
 * La bolsa no se mueve por minutos: se mueve cuando alguien firma algo. Asi
 * que se revisa como mucho cada `HORAS_ENTRE_REVISIONES`, y el resto de las
 * pasadas cuesta una lectura por clave primaria. El precio es que un aviso
 * puede tardar unas horas en salir; quien acaba de firmar la adenda ve la
 * bolsa moverse en pantalla al instante, y este aviso es la red para cuando no
 * hay nadie mirando.
 *
 * ## Solo campanita
 *
 * Como `NOTA_VENCIDA` y `VALORIZACION_PENDIENTE`. El correo y el SMS de la
 * obra tienen presupuesto por pasada y una SIM detras que se paga; y este
 * aviso, por definicion, no es urgente al minuto -lo urgente es la decision
 * que viene despues, y esa no se toma desde un SMS-.
 *
 * ## A quien
 *
 * A los RESIDENTES y ADMIN_OBRA asignados -mismo criterio que las notas- y
 * ADEMAS a quien responde del dinero de la empresa: ADMIN y GERENTE activos.
 * Es la diferencia con los otros avisos de obra, y la justifica el usuario al
 * pedirlo: la salida que propone -«que el residente pueda solicitar deducir de
 * los costos propios y se le presente al gerente»- necesita a los dos
 * enterados a la vez. Avisar solo a la obra dejaria a quien firma esperando a
 * que alguien le cuente.
 */

/// Cada cuanto se rehace la cuenta cara. Seis horas: la bolsa se mueve cuando
/// alguien firma algo, no sola.
export const HORAS_ENTRE_REVISIONES = 6;

const EVENTO: Record<Exclude<EstadoBolsa, "holgada">, "BOLSA_EN_RIESGO" | "BOLSA_EN_ROJO"> = {
  cerca: "BOLSA_EN_RIESGO",
  roja: "BOLSA_EN_ROJO",
};

interface ObraParaAvisar {
  id: string;
  companyId: string;
}

/**
 * La clave que impide repetir.
 *
 * NO lleva el dia dentro, al reves que la de las notas: este aviso no insiste
 * mientras dure la condicion, suena al cruzar. Lleva la fecha en formato
 * completo para que un rearme posterior -bolsa que se recupera y se vuelve a
 * romper- pueda volver a sonar sin chocar con la reserva de la vez anterior.
 */
function claveDeBolsa(estado: EstadoBolsa, momento: Date): string {
  return `bolsa:${estado}:${momento.toISOString()}`;
}

/**
 * Mira la bolsa de la obra y avisa si acaba de empeorar.
 *
 * Devuelve cuantos avisos creo, para el resumen de la pasada del reloj.
 */
export async function avisarBolsaComprometida(
  obra: ObraParaAvisar,
  ahora: Date,
): Promise<number> {
  const ajustes = await prisma.ajustesAvisosObra.findUnique({
    where: { projectId: obra.id },
    select: { activo: true, avisoBolsa: true, umbralBolsaPorcentaje: true },
  });

  /*
   * SIN FILA DE AJUSTES, SE AVISA IGUAL.
   *
   * Es la diferencia con el recordatorio y el resumen, que no se dan por
   * defecto porque insisten y empezar a insistirle a quien no lo pidio es la
   * forma mas rapida de que apague los avisos enteros. Este suena como mucho
   * dos veces en toda la vida de la obra, y lo que dice es que se esta
   * quedando sin dinero: callarlo hasta que alguien entre a configurar una
   * pantalla que no sabe que existe seria justo «asumirlo a sabiendas».
   *
   * El interruptor general de la obra SI lo apaga, como a todo lo demas: si
   * alguien apago los avisos, se apagaron.
   */
  if (ajustes && (!ajustes.activo || !ajustes.avisoBolsa)) return 0;
  const umbral = ajustes?.umbralBolsaPorcentaje ?? UMBRAL_BOLSA_POR_DEFECTO;

  const recordado = await prisma.estadoBolsaObra.findUnique({
    where: { projectId: obra.id },
    select: { revisadaAt: true, estadoAvisado: true },
  });

  if (recordado && !tocaRevisar(recordado.revisadaAt, ahora)) return 0;

  const bolsa = await medirLaBolsa(obra);
  // Sin meta, sin contractual o sin linea base no hay bolsa que medir. No se
  // apunta nada: cuando la obra complete su alta se mirara de cero, y un
  // estado inventado ahora bloquearia el primer aviso de verdad.
  if (!bolsa) return 0;

  const estado = estadoDeLaBolsa(bolsa.comprometida, bolsa.prevista, umbral);
  const suena = tocaAvisar(
    (recordado?.estadoAvisado as EstadoBolsa | null) ?? null,
    estado,
  );

  const creados = suena
    ? await escribirAviso(obra, estado, bolsa, ahora)
    : 0;

  /*
   * Se apunta SIEMPRE, suene o no.
   *
   * Cuando la bolsa mejora no se avisa -nadie necesita una campanita para una
   * buena noticia- pero hay que apuntar la mejora igual: es lo que rearma el
   * aviso para la proxima vez que se estropee. Sin esto, una obra que se pone
   * en rojo, se arregla y se vuelve a poner en rojo solo avisaria de la
   * primera vez, que es la menos grave de las dos.
   */
  const memoria = {
    estado,
    comprometida: bolsa.comprometida,
    prevista: bolsa.prevista,
    revisadaAt: ahora,
    ...(suena ? { avisadoAt: ahora, estadoAvisado: estado } : {}),
  };

  await prisma.estadoBolsaObra.upsert({
    where: { projectId: obra.id },
    create: { projectId: obra.id, ...memoria },
    update: memoria,
  });

  return creados;
}

function tocaRevisar(revisadaAt: Date, ahora: Date): boolean {
  const horas = (ahora.getTime() - revisadaAt.getTime()) / 3_600_000;
  return horas >= HORAS_ENTRE_REVISIONES;
}

interface CifrasBolsa {
  comprometida: string;
  prevista: string;
}

/**
 * Las dos cifras, por el MISMO camino que la pantalla.
 *
 * `comparacionDeObra` y `bolsaComprometidaDe` son las versiones sin sesion de
 * lo que pinta la pantalla de la meta. Escribir aqui una cuenta propia -aunque
 * fuera mas barata- seria volver a tener dos definiciones del mismo numero,
 * que es el fallo que este proyecto acaba de pasar un dia entero deshaciendo
 * con el comprometido.
 */
async function medirLaBolsa(obra: ObraParaAvisar): Promise<CifrasBolsa | null> {
  const comparacion = await comparacionDeObra(obra.companyId, obra.id);
  if (!comparacion.ok) return null;

  const prevista = comparacion.comparacion.bolsa.bolsaTotal;
  const comprometida = await bolsaComprometidaDe(
    obra.companyId,
    obra.id,
    prevista,
  );
  if (!comprometida) return null;

  return { comprometida: comprometida.comprometida, prevista };
}

async function escribirAviso(
  obra: ObraParaAvisar,
  estado: EstadoBolsa,
  bolsa: CifrasBolsa,
  ahora: Date,
): Promise<number> {
  if (estado === "holgada") return 0;

  const destinatarios = await aQuienSeAvisa(obra);
  if (destinatarios.length === 0) return 0;

  const evento = EVENTO[estado];

  // La reserva va ANTES de escribir: si dos pasadas se solapan, la segunda
  // choca contra la clave unica y no escribe nada. Mismo mecanismo que las
  // notas, las valorizaciones, los hitos y las restricciones.
  try {
    await prisma.envioAviso.create({
      data: {
        companyId: obra.companyId,
        projectId: obra.id,
        evento,
        canal: "APP",
        clave: claveDeBolsa(estado, ahora),
        destino: "campanita",
        enviado: true,
      },
    });
  } catch {
    return 0;
  }

  const { titulo, cuerpo } = textoDelAviso(
    estado,
    bolsa.comprometida,
    bolsa.prevista,
  );

  await prisma.aviso.createMany({
    data: destinatarios.map((userId) => ({
      companyId: obra.companyId,
      projectId: obra.id,
      userId,
      evento,
      titulo: titulo.slice(0, 200),
      cuerpo: cuerpo.slice(0, 400),
      // A la meta, que es donde esta la bolsa comprometida frente a frente y
      // se ve cual se la comio. No al tablero: alli sale el numero, pero no
      // con que decidir.
      camino: "/meta",
    })),
  });

  return destinatarios.length;
}

/**
 * Quien tiene que enterarse: la obra y quien firma.
 *
 * A diferencia de los otros avisos de obra, este sale TAMBIEN de la obra. La
 * salida que el propio usuario propuso al pedirlo -«que el residente pueda
 * solicitar deducir de los costos propios y se le presente al gerente
 * general»- necesita a los dos enterados a la vez; avisar solo a la obra
 * dejaria a quien tiene que firmar esperando a que alguien le cuente.
 *
 * Se devuelven ids UNICOS: un ADMIN que ademas esta asignado a la obra llega
 * por las dos vias y no puede recibir el aviso dos veces.
 */
async function aQuienSeAvisa(obra: ObraParaAvisar): Promise<string[]> {
  const [miembros, deLaEmpresa] = await Promise.all([
    prisma.projectMembership.findMany({
      where: {
        projectId: obra.id,
        role: { in: ["RESIDENTE", "ADMIN_OBRA"] },
        user: { estado: "ACTIVO" },
      },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: {
        companyId: obra.companyId,
        estado: "ACTIVO",
        role: { in: ["ADMIN", "GERENTE"] },
      },
      select: { id: true },
    }),
  ]);

  return [
    ...new Set([...miembros.map((m) => m.userId), ...deLaEmpresa.map((u) => u.id)]),
  ];
}
