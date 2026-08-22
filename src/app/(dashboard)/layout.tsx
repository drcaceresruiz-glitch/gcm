import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, HardHat, Home } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import {
  contarSolicitudesPendientes,
  obtenerFotoPerfil,
} from "@/services/perfil.service";
import { contarAvisosSinLeer } from "@/services/avisos-bandeja";
import { contarSoporteSinLeer } from "@/services/soporte.service";
import { logoDeEmpresa } from "@/services/logo.service";
import { puede, ROLES, ETIQUETA_ROL } from "@/lib/rbac";
import {
  Navegacion,
  type EnlaceEmpresa,
} from "@/components/navegacion/Navegacion";
import { accionVerComo } from "@/app/(dashboard)/acciones";
import { RelojPeru } from "@/components/ui/RelojPeru";
import { ProveedorEtiquetas } from "@/components/navegacion/EtiquetasContexto";
import { Migas } from "@/components/navegacion/Migas";
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

  // En paralelo: son consultas independientes y encadenarlas solo suma sus
  // latencias. El numerito de solicitudes solo se pide si el rol las puede
  // resolver; para el resto la funcion devuelve cero sin tocar la base.
  //
  // El de avisos corre en CADA carga del area privada, asi que es un `count`
  // con su indice hecho a medida (`userId, leidoAt, createdAt`) y nada mas.
  const [pendientes, foto, avisosSinLeer, soporteSinLeer, logo] = await Promise.all([
    contarSolicitudesPendientes(sesion),
    obtenerFotoPerfil(sesion),
    contarAvisosSinLeer(sesion),
    // Mismo criterio que avisosSinLeer: un `count` acotado por companyId,
    // barato de pagar en cada carga.
    contarSoporteSinLeer(sesion),
    // Una fila por su clave primaria: entra en el mismo `Promise.all` para no
    // sumar su latencia a la de la cabecera, que se pinta en cada pantalla.
    logoDeEmpresa(sesion),
  ]);

  // Los permisos se resuelven aqui y no en el componente de navegacion: la
  // comprobacion se queda en el servidor y al cliente solo viaja la lista de
  // enlaces que esa persona puede ver.
  //
  // Tipado como `(EnlaceEmpresa | false)[]` y no dejado inferir: sin esto,
  // un `clave` que no existiera en `ICONOS` de `Navegacion.tsx` (como paso
  // con "archivo"/"migracion", el 22 de agosto de 2026: React revento con
  // el error #130 al intentar pintar un icono `undefined`) no lo veia ni
  // `tsc` ni el smoke test —solo se dispara al ABRIR el desplegable, y
  // ninguno de los dos hace clic—. El `as EnlaceEmpresa[]` que habia antes
  // silenciaba justo este chequeo; ahora cada literal se valida contra
  // `EnlaceEmpresa` ANTES del `.filter()`, no despues.
  const candidatosEmpresa: (EnlaceEmpresa | false)[] = [
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
    puede(sesion, "empresa:leer") && {
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
    // Mismo permiso y mismo destino que ya usa /panel: dos pantallas para la
    // misma operacion no deberian pedir permisos distintos para llegar.
    puede(sesion, "obra:restaurar") && {
      href: "/empresa/archivo",
      etiqueta: "Archivo",
      clave: "archivo",
      grupo: "empresa",
    },
    puede(sesion, "soporte:usar") && {
      href: "/empresa/soporte",
      etiqueta: "Soporte",
      clave: "soporte",
      grupo: "empresa",
      badge: soporteSinLeer,
    },
    puede(sesion, "empresa:migrar") && {
      href: "/empresa/migracion",
      etiqueta: "Llevarse la empresa",
      clave: "migracion",
      grupo: "empresa",
    },
  ];
  const enlaces = candidatosEmpresa.filter(
    (e): e is EnlaceEmpresa => e !== false,
  );

  return (
    // Envuelve TODO, `children` incluido: es la unica forma de que un layout
    // o una pagina de mas abajo —que son componentes de SERVIDOR— puedan
    // publicar una etiqueta con `<PublicarEtiqueta>` (cliente) y que la miga,
    // montada aqui arriba, la vea. React permite este anidamiento —un
    // componente cliente recibiendo hijos de servidor por `children`— aunque
    // el import vaya al reves.
    <ProveedorEtiquetas>
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
          {/* Con logo de empresa, manda el logo: quien trabaja aqui todo el
              dia tiene que ver SU constructora, no las siglas del sistema.
              Sin logo se queda el casco de siempre.

              La caja tiene alto fijo y la imagen va con `object-contain` y
              `w-auto`: cabe dentro sin salirse y sin estirarse, sea cuadrada
              o muy apaisada. El `max-w` evita que un logo panoramico se coma
              la cabecera entera. */}
          <Link href="/panel" className="flex items-center gap-2.5">
            {/* `.elevacion-3` —la sombra fuerte, la de los popovers— es lo
                que hace que el logo se vea MONTADO sobre la cabecera (que ya
                lleva su propia `.elevacion-1`, mas suave) en vez de plano
                contra ella. El fondo propio es necesario para que la sombra
                tenga un borde solido del que despegarse: sin el, el logo
                esta sobre el mismo color que el resto de la cabecera y la
                sombra se ve sucia, no "sobrepuesta". */}
            <div
              className="elevacion-3 flex items-center gap-2.5 rounded-lg p-1.5"
              style={{ backgroundColor: "var(--superficie)" }}
            >
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo.src}
                  alt={logo.alt}
                  width={logo.ancho}
                  height={logo.alto}
                  className="h-8 w-auto max-w-40 object-contain"
                />
              ) : (
                <>
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: "var(--color-marca-500)" }}
                  >
                    <HardHat className="size-4 text-white" aria-hidden="true" />
                  </div>
                  <span className="font-semibold">GCM</span>
                </>
              )}
            </div>
          </Link>

          {/* El logo YA es un enlace a `/panel`, pero solo con la imagen no
              se ve como un boton -no hay ningun affordance de "esto se
              pulsa". Este de aqui es explicito, con su propio texto: solo el
              icono (como el del manual) no bastaba, se pedia que se leyera. */}
          <Link
            href="/panel"
            title="Ir al inicio"
            aria-label="Ir al inicio"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Home className="size-4 opacity-70" aria-hidden="true" />
            <span className="hidden sm:inline">Inicio</span>
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
            avisos={{ href: "/avisos", sinLeer: avisosSinLeer }}
            usuario={{
              nombre: `${sesion.nombres} ${sesion.apellidos}`,
              // La etiqueta, no el enum crudo: esto pintaba literalmente
              // "ADMIN" en vez de "Administrador" hasta que se toco esta
              // linea para cablear la vista previa.
              rol: ETIQUETA_ROL[sesion.role],
              foto,
            }}
            vistaRol={
              sesion.rolReal === "ADMIN" && sesion.previsualizacionHabilitada
                ? {
                    opciones: ROLES.filter((r) => r !== sesion.rolReal).map(
                      (r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }),
                    ),
                    activa: sesion.role !== sesion.rolReal,
                  }
                : null
            }
          />
        </div>
      </header>

      {/* La franja de vista previa: fija, visible en cualquier pantalla del
          area privada mientras dure. Un modo que cambia lo que se puede
          hacer y no se anuncia es el tipo de sorpresa que hace perder
          confianza en la herramienta entera. */}
      {sesion.role !== sesion.rolReal && (
        <div
          className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 text-center text-sm"
          style={{
            backgroundColor: "color-mix(in oklab, var(--color-alerta) 15%, transparent)",
            color: "var(--color-alerta)",
          }}
        >
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Vista previa: estás viendo GCM como lo vería un(a){" "}
            <strong>{ETIQUETA_ROL[sesion.role]}</strong>. Las obras que ves
            siguen siendo las que tu cuenta ya tiene asignadas.
          </span>
          <form action={accionVerComo.bind(null, null)}>
            <button type="submit" className="font-medium underline">
              Volver a tu vista
            </button>
          </form>
        </div>
      )}

      <Migas />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 print:max-w-none print:p-0">
        {children}
      </main>

        <PieDePagina />
      </div>
    </ProveedorEtiquetas>
  );
}
