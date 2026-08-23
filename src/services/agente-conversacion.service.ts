import "server-only";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import { soles } from "@/utils/formato";
import { SIN_PROVEEDOR_ACTIVO } from "@/lib/agente-conversacion";
import {
  conversar,
  mensajesDeResultados,
  configuracionProveedorActivo,
  configuracionesAlternativas,
  activarProveedorInterno,
  marcarErrorProveedorInterno,
  type HerramientaAgente,
  type HerramientaEscritura,
  type ConfiguracionProveedorActivo,
  type RespuestaTurno,
} from "@/services/agente-ia.service";
import { listarObras, obtenerResumenEmpresa } from "@/services/obras.service";
import {
  semaforoDeCartera,
  sobregiroProyectadoDeCartera,
  confiabilidadDeCartera,
} from "@/services/gerencia.service";
import {
  obtenerPresupuestoVigente,
  crearMovimiento,
  type DatosMovimiento,
} from "@/services/movimientos.service";
import { obtenerCronograma, registrarAvance } from "@/services/cronograma.service";
import { crearNota, type DatosNota } from "@/services/notas.service";
import type { SesionActiva } from "@/services/sesion.service";
import type { RolAgente } from "@/generated/prisma/enums";
// `import type`, no un import de valor: el cliente generado
// (`src/generated/prisma/`) esta gitignored y solo existe despues de
// `prisma generate` -parte de `npm run build`, un paso DESPUES de las
// pruebas en el CI-. Un import de tipo se borra por completo al compilar,
// asi que nunca necesita que el archivo exista en tiempo de ejecucion;
// uno de valor (p. ej. `Prisma.JsonNull`) SI lo necesita, y eso es
// exactamente lo que tumbo el CI la primera vez -ver
// `barridoDePropuestasExpiradas`, que por eso filtra en memoria en vez de
// pedirle ese centinela al `where`-.
import type { Prisma } from "@/generated/prisma/client";

/// Nombre de una obra, para las tarjetas de confirmacion -SOLO texto de
/// pantalla, nunca una decision de permiso: la autorizacion real la hace
/// cada funcion de servicio que la propuesta termina llamando-. Acotada
/// por companyId, igual que cualquier otra consulta de apoyo del proyecto.
async function nombreDeObra(companyId: string, obraId: string): Promise<string> {
  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId },
    select: { nombreObra: true },
  });
  return obra?.nombreObra ?? "esa obra";
}

/**
 * El agente conversacional — Fase 2a, SOLO LECTURA.
 *
 * Un turno con tool-use puede tardar 10-30s: no puede correr sincrono
 * dentro de un Server Action ocupando uno de los 20 Entry Processes de
 * este hosting. El patron es el de `ProbarSms.tsx`
 * (`src/app/(dashboard)/empresa/configuracion/acciones.ts`): una accion
 * crea la fila y devuelve su id de inmediato; el cliente sondea otra
 * accion cada pocos segundos hasta que termina. Aqui la ejecucion real se
 * dispara con `after()` de Next, dentro de la MISMA Server Action que ya
 * tiene la sesion -`obtenerSesion()` exige `cookies()` de una peticion
 * real, asi que no hay forma de reconstruirla en un worker desconectado-.
 *
 * NADA de escritura en esta entrega: las herramientas de abajo son todas
 * de lectura, ya pagadas -no hacen ninguna consulta que la pantalla no
 * haga ya-. Herramientas que creen o cambien datos, con su patron de
 * proponer-y-confirmar, quedan para la Fase 2b.
 */

const MAX_MENSAJE = 4000;
/// Tope de vueltas de herramienta por turno. Si el modelo no llega a una
/// respuesta de texto en este numero de idas y vueltas, se corta y se
/// explica -nunca un bucle silencioso pagando llamadas sin fin-.
const MAX_VUELTAS = 6;

function construirSistema(puedeEscribir: boolean): string {
  const base = [
    "Eres el asistente de GCM (Gestión en Construcción Moderna), una app de gestión de obras de construcción.",
    "Respondes preguntas sobre la cartera de obras de quien te escribe, usando SOLO las herramientas disponibles.",
    "Nunca inventes cifras: si una herramienta no trae un dato, dilo en vez de adivinar.",
    "Si una herramienta devuelve vacío o dice que no hay permiso, explícalo con naturalidad, no como un error técnico.",
    "Sé breve y concreto. Responde en español.",
  ];
  if (puedeEscribir) {
    base.push(
      "Puedes PROPONER una escritura (crear un movimiento presupuestal en borrador, registrar un avance, crear una nota) con la herramienta proponer_accion, nunca de otra forma.",
      "Antes de proponer, usa listar_obras/partidas_de_obra/tareas_de_obra para conseguir los ids reales que la propuesta necesita -nunca inventes un wbsItemId, un uid ni un obraId-.",
      "Al llamar a proponer_accion tu turno TERMINA ahí: nunca digas que ya hiciste el cambio, nunca sigas conversando en el mismo turno. La confirma o cancela un humano en la pantalla, no tú.",
    );
  }
  return base.join(" ");
}

// ---------------------------------------------------------------------------
// Las herramientas — envoltorios delgados sobre servicios que ya existen
// ---------------------------------------------------------------------------

const HERRAMIENTAS: HerramientaAgente[] = [
  {
    nombre: "listar_obras",
    descripcion:
      "Lista las obras de la cartera, opcionalmente filtradas por texto (nombre o código) o por estado (PLANIFICACION, EN_EJECUCION, PARALIZADA, CERRADA). Úsala primero cuando la pregunta sea sobre una obra en particular, para saber su nombre exacto.",
    esquema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Texto libre sobre nombre o código de obra." },
        estado: {
          type: "string",
          enum: ["PLANIFICACION", "EN_EJECUCION", "PARALIZADA", "CERRADA"],
        },
      },
    },
    ejecutar: async (sesion, args) => {
      const a = (args ?? {}) as { q?: string; estado?: string };
      return listarObras(sesion, { q: a.q, estado: a.estado, porPagina: 20 });
    },
  },
  {
    nombre: "resumen_empresa",
    descripcion:
      "Resumen de toda la cartera: cuántas obras hay y, si hay exactamente una en ejecución, su presupuesto y comprometido. Para preguntas generales sobre el estado de la empresa.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => obtenerResumenEmpresa(sesion),
  },
  {
    nombre: "semaforo_cartera",
    descripcion:
      "El semáforo de partidas críticas de toda la cartera: cuántas partidas de la ruta crítica van atrasadas, en qué obras, y el SPI por duración de cada una.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => semaforoDeCartera(sesion),
  },
  {
    nombre: "sobregiro_cartera",
    descripcion:
      "Qué obras se están comprometiendo más rápido de lo que avanzan -sobregiro proyectado-, comparando el avance físico contra lo comprometido sobre presupuesto.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => sobregiroProyectadoDeCartera(sesion),
  },
  {
    nombre: "confiabilidad_cartera",
    descripcion:
      "El PPC (porcentaje del plan cumplido) de la última semana cerrada de cada obra, para saber qué tan confiable está siendo el plan semanal.",
    esquema: { type: "object", properties: {} },
    ejecutar: async (sesion) => confiabilidadDeCartera(sesion),
  },
  {
    nombre: "partidas_de_obra",
    descripcion:
      "Las partidas del presupuesto vigente de UNA obra, con su id (wbsItemId), código, descripción y monto vigente. Úsala antes de proponer un movimiento presupuestal, para conseguir el wbsItemId real de la partida -nunca lo inventes-.",
    esquema: {
      type: "object",
      required: ["obraId"],
      properties: {
        obraId: { type: "string", description: "Id de la obra, de listar_obras." },
      },
    },
    ejecutar: async (sesion, args) => {
      const { obraId } = args as { obraId: string };
      const p = await obtenerPresupuestoVigente(sesion, obraId);
      return p.partidas.map((x) => ({
        wbsItemId: x.wbsItemId,
        codigo: x.codigoPartida,
        descripcion: x.descripcion,
        modalidad: x.modalidad,
        vigente: x.vigente,
      }));
    },
  },
  {
    nombre: "tareas_de_obra",
    descripcion:
      "Las tareas del cronograma vigente de UNA obra, con su id (uid), código y nombre. Úsala antes de proponer un registro de avance, para conseguir el uid real de la tarea -nunca lo inventes-.",
    esquema: {
      type: "object",
      required: ["obraId"],
      properties: {
        obraId: { type: "string", description: "Id de la obra, de listar_obras." },
      },
    },
    ejecutar: async (sesion, args) => {
      const { obraId } = args as { obraId: string };
      const c = await obtenerCronograma(sesion, obraId);
      if (!c) return [];
      return c.tareas
        .filter((t) => !t.esResumen)
        .map((t) => ({ uid: t.uid, codigo: t.codigo, nombre: t.nombre, esHito: t.esHito }));
    },
  },
];

// ---------------------------------------------------------------------------
// Herramientas de ESCRITURA (Fase 2b) — nunca se ejecutan solas. El modelo
// solo puede llamar a `proponer_accion` (mas abajo), que calcula el resumen
// desde `datos` -nunca desde lo que el modelo haya dicho- y CORTA el turno.
// La escritura real solo la dispara `confirmarPropuestaAgente`, tras el
// click humano, con el `datos` YA guardado, nunca uno nuevo.
// ---------------------------------------------------------------------------

interface DatosCrearMovimientoAgente extends DatosMovimiento {
  obraId: string;
}

interface DatosRegistrarAvanceAgente {
  obraId: string;
  uid: number;
  porcentaje: string;
  fecha: string;
  nota?: string;
}

interface DatosCrearNotaAgente extends DatosNota {
  obraId: string;
}

const HERRAMIENTAS_ESCRITURA: HerramientaEscritura[] = [
  {
    nombre: "crear_movimiento",
    descripcion:
      "Propone crear un movimiento presupuestal en BORRADOR (RECONVERSION, ADICIONAL o DEDUCTIVO). No se ejecuta hasta que un humano confirme, y aun confirmado queda pendiente de que un administrador lo apruebe aparte -nunca afecta el presupuesto por sí solo-.",
    esquema: {
      type: "object",
      required: ["obraId", "tipo", "fecha", "concepto", "motivo", "lineas"],
      properties: {
        obraId: { type: "string", description: "Id de la obra, de listar_obras." },
        tipo: { type: "string", enum: ["RECONVERSION", "ADICIONAL", "DEDUCTIVO"] },
        fecha: { type: "string", description: "YYYY-MM-DD, del documento que respalda el movimiento." },
        concepto: { type: "string" },
        motivo: {
          type: "string",
          description: "Por qué procede: la cláusula del contrato o el hecho que lo justifica.",
        },
        referencia: { type: "string" },
        lineas: {
          type: "array",
          minItems: 1,
          items: {
            oneOf: [
              {
                description: "Ajuste sobre una partida que ya existe, de partidas_de_obra.",
                type: "object",
                required: ["wbsItemId", "importe"],
                properties: {
                  wbsItemId: { type: "string", description: "De partidas_de_obra." },
                  importe: {
                    type: "string",
                    description: "Positivo entra, negativo sale, texto decimal, nunca cero.",
                  },
                  justificacion: { type: "string" },
                },
              },
              {
                description: "Alta de partida nueva. Solo válido si tipo=ADICIONAL.",
                type: "object",
                required: ["parentId", "codigoPartida", "descripcion", "importe"],
                properties: {
                  parentId: {
                    type: "string",
                    description: "wbsItemId de un CAPITULO, de partidas_de_obra.",
                  },
                  codigoPartida: {
                    type: "string",
                    description: "Formato 1, 2.03, 7.02.01 -no puede chocar con uno existente.",
                  },
                  descripcion: { type: "string" },
                  unidad: { type: "string" },
                  metrado: { type: "string" },
                  precioUnitario: { type: "string" },
                  modalidad: {
                    type: "string",
                    enum: ["PRECIOS_UNITARIOS", "SUMA_ALZADA", "ALCANCE"],
                  },
                  importe: { type: "string" },
                  justificacion: { type: "string" },
                },
              },
            ],
          },
        },
      },
    },
    resumen: async (sesion, datosSinTipar) => {
      const datos = datosSinTipar as DatosCrearMovimientoAgente;
      const [nombreObra, presupuesto] = await Promise.all([
        nombreDeObra(sesion.companyId, datos.obraId),
        obtenerPresupuestoVigente(sesion, datos.obraId),
      ]);
      const porCodigo = new Map(presupuesto.partidas.map((p) => [p.wbsItemId, p]));

      const lineas = datos.lineas.map((l) => {
        if ("wbsItemId" in l) {
          const partida = porCodigo.get(l.wbsItemId);
          const etiqueta = partida ? `${partida.codigoPartida} (${partida.descripcion})` : l.wbsItemId;
          return `${etiqueta}: ${soles(l.importe)}`;
        }
        return `NUEVA partida ${l.codigoPartida} (${l.descripcion}): ${soles(l.importe)}`;
      });
      const neto = sumar(datos.lineas.map((l) => l.importe));

      return (
        `¿Confirmas crear un movimiento ${datos.tipo} en la obra "${nombreObra}"?\n` +
        `${lineas.join("\n")}\n` +
        `Total neto: ${soles(neto)}. Motivo: "${datos.motivo}".\n` +
        `Quedará en BORRADOR: no se descuenta del presupuesto hasta que un administrador lo apruebe aparte.`
      );
    },
    ejecutarEscritura: async (sesion, datosSinTipar) => {
      const { obraId, ...datos } = datosSinTipar as DatosCrearMovimientoAgente;
      const r = await crearMovimiento(sesion, obraId, datos);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, mensaje: `Movimiento #${r.numero} creado en BORRADOR.` };
    },
  },
  {
    nombre: "registrar_avance",
    descripcion:
      "Propone registrar el avance de UNA tarea del cronograma. No se ejecuta hasta que un humano confirme. Cada reporte es un registro histórico nuevo -no reemplaza al anterior, y no se puede borrar después-.",
    esquema: {
      type: "object",
      required: ["obraId", "uid", "porcentaje", "fecha"],
      properties: {
        obraId: { type: "string", description: "Id de la obra, de listar_obras." },
        uid: { type: "integer", description: "Id de la tarea, de tareas_de_obra." },
        porcentaje: { type: "string", description: "0 a 100, texto decimal." },
        fecha: { type: "string", description: "YYYY-MM-DD, nunca futura." },
        nota: { type: "string" },
      },
    },
    resumen: async (sesion, datosSinTipar) => {
      const datos = datosSinTipar as DatosRegistrarAvanceAgente;
      const [nombreObra, cronograma] = await Promise.all([
        nombreDeObra(sesion.companyId, datos.obraId),
        obtenerCronograma(sesion, datos.obraId),
      ]);
      const tarea = cronograma?.tareas.find((t) => t.uid === datos.uid);
      const etiquetaTarea = tarea ? `${tarea.codigo ?? ""} ${tarea.nombre}`.trim() : `la tarea ${datos.uid}`;

      return (
        `¿Confirmas registrar que "${etiquetaTarea}" (obra "${nombreObra}") llegó a ${datos.porcentaje}% el ${datos.fecha}?\n` +
        `Se guarda como un reporte NUEVO en la serie histórica -no reemplaza el reporte anterior, y no se puede borrar después: para corregirlo hay que registrar otro reporte posterior-.`
      );
    },
    ejecutarEscritura: async (sesion, datosSinTipar) => {
      const { obraId, ...datos } = datosSinTipar as DatosRegistrarAvanceAgente;
      const r = await registrarAvance(sesion, obraId, datos);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, mensaje: "Avance registrado." };
    },
  },
  {
    nombre: "crear_nota",
    descripcion:
      "Propone crear una nota de bitácora en una obra. No se ejecuta hasta que un humano confirme.",
    esquema: {
      type: "object",
      required: ["obraId", "categoria", "titulo", "cuerpo"],
      properties: {
        obraId: { type: "string", description: "Id de la obra, de listar_obras." },
        categoria: { type: "string", enum: ["FINANCIERO", "LOGISTICA", "OPERATIVO", "LEGAL"] },
        titulo: { type: "string", maxLength: 150 },
        cuerpo: { type: "string" },
        fechaRecordatorio: { type: "string", description: "YYYY-MM-DD opcional." },
      },
    },
    resumen: async (sesion, datosSinTipar) => {
      const datos = datosSinTipar as DatosCrearNotaAgente;
      const nombreObra = await nombreDeObra(sesion.companyId, datos.obraId);
      const recordatorio = datos.fechaRecordatorio
        ? ` Con recordatorio para el ${datos.fechaRecordatorio}.`
        : "";
      return `¿Confirmas crear una nota ${datos.categoria} en la obra "${nombreObra}": "${datos.titulo}"?${recordatorio}`;
    },
    ejecutarEscritura: async (sesion, datosSinTipar) => {
      const { obraId, ...datos } = datosSinTipar as DatosCrearNotaAgente;
      const r = await crearNota(sesion, obraId, datos);
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, mensaje: "Nota creada." };
    },
  },
];

/**
 * La UNICA puerta por la que el modelo puede pedir una escritura. Es una
 * `HerramientaAgente` de lectura normal -su `ejecutar` nunca hace un
 * `create`/`update`, solo busca la herramienta de escritura por nombre y
 * calcula su resumen-, asi que el bucle de turnos no necesita ningun
 * camino especial para DISPARARLA, solo para INTERPRETAR su resultado (ver
 * `ejecutarTurno`: cuando esta herramienta tiene exito, el turno se corta
 * ahi, no sigue a otra vuelta).
 */
const PROPONER_ACCION: HerramientaAgente = {
  nombre: "proponer_accion",
  descripcion:
    "Propone una escritura para que un humano la confirme en pantalla. NUNCA ejecuta nada por sí sola. Tu turno termina en cuanto la llames -no sigas conversando después-.",
  esquema: {
    type: "object",
    required: ["herramienta", "datos"],
    properties: {
      herramienta: {
        type: "string",
        enum: HERRAMIENTAS_ESCRITURA.map((h) => h.nombre),
      },
      datos: { type: "object" },
    },
  },
  ejecutar: async (sesion, args) => {
    const a = args as { herramienta?: string; datos?: unknown };
    const h = HERRAMIENTAS_ESCRITURA.find((x) => x.nombre === a.herramienta);
    if (!h) {
      throw new Error(`Herramienta de escritura desconocida: "${a.herramienta}".`);
    }
    return {
      propuesta: { herramienta: h.nombre, datos: a.datos },
      resumen: await h.resumen(sesion, a.datos),
    };
  },
};

// ---------------------------------------------------------------------------
// Lo que usa la pantalla
// ---------------------------------------------------------------------------

export interface MensajeAgenteResumen {
  id: string;
  rol: RolAgente;
  contenido: string;
  terminado: boolean;
  error: string | null;
  createdAt: Date;
  /// true si esta fila es una propuesta de escritura esperando el click
  /// humano. La pantalla dibuja Confirmar/Cancelar en vez de texto plano.
  propuestaPendiente: boolean;
}

function mapearMensaje(f: {
  id: string;
  rol: RolAgente;
  contenido: string;
  terminadoAt: Date | null;
  error: string | null;
  iniciadoAt: Date;
  propuesta: unknown;
  propuestaResueltaAt: Date | null;
}): MensajeAgenteResumen {
  return {
    id: f.id,
    rol: f.rol,
    contenido: f.contenido,
    terminado: f.terminadoAt !== null,
    error: f.error,
    createdAt: f.iniciadoAt,
    propuestaPendiente: f.propuesta !== null && f.propuestaResueltaAt === null,
  };
}

const SELECT_MENSAJE = {
  id: true,
  rol: true,
  contenido: true,
  terminadoAt: true,
  error: true,
  iniciadoAt: true,
  propuesta: true,
  propuestaResueltaAt: true,
} as const;

/** El historial de una conversación, la más antigua primero. */
export async function historialDeConversacion(
  sesion: SesionActiva,
  conversacionId: string,
): Promise<MensajeAgenteResumen[]> {
  if (!puede(sesion, "agente_ia:usar")) return [];

  const conv = await prisma.conversacionAgente.findFirst({
    where: { id: conversacionId, companyId: sesion.companyId, userId: sesion.userId },
    select: { id: true },
  });
  if (!conv) return [];

  const filas = await prisma.mensajeAgente.findMany({
    where: { conversacionId },
    orderBy: { iniciadoAt: "asc" },
    select: SELECT_MENSAJE,
  });

  return filas.map(mapearMensaje);
}

/**
 * La conversación más reciente de quien pregunta, si tiene alguna.
 *
 * Una sola conversación "activa" por usuario basta para esta entrega —no
 * hay todavía un archivo navegable de varias, ver el comentario de
 * arriba—.
 */
export async function conversacionReciente(
  sesion: SesionActiva,
): Promise<{ id: string; mensajes: MensajeAgenteResumen[] } | null> {
  if (!puede(sesion, "agente_ia:usar")) return null;

  const conv = await prisma.conversacionAgente.findFirst({
    where: { companyId: sesion.companyId, userId: sesion.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!conv) return null;

  return { id: conv.id, mensajes: await historialDeConversacion(sesion, conv.id) };
}

export type ResultadoTurno =
  | { ok: true; conversacionId: string; mensajeAsistenteId: string }
  | { ok: false; error: string };

/**
 * Manda un mensaje al asistente: crea la fila del usuario y la del
 * asistente (vacía, `terminadoAt: null`) y devuelve el id de esta última
 * DE INMEDIATO, antes de que el proveedor conteste. La ejecución real
 * sigue en `after()` — ver el comentario de cabecera.
 */
export async function iniciarTurno(
  sesion: SesionActiva,
  conversacionId: string | null,
  mensaje: string,
): Promise<ResultadoTurno> {
  if (!puede(sesion, "agente_ia:usar")) {
    return { ok: false, error: "No tienes permiso para usar el asistente." };
  }

  const texto = mensaje.trim();
  if (!texto) return { ok: false, error: "Escribe algo primero." };
  if (texto.length > MAX_MENSAJE) {
    return { ok: false, error: `El mensaje no puede pasar de ${MAX_MENSAJE} caracteres.` };
  }

  // Si el id no es una conversacion propia -ajena, borrada, inventada- se
  // abre una nueva en silencio, nunca se falla: es mejor perder el hilo
  // que dejar un mensaje sin donde ir.
  const propia = conversacionId
    ? await prisma.conversacionAgente.findFirst({
        where: { id: conversacionId, companyId: sesion.companyId, userId: sesion.userId },
        select: { id: true },
      })
    : null;

  // Con una propuesta sin resolver, el turno anterior no termino de
  // verdad: nada nuevo entra hasta que se confirme o cancele. Es la
  // comprobacion REAL -el cliente ya deshabilita el textarea, pero eso no
  // protege nada por si solo-.
  if (propia) {
    const ultimo = await prisma.mensajeAgente.findFirst({
      where: { conversacionId: propia.id, rol: "ASISTENTE" },
      orderBy: { iniciadoAt: "desc" },
      select: { propuesta: true, propuestaResueltaAt: true },
    });
    if (ultimo && ultimo.propuesta !== null && ultimo.propuestaResueltaAt === null) {
      return { ok: false, error: "Resuelve la propuesta pendiente antes de seguir." };
    }
  }

  let convId = propia?.id ?? null;
  let mensajeAsistenteId = "";

  await prisma.$transaction(async (tx) => {
    if (!convId) {
      const nueva = await tx.conversacionAgente.create({
        data: { companyId: sesion.companyId, userId: sesion.userId },
        select: { id: true },
      });
      convId = nueva.id;
    }

    await tx.mensajeAgente.create({
      data: {
        conversacionId: convId,
        rol: "USUARIO",
        contenido: texto,
        terminadoAt: new Date(),
      },
    });

    const asistente = await tx.mensajeAgente.create({
      data: { conversacionId: convId, rol: "ASISTENTE", contenido: "", terminadoAt: null },
      select: { id: true },
    });
    mensajeAsistenteId = asistente.id;
  });

  const idConversacion = convId!;
  const idMensaje = mensajeAsistenteId;
  after(() => ejecutarTurno(sesion, idConversacion, idMensaje));

  return { ok: true, conversacionId: idConversacion, mensajeAsistenteId: idMensaje };
}

export interface EstadoTurno {
  contenido: string;
  terminado: boolean;
  error: string | null;
  propuestaPendiente: boolean;
}

/** Lo que el cliente sondea cada pocos segundos, mismo patrón que `ProbarSms.tsx`. */
export async function estadoDeTurno(
  sesion: SesionActiva,
  mensajeAsistenteId: string,
): Promise<EstadoTurno | null> {
  if (!puede(sesion, "agente_ia:usar")) return null;

  const fila = await prisma.mensajeAgente.findFirst({
    where: {
      id: mensajeAsistenteId,
      conversacion: { companyId: sesion.companyId, userId: sesion.userId },
    },
    select: { contenido: true, terminadoAt: true, error: true, propuesta: true, propuestaResueltaAt: true },
  });
  if (!fila) return null;

  return {
    contenido: fila.contenido,
    terminado: fila.terminadoAt !== null,
    error: fila.error,
    propuestaPendiente: fila.propuesta !== null && fila.propuestaResueltaAt === null,
  };
}

export type ResultadoConfirmacion =
  | { ok: true; contenido: string }
  | { ok: false; error: string };

/**
 * Resuelve una propuesta de escritura: confirma (ejecuta la funcion de
 * servicio real, con el `datos` YA guardado, nunca uno nuevo) o cancela.
 *
 * El permiso de fondo (`movimiento:crear`, `avance:registrar`,
 * `nota:crear`...) se vuelve a comprobar SOLO, dentro de la funcion real,
 * con la sesion de ESTE instante -si el usuario lo perdio entre la
 * propuesta y el click, la funcion real lo dice, esto no reimplementa
 * nada-.
 */
export async function confirmarPropuestaAgente(
  sesion: SesionActiva,
  mensajeAsistenteId: string,
  decision: "confirmar" | "cancelar",
): Promise<ResultadoConfirmacion> {
  if (!puede(sesion, "agente_ia:usar")) {
    return { ok: false, error: "No tienes permiso para usar el asistente." };
  }

  const fila = await prisma.mensajeAgente.findFirst({
    where: {
      id: mensajeAsistenteId,
      conversacion: { companyId: sesion.companyId, userId: sesion.userId },
    },
    select: { contenido: true, propuesta: true, propuestaResueltaAt: true },
  });
  if (!fila) return { ok: false, error: "No se encontró esa propuesta." };
  if (fila.propuesta === null) return { ok: false, error: "Ese mensaje no es una propuesta." };
  if (fila.propuestaResueltaAt !== null) {
    return { ok: false, error: "Esa propuesta ya se resolvió." };
  }

  // Reclamar ANTES de ejecutar: si dos clicks llegan a la vez (doble click,
  // doble pestaña), solo uno de los dos `updateMany` afecta una fila -el
  // que gana ve `count === 1`, el otro `count === 0` y no ejecuta nada-.
  const reclamado = await prisma.mensajeAgente.updateMany({
    where: { id: mensajeAsistenteId, propuestaResueltaAt: null },
    data: { propuestaResueltaAt: new Date() },
  });
  if (reclamado.count === 0) {
    return { ok: false, error: "Esa propuesta ya se resolvió." };
  }

  if (decision === "cancelar") {
    const contenido = `${fila.contenido}\n\nCancelada.`;
    await prisma.mensajeAgente.update({
      where: { id: mensajeAsistenteId },
      data: { contenido, propuestaResultado: "Cancelada." },
    });
    return { ok: true, contenido };
  }

  const propuesta = fila.propuesta as { herramienta: string; datos: unknown };
  const herramienta = HERRAMIENTAS_ESCRITURA.find((h) => h.nombre === propuesta.herramienta);
  if (!herramienta) {
    const error = `Herramienta de escritura desconocida: "${propuesta.herramienta}".`;
    await prisma.mensajeAgente.update({
      where: { id: mensajeAsistenteId },
      data: { propuestaResultado: error.slice(0, 500) },
    });
    return { ok: false, error };
  }

  const r = await herramienta.ejecutarEscritura(sesion, propuesta.datos);
  const resultado = r.ok ? r.mensaje : r.error;
  const contenido = `${fila.contenido}\n\n${resultado}`;
  await prisma.mensajeAgente.update({
    where: { id: mensajeAsistenteId },
    data: { contenido, propuestaResultado: resultado.slice(0, 500) },
  });

  return r.ok ? { ok: true, contenido } : { ok: false, error: r.error };
}

// ---------------------------------------------------------------------------
// La ejecución real — corre dentro de `after()`, nunca bloquea la respuesta
// ---------------------------------------------------------------------------

/// A partir de cuanto tiempo sin terminar se considera un turno muerto -el
/// proceso se reinicio a mitad de un `after()`, algo que un despliegue
/// puede provocar-. El sondeo del cliente ya tiene su propio tope de
/// espera (mismo patron que `ProbarSms.tsx`), asi que nadie se queda
/// mirando la pantalla esperando a este barrido: solo evita que la fila
/// se quede "pensando" para siempre en la base.
const TURNO_MUERTO_MS = 3 * 60 * 1000;

export interface ResumenBarridoTurnos {
  marcados: number;
}

/** Llamado desde el cron de `/api/reloj`, en su propio try/catch. */
export async function barridoDeTurnosMuertos(): Promise<ResumenBarridoTurnos> {
  const limite = new Date(Date.now() - TURNO_MUERTO_MS);
  const { count } = await prisma.mensajeAgente.updateMany({
    where: { terminadoAt: null, iniciadoAt: { lt: limite } },
    data: {
      terminadoAt: new Date(),
      error: "Se interrumpió antes de terminar (el servidor se reinició). Intenta de nuevo.",
    },
  });
  return { marcados: count };
}

/// Una propuesta sin resolver mas alla de esto se da por abandonada: los
/// datos que la sustentan (partidas, presupuesto vigente) pueden haber
/// cambiado, y confirmarla tarde seria ejecutar sobre un estado que el
/// humano ya no vio cuando decidio. NO es el mismo barrido que
/// `TURNO_MUERTO_MS`: aquella resuelve "el proceso murio a mitad de un
/// after()" en minutos; una propuesta sin confirmar es la situacion
/// NORMAL -alguien cierra la pestana, se va a almorzar- y puede tardar
/// horas.
const PROPUESTA_EXPIRA_MS = 24 * 60 * 60 * 1000;

export interface ResumenBarridoPropuestas {
  expiradas: number;
}

/**
 * Llamado desde el cron de `/api/reloj`, en su propio try/catch.
 *
 * En dos pasos, a proposito: filtrar `propuesta IS NOT NULL` en el WHERE
 * exigiria el centinela `Prisma.JsonNull` -un import de VALOR, no de tipo,
 * del cliente generado-, y ese archivo no existe todavia cuando el CI
 * corre las pruebas (`prisma generate` es parte de `npm run build`, un
 * paso DESPUES). Filtrar en memoria evita esa dependencia por completo.
 */
export async function barridoDePropuestasExpiradas(): Promise<ResumenBarridoPropuestas> {
  const limite = new Date(Date.now() - PROPUESTA_EXPIRA_MS);
  const candidatas = await prisma.mensajeAgente.findMany({
    where: { propuestaResueltaAt: null, terminadoAt: { not: null, lt: limite } },
    select: { id: true, propuesta: true },
  });
  const ids = candidatas.filter((m) => m.propuesta !== null).map((m) => m.id);
  if (ids.length === 0) return { expiradas: 0 };

  const { count } = await prisma.mensajeAgente.updateMany({
    where: { id: { in: ids } },
    data: { propuestaResueltaAt: new Date(), propuestaResultado: "Expiró sin confirmar." },
  });
  return { expiradas: count };
}

async function marcarError(mensajeAsistenteId: string, error: string): Promise<void> {
  await prisma.mensajeAgente.update({
    where: { id: mensajeAsistenteId },
    data: { terminadoAt: new Date(), error: error.slice(0, 500) },
  });
}

/// Cuantos proveedores alternativos probar como maximo antes de rendirse
/// -ademas del activo-. Cada uno puede tardar hasta `TOPE_CONVERSACION_MS`
/// (con su propio reintento interno adentro), asi que esto acota cuanto
/// puede llegar a tardar un turno en el peor de los casos: el turno sigue
/// corriendo en `after()`, no bloquea nada, pero tampoco es gratis
/// encadenar proveedores sin limite.
const TOPE_ALTERNATIVAS = 2;

/**
 * Resuelve CON QUE proveedor se va a correr el turno ENTERO -nunca a
 * mitad del bucle de herramientas-: el `mensajes` acumulado por cada
 * proveedor queda en SU propio formato (bloques `tool_use` de Claude vs.
 * `tool_calls` de OpenAI), asi que cambiar de proveedor una vez que ya
 * hay una vuelta de herramientas en el historial rompe al siguiente -por
 * eso esto se llama UNA vez, antes de la primera vuelta, nunca despues-.
 *
 * Si el proveedor activo falla, prueba con otros proveedores YA
 * VERIFICADOS de la misma empresa (`configuracionesAlternativas`, nunca
 * uno que nadie confirmo que funcionaba), en orden, hasta
 * `TOPE_ALTERNATIVAS`. El primero que responda:
 * - se vuelve el proveedor ACTIVO de la empresa de ahi en adelante
 *   (`activarProveedorInterno`) -asi el proximo turno no vuelve a pagar
 *   el costo de reintentar el que esta caido-,
 * - y el turno sigue exactamente igual que si nunca hubiera fallado
 *   nada: quien pregunto no ve ningun aviso del cambio.
 *
 * Cada proveedor que SI falla queda con su `ultimoError` actualizado
 * -mismo campo que ya llena "Probar"-, para que quien administra
 * `/empresa/configuracion/ia` se entere la proxima vez que entre, aunque
 * quien esta conversando ahora mismo no vea nada raro.
 */
async function resolverProveedorQueResponda(
  companyId: string,
  activo: ConfiguracionProveedorActivo,
  turno: { mensajes: unknown[]; herramientas: HerramientaAgente[]; sistema: string },
): Promise<{ config: ConfiguracionProveedorActivo; respuesta: RespuestaTurno } | { config: null; error: string }> {
  const candidatos = [activo];
  let errorDelActivo = "";

  const rActivo = await conversar(activo.tipo, activo, turno);
  if (!("ok" in rActivo)) return { config: activo, respuesta: rActivo };
  errorDelActivo = rActivo.error;
  await marcarErrorProveedorInterno(activo.id, rActivo.error);

  const alternativas = await configuracionesAlternativas(companyId, activo.id);
  for (const alt of alternativas.slice(0, TOPE_ALTERNATIVAS)) {
    candidatos.push(alt);
    const r = await conversar(alt.tipo, alt, turno);
    if (!("ok" in r)) {
      await activarProveedorInterno(companyId, alt.id);
      return { config: alt, respuesta: r };
    }
    await marcarErrorProveedorInterno(alt.id, r.error);
  }

  // Todos fallaron: se explica con el error del ACTIVO -el que quien
  // pregunta ya conoce y espera ver, si administra los proveedores-, no
  // con el de la ultima alternativa que ni siquiera eligio.
  return { config: null, error: errorDelActivo };
}

async function ejecutarTurno(
  sesion: SesionActiva,
  conversacionId: string,
  mensajeAsistenteId: string,
): Promise<void> {
  try {
    const activo = await configuracionProveedorActivo(sesion.companyId);
    if (!activo) {
      await marcarError(mensajeAsistenteId, SIN_PROVEEDOR_ACTIVO);
      return;
    }

    // El historial hasta ahora: incluye el mensaje del usuario que disparo
    // este turno (ya tiene terminadoAt), y excluye la propia fila vacia
    // que se esta rellenando -y cualquier otra que quedara a medias, que
    // no deberia existir pero no se confia en que nunca pase-.
    const historial = await prisma.mensajeAgente.findMany({
      where: {
        conversacionId,
        id: { not: mensajeAsistenteId },
        terminadoAt: { not: null },
      },
      orderBy: { iniciadoAt: "asc" },
      select: { rol: true, contenido: true },
    });

    let mensajes: unknown[] = historial.map((m) => ({
      role: m.rol === "USUARIO" ? "user" : "assistant",
      content: m.contenido,
    }));

    // Se decide UNA vez, con la sesion de este instante: si el permiso
    // cambia a mitad de un turno no importa, ya se ofrecio o no se ofrecio
    // la herramienta para esta vuelta completa. La escritura real, cuando
    // se confirme, vuelve a comprobar el permiso de fondo de todos modos.
    const puedeEscribir = puede(sesion, "agente_ia:escribir");
    const herramientas = puedeEscribir ? [...HERRAMIENTAS, PROPONER_ACCION] : HERRAMIENTAS;
    const sistema = construirSistema(puedeEscribir);

    // Conmutador automatico: si el proveedor activo no responde, prueba
    // con otro YA VERIFICADO de la empresa ANTES de la primera vuelta -ver
    // el comentario de `resolverProveedorQueResponda`-. Quien pregunta
    // nunca se entera: si algo respondio, el turno sigue igual.
    const resuelto = await resolverProveedorQueResponda(sesion.companyId, activo, {
      mensajes,
      herramientas,
      sistema,
    });
    if (!resuelto.config) {
      await marcarError(mensajeAsistenteId, resuelto.error);
      return;
    }
    const config = resuelto.config;
    let respuestaPendiente: RespuestaTurno | null = resuelto.respuesta;

    const herramientasUsadas: string[] = [];

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      let r: RespuestaTurno | { ok: false; error: string };
      if (respuestaPendiente) {
        r = respuestaPendiente;
        respuestaPendiente = null;
      } else {
        r = await conversar(config.tipo, config, { mensajes, herramientas, sistema });
      }

      if ("ok" in r) {
        // r: { ok: false; error: string } -ya paso por el conmutador en
        // la primera vuelta; de aqui en adelante ya no se cambia de
        // proveedor a mitad del historial acumulado, ver el comentario
        // de `resolverProveedorQueResponda`.
        await marcarError(mensajeAsistenteId, r.error);
        return;
      }

      if (r.tipo === "texto") {
        await prisma.mensajeAgente.update({
          where: { id: mensajeAsistenteId },
          data: {
            contenido: r.texto,
            terminadoAt: new Date(),
            ...(herramientasUsadas.length > 0 ? { herramientas: herramientasUsadas } : {}),
          },
        });
        return;
      }

      // r.tipo === "usar_herramientas" — `r.bruto` ya es el mensaje
      // "assistant" completo, en el formato exacto de este proveedor
      // (Claude/OpenAI-compatible lo arman distinto). Nunca se envuelve
      // aqui: ver el comentario de `RespuestaTurno` en `agente-ia.service.ts`.
      mensajes = [...mensajes, r.bruto];

      // Si `proponer_accion` tiene exito, se captura aqui y el turno se
      // corta DESPUES del Promise.all -sin importar si el modelo la llamo
      // junto con otras herramientas en el mismo lote: se procesan todas
      // igual, para no dejar un tool_use sin su tool_result si hiciera
      // falta reintentar, pero una vez que hay propuesta lista no se
      // manda ninguna vuelta mas-.
      let propuestaLista: { herramienta: string; datos: unknown } | null = null;
      let propuestaResumen = "";

      const resultados = await Promise.all(
        r.llamadas.map(async (ll) => {
          herramientasUsadas.push(ll.nombre);

          if (ll.nombre === "proponer_accion") {
            try {
              const res = (await PROPONER_ACCION.ejecutar(sesion, ll.args)) as {
                propuesta: { herramienta: string; datos: unknown };
                resumen: string;
              };
              propuestaLista = res.propuesta;
              propuestaResumen = res.resumen;
              return { toolUseId: ll.id, contenido: JSON.stringify({ ok: true }) };
            } catch (e) {
              const msg = e instanceof Error ? e.message : "No se pudo calcular la propuesta.";
              return { toolUseId: ll.id, contenido: `Error: ${msg}` };
            }
          }

          const herramienta = HERRAMIENTAS.find((h) => h.nombre === ll.nombre);
          if (!herramienta) {
            return { toolUseId: ll.id, contenido: `Herramienta desconocida: ${ll.nombre}` };
          }
          try {
            const resultado = await herramienta.ejecutar(sesion, ll.args);
            return { toolUseId: ll.id, contenido: JSON.stringify(resultado ?? null) };
          } catch (e) {
            // Incluye SinPermisoError y cualquier otro fallo del servicio
            // real: se le devuelve al modelo como texto, para que lo
            // explique con naturalidad en vez de tumbar el turno.
            const msg = e instanceof Error ? e.message : "No se pudo completar.";
            return { toolUseId: ll.id, contenido: `Error: ${msg}` };
          }
        }),
      );

      if (propuestaLista) {
        await prisma.mensajeAgente.update({
          where: { id: mensajeAsistenteId },
          data: {
            contenido: propuestaResumen,
            terminadoAt: new Date(),
            propuesta: propuestaLista as Prisma.InputJsonValue,
            herramientas: herramientasUsadas,
          },
        });
        return;
      }

      mensajes = [...mensajes, ...mensajesDeResultados(config.tipo, resultados)];
    }

    await marcarError(
      mensajeAsistenteId,
      "Se agotaron los intentos de consultar información sin llegar a una respuesta. Intenta de nuevo o hazla más simple.",
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fallo inesperado.";
    await marcarError(mensajeAsistenteId, msg).catch(() => {});
  }
}
