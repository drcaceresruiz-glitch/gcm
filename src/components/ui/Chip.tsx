import type { LucideIcon } from "lucide-react";

/**
 * La etiqueta de estado, en un solo sitio.
 *
 * Estaba escrita tres veces —el `Estado` de las ordenes, el estado de obra
 * del panel y el de los movimientos— y ya habian divergido: mismo concepto
 * con tres redondeos, tres tamanos de letra y dos criterios de color
 * distintos. Aqui el TONO es lo unico que se elige, y de el salen fondo,
 * texto y borde a la vez.
 */

export type TonoChip = "neutro" | "curso" | "exito" | "alerta" | "peligro";

const COLOR: Record<TonoChip, string> = {
  // El neutro no usa `--texto` porque en el tema oscuro daria un chip casi
  // blanco: se apoya en el borde, que si se adapta a los dos temas.
  neutro: "var(--borde)",
  curso: "var(--color-marca-500)",
  exito: "var(--color-exito)",
  alerta: "var(--color-alerta)",
  peligro: "var(--color-peligro)",
};

interface Props {
  tono: TonoChip;
  icono?: LucideIcon;
  children: React.ReactNode;
}

export function Chip({ tono, icono: Icono, children }: Props) {
  const color = COLOR[tono];

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{
        // Fondo muy diluido y borde del mismo color: asi el chip se lee sobre
        // fondo claro y sobre fondo oscuro sin dos juegos de reglas.
        backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
        borderColor: `color-mix(in oklab, ${color} 35%, transparent)`,
      }}
    >
      {Icono && (
        <Icono className="size-3.5 shrink-0" style={{ color }} aria-hidden="true" />
      )}
      {children}
    </span>
  );
}
