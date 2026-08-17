import { AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * El aviso que deja un formulario despues de enviarse.
 *
 * Estaba escrito dos veces —una por pantalla que enviaba algo— y esa es la
 * forma tipica de que dos avisos del mismo sistema acaben con distinto color y
 * distinto icono sin que nadie lo decida. Ver [[cambios-propagan]].
 *
 * `role="status"` para que un lector de pantalla lo anuncie sin robar el foco:
 * quien acaba de pulsar «Enviar» tiene que enterarse de si salio.
 */
export function Nota({
  tono,
  children,
}: {
  tono: "peligro" | "exito";
  children: React.ReactNode;
}) {
  const color = `var(--color-${tono})`;
  const Icono = tono === "exito" ? CheckCircle2 : AlertCircle;

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)` }}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
