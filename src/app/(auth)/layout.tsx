import { HardHat } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-marca-500)" }}
          >
            <HardHat className="size-7 text-white" aria-hidden="true" />
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
