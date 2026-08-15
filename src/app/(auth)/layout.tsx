import { Mascota } from "@/components/ui/Mascota";
import { HeroPortada } from "@/components/portada/HeroPortada";
import { SelloMetodologia } from "@/components/ui/SelloMetodologia";

/**
 * El marco de las pantallas de acceso (login, recuperar clave, etc.).
 *
 * En pantalla ancha son dos paneles: a la izquierda la portada —el carrusel
 * de frases de la filosofia de la casa sobre fotos de obra— y a la derecha
 * la tarjeta de siempre. Es la unica cara publica de GCM, asi que es donde
 * la portada trabaja; el mismo componente servira para la pagina de venta
 * cuando exista.
 *
 * En pantallas angostas el carrusel no se pinta: quien entra desde la obra
 * con el telefono viene a INGRESAR, y cada segundo de carga y de scroll que
 * se le ponga delante del formulario es un estorbo, no una bienvenida.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[3fr_2fr]">
      <div className="hidden lg:block">
        <HeroPortada className="min-h-dvh" />
      </div>

      <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <header className="mb-8 text-center">
            <div className="mb-2 flex justify-center">
              <Mascota pose="saludando" alto={210} flotar prioritaria />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">GCM</h1>
            <p className="mt-1 text-sm opacity-70">
              Gestión en Construcción Moderna
            </p>

            {/* Aqui el sello SI lleva su detalle: es lo primero que ve quien
                no conoce GCM, y decir sobre que esta construido explica mas
                que cualquier eslogan. */}
            <SelloMetodologia className="mt-4" />
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
    </div>
  );
}
