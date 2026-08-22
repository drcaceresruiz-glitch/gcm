/**
 * Textos del agente conversacional compartidos entre el servicio (que los
 * escribe) y la pantalla (que necesita reconocerlos para, por ejemplo,
 * ofrecer un enlace en vez de solo el texto plano). Sin base de datos, sin
 * "server-only": un componente cliente tiene que poder importar esto.
 */

/// El error exacto cuando la empresa no tiene un proveedor de IA activo.
/// `Asistente.tsx` lo compara tal cual para decidir si ademas del texto
/// muestra un enlace directo a Configuracion.
export const SIN_PROVEEDOR_ACTIVO =
  "Configura y activa un proveedor de IA en Configuración antes de usar el asistente.";
