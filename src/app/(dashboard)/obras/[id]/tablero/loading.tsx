/**
 * Esqueleto del tablero de supervision mientras carga.
 *
 * Esta pantalla trae hasta once modulos con sus propias consultas —traerlos
 * todos tumbo produccion en agosto de 2026, ver el comentario de
 * `Tablero.tsx`—, asi que puede tardar mas que la mayoria. Sin esto, esa
 * espera se siente como pantalla en blanco; con la misma forma de las
 * tarjetas ya se ve que la pantalla es esta, antes de que llegue un solo dato.
 */
export default function CargandoTablero() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando el tablero">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Bloque className="h-5 w-40" />
          <Bloque className="h-3 w-56" />
        </div>
        <Bloque className="h-8 w-24 rounded-lg" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border p-4"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
          >
            <Bloque className="h-3 w-20" />
            <Bloque className="mt-3 h-6 w-16" />
            <Bloque className="mt-3 h-3 w-full" />
            <Bloque className="mt-1.5 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Un rectangulo gris que late. El color sale del borde para no chillar. */
function Bloque({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
    />
  );
}
