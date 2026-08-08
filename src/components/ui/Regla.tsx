/**
 * Reglas decorativas que toman el color de la paleta activa.
 *
 * Usan `var(--color-marca-500)`, asi que cambiar de paleta las repinta solas
 * sin que estos componentes sepan nada de colores.
 *
 * Son **decoracion**: van con `aria-hidden` para que un lector de pantalla no
 * las anuncie —no separan secciones con significado, solo dan aire— y con
 * `print:hidden`, porque en papel serian una raya de tinta que no aporta.
 */

/**
 * Regla horizontal que cruza el ancho disponible.
 *
 * El degradado se desvanece en los extremos en vez de cortar en seco: una
 * linea que termina de golpe contra el borde de la pantalla parece un error
 * de maquetacion, y una que se apaga parece intencionada.
 */
export function Regla({
  intensidad = "media",
}: {
  /// `suave` para separar dentro de un bloque; `media` entre secciones.
  intensidad?: "suave" | "media";
}) {
  const opacidad = intensidad === "suave" ? 55 : 90;
  const grosor = intensidad === "suave" ? "h-0.5" : "h-1";

  return (
    <div
      aria-hidden="true"
      className={`${grosor} w-full rounded-full print:hidden`}
      style={{
        background: `linear-gradient(
          to right,
          transparent,
          color-mix(in oklab, var(--color-marca-500) ${opacidad}%, transparent) 12%,
          color-mix(in oklab, var(--color-marca-500) ${opacidad}%, transparent) 88%,
          transparent
        )`,
      }}
    />
  );
}

/**
 * Acento vertical para encabezar una seccion.
 *
 * Va al lado del titulo y NO cruzando la rejilla: una vertical que atravesara
 * el panel entero partiria las tarjetas por la mitad, que es justo lo que una
 * rejilla de tarjetas no debe tener.
 */
export function AcentoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-stretch gap-3">
      <span
        aria-hidden="true"
        className="w-1 shrink-0 rounded-full print:hidden"
        style={{
          background: `linear-gradient(
            to bottom,
            var(--color-marca-500),
            color-mix(in oklab, var(--color-marca-500) 30%, transparent)
          )`,
        }}
      />
      <div>{children}</div>
    </div>
  );
}
