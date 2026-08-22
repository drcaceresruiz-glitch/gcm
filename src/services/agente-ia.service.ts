import "server-only";

import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { cifrar, descifrar, hayLlaveDeCifrado } from "@/lib/secreto";
import { validarProveedorIa, type DatosProveedorIa } from "@/lib/proveedor-ia";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los proveedores de IA que una empresa guardo, con su propia clave.
 *
 * Mismo molde que `remitente-correo.service.ts` para el secreto —cifrado,
 * nunca vuelve a la pantalla, `verificadoAt` solo tras una llamada real—,
 * pero aqui puede haber VARIOS proveedores por empresa (no uno): la
 * empresa trae su propia clave, de su propio proveedor, y puede guardar
 * mas de uno y elegir cual usar. Cual esta ACTIVO es un puntero en
 * `Company.proveedorIaActivoId`, no un campo de esta tabla — asi nunca
 * puede haber dos activos a la vez, por construccion.
 *
 * Esta es SOLO la infraestructura de credenciales (Fase 1). El agente
 * conversacional que las usa —chat, herramientas, turnos— no esta
 * construido todavia; ver `docs/PENDIENTES.md`, seccion 6b.
 */

function quien(sesion: SesionActiva): string {
  return `${sesion.nombres} ${sesion.apellidos}`.trim().slice(0, 150);
}

// ---------------------------------------------------------------------------
// Adaptadores — como se llama a cada tipo de proveedor
// ---------------------------------------------------------------------------

export interface ConfigLlamadaIa {
  apiKey: string;
  urlBase: string | null;
  modelo: string;
}

export type RespuestaProveedorIa = { ok: true } | { ok: false; error: string };

interface AdaptadorProveedorIa {
  /// Un mensaje minimo real, para confirmar que la clave y el modelo
  /// funcionan — mismo criterio que `probarRemitente`, que manda un correo
  /// de verdad en vez de solo verificar la conexion.
  probar(config: ConfigLlamadaIa): Promise<RespuestaProveedorIa>;
}

/// Tope de espera de la llamada de prueba. Es UN mensaje corto, acotado; no
/// el bucle de conversacion con tool-use de la Fase 2, que por su duracion
/// (10-30s, varias vueltas) no puede correr sincrono dentro de una Server
/// Action — ver la nota de arquitectura en `docs/PENDIENTES.md`.
const TOPE_PRUEBA_MS = 15_000;

/// Recorta y quita cualquier rastro de la clave del texto de error de un
/// proveedor ajeno — mismo cuidado que `probarRemitente` con la contrasena
/// SMTP.
function mensajeSaneado(texto: string, clave: string): string {
  return texto.replaceAll(clave, "***").slice(0, 300);
}

async function probarClaude(config: ConfigLlamadaIa): Promise<RespuestaProveedorIa> {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 16,
        messages: [{ role: "user", content: "Responde solo con la palabra: listo" }],
      }),
      signal: AbortSignal.timeout(TOPE_PRUEBA_MS),
    });

    if (!r.ok) {
      const cuerpo = await r.text();
      return { ok: false, error: mensajeSaneado(`(${r.status}) ${cuerpo}`, config.apiKey) };
    }
    return { ok: true };
  } catch (error) {
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

async function probarOpenAiCompatible(
  config: ConfigLlamadaIa,
): Promise<RespuestaProveedorIa> {
  if (!config.urlBase) {
    return {
      ok: false,
      error: "Este proveedor necesita una URL base y no tiene ninguna guardada.",
    };
  }

  try {
    const r = await fetch(`${config.urlBase}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelo,
        max_tokens: 16,
        messages: [{ role: "user", content: "Responde solo con la palabra: listo" }],
      }),
      signal: AbortSignal.timeout(TOPE_PRUEBA_MS),
    });

    if (!r.ok) {
      const cuerpo = await r.text();
      return { ok: false, error: mensajeSaneado(`(${r.status}) ${cuerpo}`, config.apiKey) };
    }
    return { ok: true };
  } catch (error) {
    const texto = error instanceof Error ? error.message : String(error);
    return { ok: false, error: mensajeSaneado(texto, config.apiKey) };
  }
}

/**
 * Que sabe LLAMAR GCM hoy. Anadir un proveedor nuevo es una entrada mas
 * aqui, sin migracion: el `tipo` de la fila es texto libre (ver
 * `AgenteIaProveedor` en el esquema), y un tipo sin adaptador registrado se
 * puede guardar igual — solo que `probarProveedorIa` lo dice en vez de
 * fallar en silencio.
 */
const ADAPTADORES: Record<string, AdaptadorProveedorIa> = {
  claude: { probar: probarClaude },
  openai_compatible: { probar: probarOpenAiCompatible },
};

// ---------------------------------------------------------------------------
// Lo que usa la pantalla
// ---------------------------------------------------------------------------

export interface ProveedorIaResumen {
  id: string;
  tipo: string;
  nombre: string;
  urlBase: string | null;
  modelo: string;
  /// Nunca la clave. Solo si hay una guardada, para que el formulario pueda
  /// decir «déjalo vacío para conservarla».
  hayClave: boolean;
  activo: boolean;
  verificadoAt: Date | null;
  ultimoError: string | null;
  ultimoErrorAt: Date | null;
}

export async function listarProveedoresIa(
  sesion: SesionActiva,
): Promise<ProveedorIaResumen[]> {
  // El MISMO permiso que gobierna el resto de la configuracion de empresa
  // (RemitenteCorreo, emisores de SMS): guardar una clave de proveedor
  // externo es ya un acto de administracion.
  if (!puede(sesion, "configuracion:editar")) return [];

  const [filas, empresa] = await Promise.all([
    prisma.agenteIaProveedor.findMany({
      where: { companyId: sesion.companyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        tipo: true,
        nombre: true,
        urlBase: true,
        modelo: true,
        apiKeyCifrada: true,
        verificadoAt: true,
        ultimoError: true,
        ultimoErrorAt: true,
      },
    }),
    prisma.company.findUnique({
      where: { id: sesion.companyId },
      select: { proveedorIaActivoId: true },
    }),
  ]);

  const activoId = empresa?.proveedorIaActivoId ?? null;

  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    nombre: f.nombre,
    urlBase: f.urlBase,
    modelo: f.modelo,
    hayClave: f.apiKeyCifrada.length > 0,
    activo: f.id === activoId,
    verificadoAt: f.verificadoAt,
    ultimoError: f.ultimoError,
    ultimoErrorAt: f.ultimoErrorAt,
  }));
}

export type ResultadoProveedorIa = { ok: true } | { ok: false; error: string };

const SIN_PERMISO: ResultadoProveedorIa = {
  ok: false,
  error: "No tienes permiso para configurar los proveedores de IA.",
};

/**
 * Guarda (o actualiza) un proveedor de IA de la empresa.
 *
 * La clave vacia al editar significa «conserva la que ya estaba», mismo
 * criterio que `guardarRemitente`. Cambiar cualquier dato borra
 * `verificadoAt`: lo que se probo era la configuracion anterior.
 */
export async function guardarProveedorIa(
  sesion: SesionActiva,
  datos: DatosProveedorIa,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  if (!hayLlaveDeCifrado()) {
    return {
      ok: false,
      error:
        "Esta instalación no tiene configurada la clave de cifrado, así que no se puede guardar la clave de un proveedor de IA. Habla con quien administra el servidor.",
    };
  }

  const existente = datos.id
    ? await prisma.agenteIaProveedor.findFirst({
        where: { id: datos.id, companyId: sesion.companyId },
        select: { id: true, apiKeyCifrada: true },
      })
    : null;
  if (datos.id && !existente) {
    return { ok: false, error: "No se encontró ese proveedor." };
  }

  const v = validarProveedorIa(datos, existente === null);
  if (!v.ok) return { ok: false, error: v.error };

  // Clave vacia al editar = se conserva la guardada.
  const apiKeyCifrada =
    v.datos.apiKey.length > 0 ? cifrar(v.datos.apiKey) : existente!.apiKeyCifrada;
  if (apiKeyCifrada === null) {
    return {
      ok: false,
      error: "No se pudo cifrar la clave. Revisa la configuración del servidor.",
    };
  }

  const comun = {
    tipo: v.datos.tipo,
    nombre: v.datos.nombre,
    urlBase: v.datos.urlBase,
    modelo: v.datos.modelo,
    apiKeyCifrada,
    // Lo probado era la configuracion vieja.
    verificadoAt: null,
    ultimoError: null,
    ultimoErrorAt: null,
  };

  const fila = existente
    ? await prisma.agenteIaProveedor.update({
        where: { id: existente.id },
        data: comun,
        select: { id: true },
      })
    : await prisma.agenteIaProveedor.create({
        data: { ...comun, companyId: sesion.companyId, configuradoPor: quien(sesion) },
        select: { id: true },
      });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "AgenteIaProveedor",
      entidadId: fila.id,
      accion: existente ? "UPDATE" : "CREATE",
      // La clave NUNCA se audita, igual que la contrasena del buzon.
      despues: {
        tipo: v.datos.tipo,
        nombre: v.datos.nombre,
        modelo: v.datos.modelo,
        claveCambiada: v.datos.apiKey.length > 0,
      },
    },
  });

  return { ok: true };
}

/** Borra un proveedor. Si era el activo, deja a la empresa sin ninguno. */
export async function eliminarProveedorIa(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  const fila = await prisma.agenteIaProveedor.findFirst({
    where: { id, companyId: sesion.companyId },
    select: { id: true, nombre: true },
  });
  // Ya no esta: el estado pedido es el que hay.
  if (!fila) return { ok: true };

  await prisma.$transaction(async (tx) => {
    // No confiar solo en `onDelete: SetNull` del esquema: se limpia el
    // puntero explicitamente, en la misma transaccion, mismo principio que
    // `quitarDeObra` no confia solo en la clave unica de la base.
    await tx.company.updateMany({
      where: { id: sesion.companyId, proveedorIaActivoId: id },
      data: { proveedorIaActivoId: null },
    });
    await tx.agenteIaProveedor.delete({ where: { id: fila.id } });
    await tx.auditLog.create({
      data: {
        companyId: sesion.companyId,
        userId: sesion.userId,
        entidad: "AgenteIaProveedor",
        entidadId: fila.id,
        accion: "DELETE",
        antes: { nombre: fila.nombre },
      },
    });
  });

  return { ok: true };
}

/**
 * Activa un proveedor: sera el que use el agente de IA.
 *
 * Exige `verificadoAt`: activar una clave sin probar seria descubrir que
 * esta mal el dia que el agente la necesite de verdad, no antes.
 */
export async function activarProveedorIa(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  const fila = await prisma.agenteIaProveedor.findFirst({
    where: { id, companyId: sesion.companyId },
    select: { id: true, verificadoAt: true },
  });
  if (!fila) return { ok: false, error: "No se encontró ese proveedor." };
  if (!fila.verificadoAt) {
    return {
      ok: false,
      error:
        "Pruébalo antes de activarlo: activar una clave sin probar podría dejar el agente sin poder responder el día que haga falta.",
    };
  }

  await prisma.company.update({
    where: { id: sesion.companyId },
    data: { proveedorIaActivoId: id },
  });

  await prisma.auditLog.create({
    data: {
      companyId: sesion.companyId,
      userId: sesion.userId,
      entidad: "AgenteIaProveedor",
      entidadId: id,
      accion: "UPDATE",
      despues: { evento: "activar" },
    },
  });

  return { ok: true };
}

/**
 * Prueba un proveedor de verdad: descifra la clave y manda un mensaje
 * minimo real. El resultado se guarda en la fila, igual que
 * `probarRemitente` — asi la pantalla distingue «configurado» de
 * «configurado y funciona».
 */
export async function probarProveedorIa(
  sesion: SesionActiva,
  id: string,
): Promise<ResultadoProveedorIa> {
  if (!puede(sesion, "configuracion:editar")) return SIN_PERMISO;

  const fila = await prisma.agenteIaProveedor.findFirst({
    where: { id, companyId: sesion.companyId },
    select: { id: true, tipo: true, urlBase: true, modelo: true, apiKeyCifrada: true },
  });
  if (!fila) return { ok: false, error: "No se encontró ese proveedor." };

  const adaptador = ADAPTADORES[fila.tipo];
  if (!adaptador) {
    return {
      ok: false,
      error: `Este tipo de proveedor ("${fila.tipo}") todavía no tiene conexión implementada en GCM.`,
    };
  }

  const apiKey = descifrar(fila.apiKeyCifrada);
  if (apiKey === null) {
    return {
      ok: false,
      error: "No se pudo leer la clave guardada. Vuelve a guardarla e inténtalo otra vez.",
    };
  }

  const r = await adaptador.probar({ apiKey, urlBase: fila.urlBase, modelo: fila.modelo });

  if (r.ok) {
    await prisma.agenteIaProveedor.update({
      where: { id: fila.id },
      data: { verificadoAt: new Date(), ultimoError: null, ultimoErrorAt: null },
    });
    return { ok: true };
  }

  await prisma.agenteIaProveedor.update({
    where: { id: fila.id },
    data: { verificadoAt: null, ultimoError: r.error, ultimoErrorAt: new Date() },
  });
  return { ok: false, error: `El proveedor rechazó la prueba: ${r.error}` };
}
