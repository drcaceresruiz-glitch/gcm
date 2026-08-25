import Link from "next/link";

/**
 * Un enlace de accion con aspecto de boton.
 *
 * El degradado se construye con las variables de marca, NO con colores
 * escritos a mano: la aplicacion tiene cinco paletas y modo claro/oscuro, y un
 * hexadecimal fijo dejaria el boton fuera de tono en cuatro de ellas.
 *
 * Va de `marca-500` a `marca-700`, con lo que el tono medio cae en `marca-600`
 * —el mismo de los botones primarios que ya tiene la aplicacion («Nueva obra»,
 * «Sincronizar ventana»)—. Se probo mas oscuro, de 700 a 900, buscando
 * contraste, y el resultado fue que estos eran los unicos botones oscuros de
 * la pantalla y desentonaban: el contraste era mejor pero la pieza no
 * pertenecia al conjunto.
 *
 * DONDE SE USA Y DONDE NO. La regla entera, decidida el 25 de agosto de 2026,
 * porque «convertirlo todo en boton hace que nada destaque» y hasta ese dia
 * cada pantalla lo resolvia a mano con su propio `className`:
 *
 * - **SI**: enlaces de ACCION, los que llevan a otra pantalla A HACER ALGO
 *   —«Nueva obra», «Registrar orden», «Cargar cronograma», «Generar el
 *   presupuesto contractual»—. Es el paso principal de la pantalla donde
 *   estan, y solo deberia haber uno destacado a la vez.
 * - **NO, pestañas de navegacion.** Una pestaña dice DONDE ESTAS, no que vas
 *   a hacer; cinco botones solidos en fila no destacan ninguno y ademas
 *   mienten sobre lo que hacen.
 * - **NO, tarjetas enteras que son enlace.** El area pulsable ya es la
 *   tarjeta: meterle dentro un boton da dos objetivos de clic para el mismo
 *   destino.
 * - **NO, enlaces dentro de un parrafo.** Un boton en medio de una frase
 *   parte la lectura; ahi va un enlace de texto, subrayado o en color de
 *   marca.
 * - **NO, descargas.** Un `.pdf` o un `.xlsx` no te lleva a otra pantalla, y
 *   ademas se sirven con `<a>` y no con `next/link`. Comparten aspecto por su
 *   cuenta (ver `DescargarPresupuestos`).
 * - **NO, botones de formulario.** Eso es un `<button type="submit">`; que se
 *   parezcan no los hace lo mismo, y un enlace no envia nada.
 */
export function EnlaceBoton({
  href,
  children,
  icono: Icono,
  posicionIcono = "derecha",
  tamano = "md",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  /// Icono lucide opcional.
  icono?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /// A la DERECHA cuando el icono dice "vas a otro sitio" (un chevron); a la
  /// IZQUIERDA cuando nombra la accion misma (un lapiz, una impresora). Puesto
  /// del lado que no le toca, el icono se lee como parte de la palabra.
  posicionIcono?: "izquierda" | "derecha";
  tamano?: "sm" | "md";
  className?: string;
}) {
  const medida =
    tamano === "sm"
      ? "gap-1.5 px-2.5 py-1.5 text-xs"
      : "gap-2 px-3.5 py-2 text-sm";

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-lg font-semibold text-white transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 ${medida} ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(135deg, var(--color-marca-500), var(--color-marca-700))",
        // La sombra se tine de la propia marca en vez de ser gris: sobre el
        // lavado de color del tablero, una sombra neutra se ve sucia. Suave,
        // que el boton se levante sin parecer que flota.
        boxShadow:
          "0 1px 2px color-mix(in oklab, var(--color-marca-900) 18%, transparent), 0 3px 8px color-mix(in oklab, var(--color-marca-900) 14%, transparent)",
        outlineColor: "var(--color-marca-600)",
      }}
    >
      {Icono && posicionIcono === "izquierda" && (
        <Icono className="size-3.5 shrink-0" aria-hidden={true} />
      )}
      {children}
      {Icono && posicionIcono === "derecha" && (
        <Icono className="size-3.5 shrink-0" aria-hidden={true} />
      )}
    </Link>
  );
}
