import { User } from "lucide-react";

/**
 * Avatar circular reutilizable.
 *
 * Con foto, la recorta a un circulo (`object-cover`); sin ella, muestra las
 * iniciales del nombre sobre el color de marca, y si no hay nombre, un icono.
 * Es presentacion pura, sin estado, asi que sirve igual en la cabecera
 * (servidor) que en el editor de foto (cliente).
 *
 * La imagen es un data URL ya recortado en el cliente al guardarla, no una URL
 * remota: por eso un `<img>` normal y no `next/image`.
 */
export function Avatar({
  nombre,
  foto,
  className = "size-20",
  textoClase = "text-2xl",
}: {
  nombre: string;
  foto: string | null;
  /// Tamano del circulo (clase de Tailwind, p. ej. "size-8").
  className?: string;
  /// Tamano de las iniciales, para que acompanen al del circulo.
  textoClase?: string;
}) {
  const iniciales = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border ${className}`}
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--color-marca-500)" }}
    >
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} alt="" className="size-full object-cover" />
      ) : iniciales ? (
        <span className={`${textoClase} font-semibold text-white`}>{iniciales}</span>
      ) : (
        <User className="size-1/2 text-white" aria-hidden="true" />
      )}
    </div>
  );
}
