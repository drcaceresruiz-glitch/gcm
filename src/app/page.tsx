export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-medium tracking-wide text-marca-600 uppercase">
          Fase 1 &middot; Cimientos
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
          GCM &mdash; Gestor de Construccion y Mantenimiento
        </h1>
        <p className="mt-4 text-pretty opacity-80">
          Control de obra multiproyecto: presupuesto por partidas, avance
          fisico y resultado economico.
        </p>
      </div>

      <div className="rounded-lg border p-4 text-sm" style={{ borderColor: "var(--borde)" }}>
        <p className="font-medium">Estado del entorno</p>
        <p className="mt-1 opacity-70">
          Estructura base instalada. Pendiente: motor de base de datos local y
          primera migracion.
        </p>
      </div>
    </main>
  );
}
