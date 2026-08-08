import { Mascota } from "@/components/ui/Mascota";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <div className="mb-2 flex justify-center">
            <Mascota pose="saludando" ancho={130} alto={210} flotar />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">GCM</h1>
          <p className="mt-1 text-sm opacity-70">
            Gestion en Construccion Moderna
          </p>
        </header>

        <div
          className="rounded-xl border p-6 shadow-sm"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
