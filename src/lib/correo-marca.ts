/**
 * Con que marca sale rotulado un correo.
 *
 * **LA REGLA: manda la CONSTRUCTORA, no GCM.** Un correo que una constructora
 * le manda a su contratista tiene que llegar rotulado con ella; el
 * contratista trabaja para la constructora, no para el sistema con el que
 * ella escribe. GCM va al pie, pequeno, que es el sitio de quien pone la
 * herramienta.
 *
 * Los correos que NO son de una empresa concreta —el codigo de acceso a GCM,
 * por ejemplo— siguen firmando GCM, porque de esos si es el remitente.
 *
 * Vive aqui, separado del `mailer`, para poder PROBARLO: el servicio importa
 * `server-only` y ademas se planta antes de llegar a esto cuando no hay SMTP
 * configurado, asi que dentro de el esta regla no se puede comprobar.
 */

import { escaparHtml } from "./html";

/// Las tres costuras que `plantilla` deja en el HTML. Son comentarios: si
/// nadie los sustituye no se ven, y no queda ni un hueco ni una imagen rota.
export const MARCA_LOGO = "<!--GCM_LOGO-->";
export const MARCA_NOMBRE = "<!--GCM_MARCA-->";
export const MARCA_PIE = "<!--GCM_FIRMA-->";

/// Como se referencia el logo incrustado desde el HTML.
export const CID_LOGO = "logo-de-empresa";

/// La marca de GCM, para los correos que no son de ninguna empresa.
export const MARCA_GCM = "GCM - Gestion en Construccion Moderna";

export interface MarcaCorreo {
  razonSocial: string;
  /// Si ademas hay logo que incrustar.
  conLogo: boolean;
}

/**
 * Pone la marca en el HTML ya compuesto.
 *
 * @param marca `null` para los correos de GCM (sin empresa detras).
 */
export function rotularCorreo(html: string, marca: MarcaCorreo | null): string {
  return (
    html
      .replace(
        MARCA_LOGO,
        marca?.conLogo
          ? `<img src="cid:${CID_LOGO}" alt="" height="28" style="height:28px;width:auto;vertical-align:middle;margin-right:10px;border:0;">`
          : "",
      )
      // SE ESCAPA. La razon social la teclea una persona al dar de alta la
      // empresa; sin escapar, un `<a href>` ahi saldria como enlace de verdad
      // en la cabecera de cada correo que manda esa constructora.
      .replace(MARCA_NOMBRE, marca ? escaparHtml(marca.razonSocial) : MARCA_GCM)
      .replace(
        MARCA_PIE,
        marca
          ? `<p style="color:#9aa8ae;font-size:11px;margin:4px 4px 0;">Con tecnología de GCM</p>`
          : "",
      )
  );
}
