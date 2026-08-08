"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Building2,
  ClipboardCheck,
  KeyRound,
  LogOut,
  Menu,
  Receipt,
  ShieldCheck,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import { MenuDesplegable } from "@/components/ui/MenuDesplegable";
import { SelectorApariencia } from "@/components/ui/SelectorApariencia";
import { accionCerrarSesion } from "@/app/(auth)/acciones";

/**
 * La navegacion de la cabecera.
 *
 * Antes eran seis botones sueltos en una fila. En un movil se quedaban en
 * seis iconos sin texto, que obligan a adivinar; y cada modulo nuevo anadia
 * otro. Ahora lo de empresa vive en un desplegable, lo de la cuenta en otro,
 * y por debajo de `sm` ambos se sustituyen por un cajon donde las etiquetas
 * SI se leen.
 *
 * Que enlaces llegan aqui lo decide el layout con `puede()`: este componente
 * no conoce los permisos, solo pinta lo que le dan.
 */

/** Un componente no cruza la frontera servidor -> cliente como prop, asi que
 *  el layout manda una clave y el icono se resuelve aqui. */
const ICONOS = {
  proveedores: Users,
  formasPago: Receipt,
  empresa: Building2,
  permisos: ShieldCheck,
  solicitudes: ClipboardCheck,
} as const;

export interface EnlaceEmpresa {
  href: string;
  etiqueta: string;
  clave: keyof typeof ICONOS;
  /// Numerito a la derecha del enlace, para pendientes que reclaman atencion.
  /// Se omite cuando es cero: un badge en cero solo distrae.
  badge?: number;
}

interface Props {
  empresa: EnlaceEmpresa[];
  usuario: { nombre: string; rol: string };
}

export function Navegacion({ empresa, usuario }: Props) {
  const [cajonAbierto, setCajonAbierto] = useState(false);

  return (
    <>
      <div className="hidden items-center gap-3 sm:flex">
        {empresa.length > 0 && (
          <MenuDesplegable
            etiqueta="Empresa"
            icono={<Building2 className="size-4" aria-hidden="true" />}
          >
            {empresa.map((e) => (
              <Opcion key={e.href} enlace={e} />
            ))}
          </MenuDesplegable>
        )}

        <MenuDesplegable etiqueta={usuario.nombre}>
          <p className="px-3 py-2 text-xs opacity-60">{usuario.rol}</p>
          <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />
          <SelectorApariencia />
          <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />
          <EnlaceMenu href="/perfil" icono={UserCircle}>
            Mi perfil
          </EnlaceMenu>
          <EnlaceMenu href="/cambiar-clave" icono={KeyRound}>
            Cambiar clave
          </EnlaceMenu>
          <BotonSalir />
        </MenuDesplegable>
      </div>

      <button
        type="button"
        onClick={() => setCajonAbierto((previo) => !previo)}
        aria-expanded={cajonAbierto}
        aria-controls="cajon-navegacion"
        aria-label={cajonAbierto ? "Cerrar el menu" : "Abrir el menu"}
        className="rounded-lg border p-2 sm:hidden"
        style={{ borderColor: "var(--borde)" }}
      >
        {cajonAbierto ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Menu className="size-5" aria-hidden="true" />
        )}
      </button>

      {cajonAbierto && (
        <div
          id="cajon-navegacion"
          // Al pulsar cualquier opcion el cajon se cierra. Va aqui y no en
          // un efecto sobre la ruta: en una navegacion del lado del cliente
          // el componente no se vuelve a montar, y el cajon se quedaria
          // abierto tapando la pantalla a la que se acaba de llegar.
          onClick={() => setCajonAbierto(false)}
          className="absolute inset-x-0 top-full border-b shadow-lg sm:hidden"
          style={{
            borderColor: "var(--borde)",
            backgroundColor: "var(--superficie)",
          }}
        >
          <div className="px-2 py-2">
            <p className="px-3 py-2 text-sm font-medium">
              {usuario.nombre}
              <span className="ml-2 text-xs font-normal opacity-60">
                {usuario.rol}
              </span>
            </p>

            <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />

            {empresa.map((e) => (
              <Opcion key={e.href} enlace={e} />
            ))}

            <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />
            <SelectorApariencia />
            <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />

            <EnlaceMenu href="/perfil" icono={UserCircle}>
              Mi perfil
            </EnlaceMenu>
            <EnlaceMenu href="/cambiar-clave" icono={KeyRound}>
              Cambiar clave
            </EnlaceMenu>
            <BotonSalir />
          </div>
        </div>
      )}
    </>
  );
}

function Opcion({ enlace }: { enlace: EnlaceEmpresa }) {
  return (
    <EnlaceMenu href={enlace.href} icono={ICONOS[enlace.clave]} badge={enlace.badge}>
      {enlace.etiqueta}
    </EnlaceMenu>
  );
}

function EnlaceMenu({
  href,
  icono: Icono,
  badge,
  children,
}: {
  href: string;
  icono: React.ComponentType<{ className?: string }>;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-[color-mix(in_oklab,var(--borde)_50%,transparent)]"
    >
      <Icono className="size-4 shrink-0 opacity-70" />
      <span className="flex-1">{children}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-xs font-semibold text-white"
          style={{ backgroundColor: "var(--color-marca-500)" }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

function BotonSalir() {
  return (
    <form action={accionCerrarSesion}>
      <button
        type="submit"
        role="menuitem"
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-[color-mix(in_oklab,var(--borde)_50%,transparent)]"
      >
        <LogOut className="size-4 shrink-0 opacity-70" aria-hidden="true" />
        Salir
      </button>
    </form>
  );
}
