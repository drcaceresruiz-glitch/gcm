import Link from "next/link";
import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  contarSolicitudesPendientes,
  obtenerFotoPerfil,
} from "@/services/perfil.service";
import { puede } from "@/lib/rbac";
import {
  Navegacion,
  type EnlaceEmpresa,
} from "@/components/navegacion/Navegacion";
import { RelojPeru } from "@/components/ui/RelojPeru";
import { FraseRotativa } from "@/components/portada/FraseRotativa";
import { CierrePorInactividad } from "@/components/navegacion/CierrePorInactividad";
import { PieDePagina } from "@/components/navegacion/PieDePagina";

/**
 * Area privada.
 *
 * Aqui SI se valida de verdad: `obtenerSesion` consulta la base en cada
 * peticion y comprueba que el token siga vigente y el usuario siga activo.
 * El middleware solo miro que existiera una cookie.
 */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // Nadie navega por el sistema con una clave temporal sin estrenar.
  if (sesion.mustChangePassword) redirect("/cambiar-clave");

  // En paralelo: son dos consultas independientes y encadenarlas solo suma
  // sus latencias. El numerito de solicitudes solo se pide si el rol las puede
  // resolver; para el resto la funcion devuelve cero sin tocar la base.
  const [pendientes, foto] = await Promise.all([
    contarSolicitudesPendientes(sesion),
    obtenerFotoPerfil(sesion),
  ]);

  // Los permisos se resuelven aqui y no en el componente de navegacion: la
  // comprobacion se queda en el servidor y al cliente solo viaja la lista de
  // enlaces que esa persona puede ver.
  const enlaces = [
    puede(sesion, "proveedor:leer") && {
      href: "/empresa/proveedores",
      etiqueta: "Proveedores",
      clave: "proveedores",
      grupo: "compras",
    },
    puede(sesion, "orden:leer") && {
      href: "/empresa/formas-pago",
      etiqueta: "Formas de pago",
      clave: "formasPago",
      grupo: "compras",
    },
    puede(sesion, "usuario:leer") && {
      href: "/empresa/usuarios",
      etiqueta: "Usuarios",
      clave: "usuarios",
      grupo: "personas",
    },
    puede(sesion, "permiso:leer") && {
      href: "/empresa/permisos",
      etiqueta: "Permisos",
      clave: "permisos",
      grupo: "personas",
    },
    puede(sesion, "usuario:editar") && {
      href: "/empresa/solicitudes",
      etiqueta: "Solicitudes de perfil",
      clave: "solicitudes",
      grupo: "personas",
      badge: pendientes,
    },
    puede(sesion, "empresa:editar") && {
      href: "/empresa/datos",
      etiqueta: "Datos de la empresa",
      clave: "empresa",
      grupo: "empresa",
    },
    // UNA entrada, no una por ajuste: el desplegable de empresa ya llego a
    // tener siete seguidas y hubo que agruparlo. Lo que crezca, que crezca
    // dentro de la pagina.
    puede(sesion, "configuracion:editar") && {
      href: "/empresa/configuracion",
      etiqueta: "Configuración",
      clave: "configuracion",
      grupo: "empresa",
    },
  ].filter(Boolean) as EnlaceEmpresa[];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Cierra la sesion sola tras un rato sin actividad. No pinta nada. */}
      <CierrePorInactividad />

      {/* `print:hidden` es lo que permite que las pantallas que son
          documentos —la orden que se le manda al proveedor— salgan por la
          impresora sin la barra de navegacion encima. */}
      <header
        // `z-40`: la cabecera y sus desplegables tienen que quedar SIEMPRE
        // por encima del contenido. El panel de cifras crea su propio
        // contexto de apilamiento (z-20, para que su popup de alertas gane a
        // los filtros), asi que la cabecera necesita superarlo o el menu de
        // usuario se abriria por detras de las tarjetas.
        className="elevacion-1 sticky top-0 z-40 border-b print:hidden"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--superficie)",
        }}
      >
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          {/* El logotipo era un `div`. Convertirlo en enlace es lo que hace
              que se pueda volver al panel desde cualquier pantalla, que
              hasta ahora dependia de que cada pagina se escribiera el suyo. */}
          <Link href="/panel" className="flex items-center gap-2.5">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: "var(--color-marca-500)" }}
            >
              <HardHat className="size-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold">GCM</span>
          </Link>

          {/* En el medio de la cabecera y no en un rincon: es la unica
              pantalla que se ve SIEMPRE, en cualquier pagina del sistema, y
              una obra se rige por fechas de calendario -saber que dia y hora
              es en Peru tiene que estar a la vista, no a un clic.
              Debajo, la frase de la casa rotando; solo en pantalla ancha,
              porque en un movil ese espacio no existe. */}
          <div className="flex min-w-0 flex-col items-center gap-2">
            <RelojPeru />
            <FraseRotativa className="hidden lg:flex" />
          </div>

          <Navegacion
            empresa={enlaces}
            // Quien opera GCM. No va por `puede()` porque no es un permiso
            // DENTRO de la empresa: esta por encima de ella y se concede en el
            // servidor. Por lo mismo tampoco va en el menu de la empresa.
            operador={
              sesion.esOperador
                ? { href: "/operador", etiqueta: "Constructoras" }
                : null
            }
            usuario={{
              nombre: `${sesion.nombres} ${sesion.apellidos}`,
              rol: sesion.role,
              foto,
            }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        {children}
      </main>

      <PieDePagina />
    </div>
  );
}
