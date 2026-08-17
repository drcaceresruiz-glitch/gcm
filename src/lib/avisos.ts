import type {
  CanalAviso,
  EventoAviso,
  Role,
  TipoRestriccion,
} from "@/generated/prisma/enums";
import { FLUJOS_RESTRICCION } from "@/lib/lookahead";
import { normalizarCelular, normalizarEmail } from "@/lib/contacto";

/**
 * Reglas de los avisos de restricciones, sin base de datos.
 *
 * Aqui vive TODO lo decidible: a quien le toca cada aviso, por donde le llega
 * de verdad, como se agrupa para no mandarle seis mensajes a la misma persona,
 * cuanto se puede gastar en SMS y cuando toca insistir. Vive en `lib/` y no en
 * el servicio por una razon concreta: en este proyecto **los servicios no
 * tienen tests**. Lo que se escriba alli no lo prueba nadie, y esto decide a
 * quien se molesta y cuanto dinero de la linea se gasta.
 *
 * El aviso existe porque GCM ya sabia las cosas y no las decia. El Pareto de
 * la primera obra real fue tajante: 5 de 5 incumplimientos por "prerrequisito
 * o tarea previa". No faltaba material ni cuadrilla; faltaba que alguien se
 * enterara con dias de margen, que es justo lo que el Lookahead calcula.
 */

// ---------------------------------------------------------------------------
// Formas
// ---------------------------------------------------------------------------

export const CANALES: readonly CanalAviso[] = ["APP", "CORREO", "SMS"];

export interface Canales {
  app: boolean;
  correo: boolean;
  sms: boolean;
}

/// Los cuatro momentos, cada uno por separado.
export interface Momentos {
  alAbrir: boolean;
  alRecordar: boolean;
  alQuedarLista: boolean;
  enResumen: boolean;
}

/// Una suscripcion tal como sale de la base, con el sujeto sin resolver.
export interface SuscripcionAviso {
  id: string;
  /// EXACTAMENTE uno de los tres tiene valor.
  userId: string | null;
  rol: Role | null;
  contactoId: string | null;
  /// Null = le interesan todos los flujos.
  tipo: TipoRestriccion | null;
  canales: Canales;
  momentos: Momentos;
}

/**
 * Alguien a quien se le puede escribir.
 *
 * Un usuario de GCM y un contacto de fuera se aplanan a la MISMA forma a
 * proposito: de aqui en adelante la diferencia solo importa para el canal APP,
 * y arrastrar dos tipos por todo el modulo duplicaria cada funcion.
 */
export interface Persona {
  /// Con que se agrupa: "u:<userId>" o "c:<contactoId>". El mismo humano
  /// alcanzado por dos suscripciones tiene la misma clave y recibe UN aviso.
  clave: string;
  nombre: string;
  email: string | null;
  celular: string | null;
  /// Para un usuario, que su celular este VERIFICADO. Para alguien de fuera,
  /// true si hay celular: lo normalizo el residente al darlo de alta y no hay
  /// a quien pedirle que se verifique.
  celularUtil: boolean;
  /// Solo los usuarios de GCM tienen campanita donde ensenarselo.
  tieneBandeja: boolean;
}

/// Lo que motiva un aviso: una restriccion concreta de una tarea concreta.
export interface MotivoAviso {
  uid: number;
  tarea: string;
  tipo: TipoRestriccion;
  /// Cuantos dias lleva abierta. 0 recien creada.
  diasAbierta: number;
  /**
   * Para cuando se prometio levantarla, si alguien lo prometio.
   *
   * Cambia el texto entero del aviso: no es lo mismo «te espera una
   * restriccion» que «se paso la fecha que prometiste». Lo segundo es la
   * conversacion que destraba la obra, y sin este dato no se puede decir.
   */
  fechaCompromiso?: Date | null;
  /// Dias que quedan (o que se pasaron, en negativo) hasta esa fecha.
  diasParaLaFecha?: number | null;
}

/// Un aviso ya repartido: a esta persona, por este canal, por esto.
export interface Lote {
  persona: Persona;
  canal: CanalAviso;
  motivos: MotivoAviso[];
}

/**
 * Lo que le toca a alguien PORQUE SE HIZO CARGO, no porque este suscrito.
 *
 * Una suscripcion es una regla general —«avisame de todo lo de MATERIALES en
 * esta obra»— y depende de que alguien la configurara bien. Un encargo directo
 * es lo contrario: esta restriccion concreta tiene el nombre de esta persona
 * escrito encima, con su fecha. Es mas preciso y no se puede olvidar de
 * configurar.
 *
 * Sus motivos vienen YA ACOTADOS por quien lo construye: son los suyos, no el
 * lote entero. Por eso no pasan por `cubreFlujo` —a quien se hizo cargo no se
 * le pregunta si le interesa ese flujo— ni por `quiereEvento`, que es una
 * preferencia de suscripcion y aqui no hay suscripcion.
 */
export interface EncargoDirecto {
  persona: Persona;
  /// SOLO las restricciones de esta persona.
  motivos: MotivoAviso[];
  /**
   * Por donde. Quien construye el encargo decide, porque no hay suscripcion
   * que lo diga.
   *
   * El SMS **por defecto no**, igual que en `SuscripcionAviso.porSms`: detras
   * hay una SIM que se paga, y encender un gasto en nombre de alguien que no
   * lo pidio es la clase de sorpresa que hace que se apaguen los avisos
   * enteros.
   */
  canales: Canales;
}

/// Una suscripcion con sus personas ya resueltas por el servicio. Varias
/// cuando el sujeto es un ROL: todos los que lo tienen EN ESA OBRA.
export interface SuscripcionResuelta {
  suscripcion: SuscripcionAviso;
  personas: Persona[];
}

// ---------------------------------------------------------------------------
// Que quiere cada suscripcion
// ---------------------------------------------------------------------------

/** Si esta suscripcion pidio enterarse de este momento. */
export function quiereEvento(s: SuscripcionAviso, evento: EventoAviso): boolean {
  switch (evento) {
    case "ABRIR":
      return s.momentos.alAbrir;
    case "RECORDAR":
      return s.momentos.alRecordar;
    case "LISTA":
      return s.momentos.alQuedarLista;
    case "RESUMEN":
      return s.momentos.enResumen;
    /**
     * Los hitos NO tienen interruptor propio, y es a proposito.
     *
     * Los cuatro momentos de arriba son del Lookahead: dicen de que parte del
     * analisis de restricciones quiere enterarse cada quien. Un hito es otra
     * cosa —la fecha comprometida de la obra— y quien esta suscrito a los
     * avisos de una obra quiere saber que una fecha clave se le echa encima.
     *
     * Anadir un quinto interruptor sonaria a completitud y seria una trampa:
     * nace apagado o encendido, y en cualquiera de los dos casos alguien se
     * entera tarde de que existia. Si algun dia estorban, se apagan con
     * `AjustesAvisosObra.activo`, que ya apaga todo lo de la obra.
     */
    case "HITO_CERCA":
    case "HITO_VENCIDO":
      return true;
    default:
      return false;
  }
}

/** Si le interesa este flujo. `tipo: null` en la suscripcion = todos. */
export function cubreFlujo(s: SuscripcionAviso, tipo: TipoRestriccion): boolean {
  return s.tipo === null || s.tipo === tipo;
}

/**
 * Si este momento se filtra por flujo.
 *
 * "Quedo lista" NO se filtra: es de la TAREA, no de un flujo. Quien estaba
 * esperando el fierro tambien quiere saber que ya se puede empezar, y
 * filtrarlo significaria que solo se entera quien responde del ultimo flujo
 * que se levanto —que es justo el que ya lo sabia—.
 */
export function seFiltraPorFlujo(evento: EventoAviso): boolean {
  // Los hitos tampoco, y por una razon mas fuerte: un hito NO TIENE flujo. No
  // es que no convenga filtrarlo, es que no hay por que filtrarlo, y dejarlo
  // pasar por el filtro lo compararia contra un tipo que no existe —con lo que
  // no le llegaria a nadie que tuviera la suscripcion acotada a un flujo—.
  return evento !== "LISTA" && evento !== "HITO_CERCA" && evento !== "HITO_VENCIDO";
}

/**
 * Por donde le llega DE VERDAD a esta persona.
 *
 * Misma doctrina que `canalEfectivo` del segundo factor, y por la misma razon:
 * **el fallo seguro es "te llega por correo", nunca "no te llega"**.
 *
 * - APP solo si tiene bandeja. Pedirsela a alguien de fuera seria escribir un
 *   aviso que nadie va a mirar jamas.
 * - SMS solo si el celular sirve. Si se pidio y no se puede, CAE AL CORREO
 *   aunque el correo no se hubiera pedido: quedarse callado es peor.
 * - Si no queda ninguno, la persona no recibe nada y hay que poder DECIRLO:
 *   un destinatario que no recibe es una fila muerta, y en la pantalla parece
 *   que esta cubierto cuando no lo esta.
 */
export function canalesEfectivos(
  persona: Persona,
  pedidos: Canales,
): { canales: CanalAviso[]; sinCanal: boolean } {
  const salida = new Set<CanalAviso>();

  if (pedidos.app && persona.tieneBandeja) salida.add("APP");
  if (pedidos.correo && persona.email) salida.add("CORREO");
  if (pedidos.sms) {
    if (persona.celular && persona.celularUtil) salida.add("SMS");
    else if (persona.email) salida.add("CORREO");
  }

  const canales = CANALES.filter((c) => salida.has(c));
  return { canales, sinCanal: canales.length === 0 };
}

// ---------------------------------------------------------------------------
// El reparto
// ---------------------------------------------------------------------------

/**
 * A quien le toca cada motivo, AGRUPADO POR PERSONA Y CANAL.
 *
 * Es la funcion que sostiene todo lo demas. Sin ella, analizar diez tareas
 * mandaria un SMS por restriccion —cuarenta— a una SIM personal, que es
 * exactamente lo que una operadora corta por antispam y que ademas se cobra
 * uno a uno. Con ella, cada persona recibe UN mensaje que resume lo suyo.
 *
 * Una persona alcanzada por dos suscripciones —por su nombre y por su rol—
 * aparece UNA vez, con la union de sus canales y de sus motivos. Si se
 * duplicara, el residente que ademas esta en la lista de la obra lo recibiria
 * todo dos veces y dejaria de leerlo en una semana.
 */
export function repartirAvisos(
  resueltas: readonly SuscripcionResuelta[],
  motivos: readonly MotivoAviso[],
  evento: EventoAviso,
  directos: readonly EncargoDirecto[] = [],
): Lote[] {
  /// clave de persona -> canal -> motivos sin repetir
  const porPersona = new Map<
    string,
    { persona: Persona; porCanal: Map<CanalAviso, Map<string, MotivoAviso>> }
  >();

  /// Acumula unos motivos en la cuenta de una persona, por canal.
  ///
  /// Aqui es donde se funden las dos vias —la suscripcion y el encargo
  /// directo—, y tiene que ser ANTES de construir los lotes. Si cada via
  /// produjera su propio lote, quien llegue por las dos recibiria dos avisos,
  /// y ademas con claves de `EnvioAviso` distintas, asi que la reserva no
  /// podria evitarlo. Fundiendolos aqui, recibe UNO con la union de todo.
  function acumular(
    persona: Persona,
    canales: readonly CanalAviso[],
    suyos: readonly MotivoAviso[],
  ): void {
    if (canales.length === 0 || suyos.length === 0) return;

    const entrada =
      porPersona.get(persona.clave) ??
      { persona, porCanal: new Map<CanalAviso, Map<string, MotivoAviso>>() };

    for (const canal of canales) {
      const acumulado = entrada.porCanal.get(canal) ?? new Map<string, MotivoAviso>();
      for (const m of suyos) acumulado.set(`${m.uid}:${m.tipo}`, m);
      entrada.porCanal.set(canal, acumulado);
    }
    porPersona.set(persona.clave, entrada);
  }

  for (const { suscripcion, personas } of resueltas) {
    if (!quiereEvento(suscripcion, evento)) continue;

    const suyos = seFiltraPorFlujo(evento)
      ? motivos.filter((m) => cubreFlujo(suscripcion, m.tipo))
      : [...motivos];
    if (suyos.length === 0) continue;

    for (const persona of personas) {
      const { canales } = canalesEfectivos(persona, suscripcion.canales);
      acumular(persona, canales, suyos);
    }
  }

  // Los encargos directos van DESPUES y no pasan por `cubreFlujo`: a quien se
  // hizo cargo de una restriccion no se le pregunta si esta suscrito a ese
  // flujo. Se hizo cargo, y punto.
  for (const d of directos) {
    const { canales } = canalesEfectivos(d.persona, d.canales);
    acumular(d.persona, canales, d.motivos);
  }

  const lotes: Lote[] = [];
  for (const { persona, porCanal } of porPersona.values()) {
    for (const canal of CANALES) {
      const motivosDelCanal = porCanal.get(canal);
      if (!motivosDelCanal) continue;
      lotes.push({
        persona,
        canal,
        motivos: ordenarMotivos([...motivosDelCanal.values()]),
      });
    }
  }
  return lotes;
}

/// Lo mas antiguo primero: lo que lleva mas dias abierto es lo que arde.
function ordenarMotivos(motivos: MotivoAviso[]): MotivoAviso[] {
  return [...motivos].sort(
    (a, b) => b.diasAbierta - a.diasAbierta || a.uid - b.uid,
  );
}

// ---------------------------------------------------------------------------
// Cuando toca insistir
// ---------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias de calendario entre dos fechas, sin mirar la hora. */
export function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Math.floor((b - a) / DIA_MS);
}

/**
 * Si hoy toca insistir con una restriccion abierta.
 *
 * Cada N dias, no todos los dias a partir del N: un recordatorio diario se
 * ignora a la semana y molesta desde el segundo. El dia 0 no toca nunca —de
 * eso ya avisa el evento de apertura—.
 */
export function tocaRecordar(diasAbierta: number, umbral: number): boolean {
  if (umbral <= 0) return false;
  if (diasAbierta <= 0) return false;
  return diasAbierta % umbral === 0;
}

/**
 * Si la obra acaba de configurar sus avisos y aun no debe disparar la historia.
 *
 * Sin esto, la PRIMERA pasada sobre una obra con cuarenta restricciones
 * abiertas de hace meses mandaria cuarenta recordatorios de golpe, y quien
 * acaba de configurar los avisos concluiria —con razon— que esto es spam y lo
 * apagaria el primer dia. Se deja pasar un ciclo entero de recordatorio antes
 * de empezar a insistir.
 */
export function esEstreno(
  configuradaAt: Date,
  ahora: Date,
  umbralDias: number,
): boolean {
  return diasEntre(configuradaAt, ahora) < umbralDias;
}

// ---------------------------------------------------------------------------
// La clave que impide repetir
// ---------------------------------------------------------------------------

/// Mas largo que la columna `EnvioAviso.clave`.
const LARGO_CLAVE = 120;

/**
 * La clave con la que se reserva un envio ANTES de mandarlo.
 *
 * Es lo unico que impide que dos pasadas solapadas del cron manden el mismo
 * correo dos veces, y que un cron que estuvo tres horas caido suelte tres
 * horas de avisos de golpe al volver.
 *
 * Lleva el dia dentro SOLO cuando el aviso se repite —recordatorio, resumen—.
 * Los de una sola vez (se abrio, quedo lista) no lo llevan: si lo llevaran, el
 * mismo aviso volveria a salir cada dia.
 */
export function claveDeAviso(
  evento: EventoAviso,
  ancla: string,
  personaClave: string,
  dia?: string,
): string {
  const repetible = evento === "RECORDAR" || evento === "RESUMEN";
  const partes = [evento, ancla, personaClave];
  if (repetible) partes.push(dia ?? "");
  return partes.join("|").slice(0, LARGO_CLAVE);
}

/** El dia en formato estable para la clave, en hora de la obra. */
export function diaDeClave(fecha: Date): string {
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Los topes
// ---------------------------------------------------------------------------

/**
 * Cuantos SMS de aviso puede recibir UNA persona al dia.
 *
 * Tres. El cuarto SMS del mismo dia ya no informa: entrena a ignorarlos. Al
 * pasarse el aviso NO se pierde, cae al correo.
 */
export const MAX_SMS_POR_PERSONA_DIA = 3;

/**
 * Cuantos SMS encola el reloj en UNA pasada, pase lo que pase.
 *
 * Este es el hueco que hoy no existe en la cola. `MAXIMO_POR_ENTREGA = 5` en
 * `@/lib/sms-cola` limita cuantos se le ENTREGAN al telefono de golpe, no
 * cuantos se meten en la cola. Sin este tope, una obra atascada llena la cola
 * de doscientos mensajes que el telefono suelta de cinco en cinco durante una
 * hora —o que caducan a los diez minutos, que es peor: se cobran cero pero
 * tambien llegan cero—.
 */
export const MAX_SMS_POR_PASADA = 10;

/// Cuantos correos por pasada. Es techo de TIEMPO, no de coste: nodemailer es
/// sincrono y LiteSpeed corta lo lento.
export const MAX_CORREOS_POR_PASADA = 40;

export interface Topes {
  /// SMS que puede recibir una persona hoy.
  porPersonaDia: number;
  /// SMS que puede gastar la obra hoy.
  porObraDia: number;
  /// SMS que se encolan en esta pasada.
  porPasada: number;
}

export interface Gastado {
  /// clave de persona -> SMS que ya recibio hoy.
  porPersona: ReadonlyMap<string, number>;
  /// SMS que la obra lleva hoy.
  porObra: number;
}

export interface Degradado {
  clave: string;
  motivo: "tope-persona" | "tope-obra" | "tope-pasada";
}

export interface Acotado {
  /// Lo que se manda, ya con los canales corregidos.
  lotes: Lote[];
  /// Los que pasaron de SMS a correo, con el motivo. Se dice, no se calla.
  degradados: Degradado[];
  /// Los que se quedaron sin ningun canal. Son los que hay que ver.
  descartados: Degradado[];
}

/**
 * Aplica los topes de SMS DEGRADANDO, no descartando.
 *
 * Un lote de SMS que no cabe se convierte en lote de CORREO si la persona
 * tiene correo. Solo se descarta de verdad cuando no queda ningun canal, y
 * entonces queda escrito el motivo para que la pantalla pueda decirlo.
 *
 * Es la misma doctrina de `canalEfectivo`: pasarse de presupuesto no puede
 * significar que alguien no se entere, solo que se entere por otro sitio.
 *
 * Los lotes llegan ordenados por urgencia, asi que se recorta por el final:
 * lo primero es lo que mas dias lleva abierto.
 */
export function acotarPorTope(
  lotes: readonly Lote[],
  gastado: Gastado,
  topes: Topes,
): Acotado {
  let enLaPasada = 0;
  let enLaObra = gastado.porObra;
  const porPersona = new Map(gastado.porPersona);

  const salida: Lote[] = [];
  const degradados: Degradado[] = [];
  const descartados: Degradado[] = [];

  for (const lote of lotes) {
    if (lote.canal !== "SMS") {
      salida.push(lote);
      continue;
    }

    const yaTiene = porPersona.get(lote.persona.clave) ?? 0;

    const motivo: Degradado["motivo"] | null =
      yaTiene >= topes.porPersonaDia
        ? "tope-persona"
        : enLaObra >= topes.porObraDia
          ? "tope-obra"
          : enLaPasada >= topes.porPasada
            ? "tope-pasada"
            : null;

    if (motivo === null) {
      porPersona.set(lote.persona.clave, yaTiene + 1);
      enLaObra += 1;
      enLaPasada += 1;
      salida.push(lote);
      continue;
    }

    // No cabe. Si tiene correo se lo mandamos por ahi; si ya iba a recibir un
    // correo con lo mismo, no se duplica.
    const yaVaPorCorreo = salida.some(
      (l) => l.persona.clave === lote.persona.clave && l.canal === "CORREO",
    );

    if (lote.persona.email && !yaVaPorCorreo) {
      salida.push({ ...lote, canal: "CORREO" });
      degradados.push({ clave: lote.persona.clave, motivo });
    } else if (lote.persona.email) {
      // El correo ya lleva estos motivos: no hay nada que hacer y tampoco se
      // pierde nada.
      degradados.push({ clave: lote.persona.clave, motivo });
    } else {
      descartados.push({ clave: lote.persona.clave, motivo });
    }
  }

  return { lotes: salida, degradados, descartados };
}

// ---------------------------------------------------------------------------
// El estado del reloj
// ---------------------------------------------------------------------------

/**
 * Cada cuanto se espera que corra el reloj.
 *
 * Cinco minutos: el minuto ya lo ocupa el cron del despliegue, y un aviso de
 * restriccion no necesita latencia de segundos.
 */
export const RELOJ_ESPERADO_MINUTOS = 5;

/**
 * A partir de cuando se le da por parado.
 *
 * Seis periodos, igual que `SILENCIO_SOSPECHOSO_SEGUNDOS` en
 * `@/lib/emisor-sms`: avisar al primer fallo es ensenar una alarma que casi
 * siempre miente, y una alarma que miente se ignora.
 */
export const RELOJ_SILENCIO_MINUTOS = RELOJ_ESPERADO_MINUTOS * 6;

export type EstadoReloj = "nunca" | "vivo" | "parado";

/**
 * Si el reloj esta corriendo.
 *
 * `nunca` NO es `parado`, y la diferencia es lo unico util aqui: recien
 * desplegado y sin correr significa que falta crear la linea del cron en
 * cPanel, y el consejo que hay que dar es otro. Es el mismo error que costo
 * una hora el 12 de agosto deduciendo de fechas de archivos que un cron no
 * existia.
 */
export function estadoDelReloj(ultima: Date | null, ahora: Date): EstadoReloj {
  if (ultima === null) return "nunca";
  const minutos = (ahora.getTime() - ultima.getTime()) / 60_000;
  return minutos <= RELOJ_SILENCIO_MINUTOS ? "vivo" : "parado";
}

// ---------------------------------------------------------------------------
// El troceo
// ---------------------------------------------------------------------------

/// Cuantas obras se miran en una pasada.
export const MAX_OBRAS_POR_PASADA = 5;

/**
 * El siguiente trozo, con cursor circular.
 *
 * Recorrer todas las obras en una peticion HTTP es exactamente lo que
 * LiteSpeed corta. Se miran unas pocas y se deja escrito por cual seguir; el
 * cron vuelve en cinco minutos.
 *
 * Un cursor que ya no existe —la obra se borro— empieza por el principio en
 * vez de colgarse, que es el fallo que dejaria el reloj parado sin que nadie
 * lo notara.
 */
export function siguienteLote<T extends { id: string }>(
  obras: readonly T[],
  desde: string | null,
  cuantas: number,
): { lote: T[]; siguiente: string | null } {
  if (obras.length === 0) return { lote: [], siguiente: null };

  const indice = desde === null ? -1 : obras.findIndex((o) => o.id === desde);
  const arranque = indice < 0 ? 0 : indice + 1;

  const lote: T[] = [];
  for (let i = 0; i < Math.min(cuantas, obras.length); i++) {
    lote.push(obras[(arranque + i) % obras.length]!);
  }

  return { lote, siguiente: lote[lote.length - 1]?.id ?? null };
}

// ---------------------------------------------------------------------------
// Altas
// ---------------------------------------------------------------------------

export interface DatosContacto {
  nombre: string;
  empresa: string;
  cargo: string;
  celular: string;
  email: string;
}

export interface ContactoSaneado {
  nombre: string;
  empresa: string | null;
  cargo: string | null;
  celular: string | null;
  email: string | null;
}

export type ValidacionContacto =
  | { ok: true; datos: ContactoSaneado }
  | { ok: false; error: string };

/**
 * Valida y sanea el alta de alguien de fuera.
 *
 * La regla que no se puede saltar es la misma que la del pase: AL MENOS un
 * contacto. Alguien sin correo ni celular no puede recibir ningun aviso, asi
 * que no seria un destinatario, seria una fila muerta que en la pantalla
 * parece que cubre un flujo y no cubre nada.
 */
export function validarContacto(d: DatosContacto): ValidacionContacto {
  const nombre = d.nombre.trim().replace(/\s+/g, " ");
  if (!nombre) return { ok: false, error: "Escribe el nombre." };

  const celularBruto = d.celular.trim();
  const emailBruto = d.email.trim();

  if (!celularBruto && !emailBruto) {
    return {
      ok: false,
      error:
        "Escribe al menos un celular o un correo: es por donde recibirá los avisos.",
    };
  }

  let celular: string | null = null;
  if (celularBruto) {
    celular = normalizarCelular(celularBruto);
    if (!celular) {
      return {
        ok: false,
        error: "El celular debe tener nueve cifras y empezar por 9.",
      };
    }
  }

  let email: string | null = null;
  if (emailBruto) {
    email = normalizarEmail(emailBruto);
    if (!email) return { ok: false, error: "El correo no parece válido." };
  }

  return {
    ok: true,
    datos: {
      nombre: nombre.slice(0, 150),
      empresa: d.empresa.trim().slice(0, 150) || null,
      cargo: d.cargo.trim().slice(0, 100) || null,
      celular,
      email,
    },
  };
}

export interface DatosSuscripcion {
  userId?: string | null;
  rol?: Role | null;
  contactoId?: string | null;
  canales: Canales;
  momentos: Momentos;
}

/**
 * Una suscripcion tiene que decir A QUIEN, POR DONDE y CUANDO.
 *
 * El "exactamente uno de los tres sujetos" no lo puede exigir la base, asi que
 * se exige aqui, donde hay tests. Dos sujetos a la vez no significa nada, y
 * ninguno tampoco: seria una regla que no alcanza a nadie y que en la pantalla
 * parece que cubre un flujo.
 */
export function validarSuscripcion(
  d: DatosSuscripcion,
): { ok: true } | { ok: false; error: string } {
  const sujetos = [d.userId, d.rol, d.contactoId].filter(Boolean).length;
  if (sujetos === 0) return { ok: false, error: "Elige a quién se avisa." };
  if (sujetos > 1) {
    return {
      ok: false,
      error: "Elige una sola cosa: una persona, un rol o un contacto externo.",
    };
  }

  const { app, correo, sms } = d.canales;
  if (!app && !correo && !sms) {
    return { ok: false, error: "Elige al menos un canal." };
  }

  const { alAbrir, alRecordar, alQuedarLista, enResumen } = d.momentos;
  if (!alAbrir && !alRecordar && !alQuedarLista && !enResumen) {
    return { ok: false, error: "Elige al menos un momento en que avisar." };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Los textos
// ---------------------------------------------------------------------------

/// Un SMS son 160 caracteres. Pasarse lo parte en dos, que se cobran como dos
/// y llegan desordenados.
export const LIMITE_SMS = 160;

/** Los flujos distintos de unos motivos, en el orden de la matriz. */
export function flujosDe(motivos: readonly MotivoAviso[]): string[] {
  const tipos = new Set(motivos.map((m) => m.tipo));
  return FLUJOS_RESTRICCION.filter((f) => tipos.has(f.tipo)).map((f) => f.etiqueta);
}

/** Cuantas tareas distintas hay detras de unos motivos. */
export function tareasDe(motivos: readonly MotivoAviso[]): number {
  return new Set(motivos.map((m) => m.uid)).size;
}

/**
 * Recorta sin partir una palabra por la mitad.
 *
 * Exportada solo para poder probarla: es lo que evita que un nombre de obra de
 * doscientos caracteres parta el mensaje en dos SMS.
 */
export function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  if (max <= 1) return "…".slice(0, max);

  const corte = texto.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");

  // Se corta por el espacio aunque sobre sitio: "EDIFICIO…" se lee y
  // "EDIFICIO MULTIFAMIL…" parece un error de la aplicacion. Solo se parte la
  // palabra cuando cortar por el espacio dejaria menos de un tercio, que es
  // cuando el recorte ya no dice nada.
  const porPalabra = espacio > max / 3;
  return `${(porPalabra ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}

/**
 * El aviso en un SMS.
 *
 * Menos de 160 caracteres y CERO enlaces, como el resto de los SMS de GCM: las
 * operadoras marcan como spam los SMS con URL. Por eso el texto tiene que
 * entenderse SIN abrir nada.
 *
 * Lo que se recorta primero es el nombre de la obra, no los flujos: quien
 * recibe el SMS casi siempre trabaja en una sola obra, pero necesita saber si
 * le falta el plano o el fierro.
 */
export function textoAvisoSms(
  obra: string,
  motivos: readonly MotivoAviso[],
): string {
  const tareas = tareasDe(motivos);
  const flujos = flujosDe(motivos);
  const cuenta = tareas === 1 ? "1 tarea espera" : `${tareas} tareas esperan`;
  const porQue = recortar(flujos.join(", "), 60);

  // Si hay una promesa vencida, lo primero que se lee es eso. En 160
  // caracteres solo cabe una idea, y "se paso la fecha" es la que hace actuar.
  const vencidas = motivos.filter(
    (m) => (m.diasParaLaFecha ?? null) !== null && m.diasParaLaFecha! < 0,
  ).length;

  const cola =
    vencidas > 0
      ? `se paso la fecha de ${vencidas === 1 ? "1 restriccion" : `${vencidas} restricciones`} (${porQue}). Entra a GCM.`
      : `${cuenta} por ${porQue}. Entra a GCM.`;
  const sitio = LIMITE_SMS - cola.length - "GCM : ".length;
  const nombre = recortar(obra, Math.max(1, sitio));

  return recortar(`GCM ${nombre}: ${cola}`, LIMITE_SMS);
}

/**
 * El aviso dentro de GCM.
 *
 * Titulo y consecuencia por separado, como en el panel «Que falta»: el hecho
 * no mueve a nadie, lo que mueve es lo que se rompe si no se atiende.
 */
export interface TextoAviso {
  titulo: string;
  cuerpo: string;
}

export function textoAviso(
  evento: EventoAviso,
  motivos: readonly MotivoAviso[],
): TextoAviso {
  const tareas = tareasDe(motivos);
  const lista = flujosDe(motivos).join(", ");
  const cuantas = tareas === 1 ? "1 tarea" : `${tareas} tareas`;

  if (evento === "LISTA") {
    return {
      titulo: `${cuantas} ${tareas === 1 ? "quedó lista" : "quedaron listas"}`,
      cuerpo:
        "Ya no les falta nada: se pueden comprometer en el Plan Semanal de esta semana.",
    };
  }

  if (evento === "RECORDAR") {
    // Si hay una promesa de por medio, ESA es la noticia. «Lleva cinco días
    // abierta» es un dato; «se pasó la fecha que prometiste» es una promesa
    // rota, y eso es lo que hace que alguien coja el teléfono.
    const vencidos = motivos.filter(
      (m) => (m.diasParaLaFecha ?? null) !== null && m.diasParaLaFecha! < 0,
    );
    if (vencidos.length > 0) {
      const peor = Math.min(...vencidos.map((m) => m.diasParaLaFecha!));
      const atraso = Math.abs(peor);
      const cuantasV =
        vencidos.length === 1 ? "1 restricción" : `${vencidos.length} restricciones`;
      return {
        titulo: `Se pasó la fecha en ${cuantasV}`,
        cuerpo: `Se prometió tenerla${vencidos.length === 1 ? "" : "s"} y la más atrasada lleva ${atraso} ${atraso === 1 ? "día" : "días"} de retraso. Mientras nadie ponga fecha nueva, el trabajo sigue prometido para un día que ya no se sostiene.`,
      };
    }

    const dias = Math.max(...motivos.map((m) => m.diasAbierta));
    return {
      titulo: `${cuantas} sigue${tareas === 1 ? "" : "n"} esperando por ${lista}`,
      cuerpo: `La más antigua lleva ${dias} ${dias === 1 ? "día" : "días"} sin resolverse. Si el trabajo arranca antes, se pierde la semana y el PPC lo paga.`,
    };
  }

  if (evento === "RESUMEN") {
    return {
      titulo: `Hoy tienes ${cuantas} esperando por ${lista}`,
      cuerpo:
        "Lo que no se libere antes de que arranque el trabajo se convierte en un compromiso incumplido.",
    };
  }

  return {
    titulo: `${cuantas} te espera${tareas === 1 ? "" : "n"} por ${lista}`,
    cuerpo:
      "Alguien analizó estas tareas y marcó que dependen de ti. Mientras no se libere, no se pueden comprometer en el Plan Semanal.",
  };
}
