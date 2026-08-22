/**
 * Esqueleto del cronograma mientras carga.
 *
 * Es de las pantallas mas pesadas de la app: cronograma, curva S, EVM,
 * ritmo, hitos, cadena critica y la tabla completa de tareas, todo en la
 * misma carga. Mismo criterio que `tablero/loading.tsx`: la forma llega
 * antes que los datos, para que la espera no se sienta como una pantalla
 * rota.
 */
export default function CargandoCronograma() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el cronograma">
      <div className="space-y-2">
        <Bloque className="h-4 w-24" />
        <Bloque className="h-7 w-56" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Tarjeta key={i}>
            <Bloque className="h-3 w-16" />
            <Bloque className="mt-2 h-5 w-12" />
          </Tarjeta>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <Bloque className="h-4 w-32" />
          <Bloque className="mt-4 h-40 w-full" />
        </Tarjeta>
        <Tarjeta>
          <Bloque className="h-4 w-24" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Bloque className="h-24 w-full rounded-xl" />
            <Bloque className="h-24 w-full rounded-xl" />
          </div>
        </Tarjeta>
      </div>

      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <div
          className="space-y-3 p-4"
          style={{ backgroundColor: "var(--superficie)" }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Bloque key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      {children}
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
