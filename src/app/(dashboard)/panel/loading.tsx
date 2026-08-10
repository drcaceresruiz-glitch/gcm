/**
 * Esqueleto del panel mientras se cargan los datos.
 *
 * Next lo muestra al INSTANTE al entrar, y lo sustituye por la pagina real
 * cuando sus consultas terminan. Sin esto, la pantalla se queda en blanco
 * hasta que todo el panel resuelve —varias consultas a la vez—, que es justo
 * lo que se siente como "lento". Un esqueleto con la misma forma no acelera
 * los datos, pero hace que la app responda de inmediato.
 */
export default function CargandoPanel() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el panel">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Bloque className="h-7 w-32" />
          <Bloque className="h-4 w-48" />
        </div>
        <Bloque className="h-9 w-32 rounded-lg" />
      </div>

      {/* Las cuatro cifras. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Tarjeta key={i}>
            <Bloque className="h-3 w-20" />
            <Bloque className="mt-2 h-6 w-28" />
            <Bloque className="mt-2 h-3 w-24" />
          </Tarjeta>
        ))}
      </div>

      {/* El buscador. */}
      <Bloque className="h-16 w-full rounded-xl" />

      {/* La rejilla de obras. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Tarjeta key={i}>
            <div className="flex items-center justify-between">
              <Bloque className="h-3 w-24" />
              <Bloque className="h-5 w-20 rounded-full" />
            </div>
            <Bloque className="mt-3 h-4 w-3/4" />
            <Bloque className="mt-2 h-3 w-1/2" />
            <div className="mt-4 flex gap-3 border-t pt-3" style={{ borderColor: "var(--borde)" }}>
              <Bloque className="h-8 w-1/2" />
              <Bloque className="h-8 w-1/2" />
            </div>
          </Tarjeta>
        ))}
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
