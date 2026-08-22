/**
 * Contenedor de contenido sobre el fondo de la pagina.
 *
 * Los formularios largos —datos de la empresa, alta de obra— se pintaban
 * sueltos sobre el fondo: sin borde ni superficie, los campos parecian
 * flotar y ninguna seccion tenia principio ni final. Aqui se apoyan sobre
 * una superficie blanca elevada, que es lo que separa el formulario del
 * papel.
 */
export function Tarjeta({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  /// Para enlazar aqui con un ancla (`#id`) desde otra pantalla —el
  /// tablero, por ejemplo—. Se le suma `scroll-mt-20` para que el ancla no
  /// deje el titulo pegado al borde de arriba, tapado por la cabecera fija.
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`elevacion-1 rounded-xl border p-5 sm:p-6 ${id ? "scroll-mt-20" : ""} ${className}`}
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--superficie)",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Una seccion dentro de una tarjeta, con su titulo y su explicacion.
 *
 * Lleva una regla superior en color de marca —salvo la primera— para que un
 * formulario de cuatro bloques se lea como cuatro bloques y no como una
 * lista larga de campos.
 */
export function SeccionTarjeta({
  titulo,
  nota,
  primera = false,
  children,
}: {
  titulo: string;
  nota?: string;
  /// La primera no lleva separador arriba: no hay nada de lo que separarla.
  primera?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={primera ? "" : "mt-8 border-t pt-6"}
      style={primera ? undefined : { borderColor: "var(--borde)" }}
    >
      <div className="mb-4 flex items-stretch gap-2.5">
        <span
          aria-hidden="true"
          className="w-1 shrink-0 rounded-full print:hidden"
          style={{ backgroundColor: "var(--color-marca-500)" }}
        />
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          {nota && <p className="mt-0.5 text-sm opacity-70">{nota}</p>}
        </div>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
