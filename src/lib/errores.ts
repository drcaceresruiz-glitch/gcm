/**
 * Errores del dominio que cruzan capas.
 *
 * `SinPermisoError` vivia DUPLICADA en tres servicios —obras, perfil y
 * usuarios— con el mismo nombre, el mismo mensaje y el mismo cuerpo. Tres
 * clases distintas que se llaman igual.
 *
 * No fallaba nada, porque resulta que nadie la capturaba por tipo: se lanzaba
 * y subia hasta el limite de error de Next. Pero es una trampa armada: el dia
 * que alguien escriba
 *
 *     catch (e) { if (e instanceof SinPermisoError) ... }
 *
 * importandola de UNO de los tres, dejaria pasar en silencio las que lanzan
 * los otros dos. Un `instanceof` que falla no da error: elige la rama
 * equivocada, que es la peor forma de fallar.
 *
 * Vive en `lib/` y no en un servicio porque no tiene nada que ver con datos:
 * es una clase pura, como `Pagina` o los permisos.
 */

export class SinPermisoError extends Error {
  constructor(mensaje = "No tienes permiso para esta operacion.") {
    super(mensaje);
    this.name = "SinPermisoError";
  }
}
