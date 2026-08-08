/**
 * Esqueleto por defecto de las pantallas del area privada.
 *
 * Cubre las rutas que no tienen su propio `loading` (obras, empresa,
 * proveedores...): en cuanto se navega a ellas, Next pinta esto de inmediato
 * en vez de dejar la pantalla en blanco mientras el servidor prepara los
 * datos. Es deliberadamente generico —un titulo y unas filas—; las pantallas
 * con forma muy propia, como el panel, traen el suyo.
 */
export default function CargandoDashboard() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <Bloque className="h-4 w-24" />
        <Bloque className="h-7 w-56" />
        <Bloque className="h-4 w-80 max-w-full" />
      </div>

      <div
        className="space-y-4 rounded-xl border p-5"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Bloque key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

function Bloque({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ backgroundColor: "color-mix(in oklab, var(--borde) 70%, transparent)" }}
    />
  );
}
