"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  Building2,
  ClipboardCheck,
  Landmark,
  KeyRound,
  LogOut,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  UserCircle,
  UsersRound,
  Users,
  X,
} from "lucide-react";
import { MenuDesplegable } from "@/components/ui/MenuDesplegable";
import { SelectorApariencia } from "@/components/ui/SelectorApariencia";
import { Avatar } from "@/components/ui/Avatar";
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
 * El desplegable de empresa llego a tener SIETE entradas seguidas, sin
 * relacion entre si: proveedores, formas de pago, datos, usuarios, permisos,
 * solicitudes y constructoras. Una lista plana de siete hay que leerla entera
 * cada vez, porque nada dice donde mirar. Ahora van en grupos con su
 * titulillo y el ojo salta al grupo.
 *
 * Y «Constructoras» sale del menu de empresa: da de alta OTRAS empresas, esta
 * por encima de esta y no dentro. Estaba ahi por ser el ultimo en llegar, que
 * es como se forman los cajones de sastre.
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
  configuracion: Settings,
  usuarios: UsersRound,
  permisos: ShieldCheck,
  solicitudes: ClipboardCheck,
} as const;

/**
 * Los grupos del menu de empresa, en el orden en que se pintan.
 *
 * De lo que se usa a diario a lo que se toca una vez al ano: primero la
 * compra, luego las personas, y al final los datos de la empresa.
 */
export const GRUPOS_EMPRESA = [
  { clave: "compras", titulo: "Compras" },
  { clave: "personas", titulo: "Personas" },
  { clave: "empresa", titulo: "Empresa" },
] as const;

export type GrupoEmpresa = (typeof GRUPOS_EMPRESA)[number]["clave"];

export interface EnlaceEmpresa {
  href: string;
  etiqueta: string;
  clave: keyof typeof ICONOS;
  grupo: GrupoEmpresa;
  /// Numerito a la derecha del enlace, para pendientes que reclaman atencion.
  /// Se omite cuando es cero: un badge en cero solo distrae.
  badge?: number;
}

interface Props {
  empresa: EnlaceEmpresa[];
  /// Alta de constructoras. Null salvo para quien opera GCM.
  operador: { href: string; etiqueta: string } | null;
  /// La campanita. Con `sinLeer` en cero no se pinta numerito, por lo mismo
  /// que en `EnlaceMenu`: un badge en cero solo distrae.
  avisos: { href: string; sinLeer: number };
  usuario: { nombre: string; rol: string; foto: string | null };
}

/**
 * Las opciones agrupadas, saltando los grupos que se quedaron sin ninguna.
 *
 * Un titulillo sobre una seccion vacia es peor que no agrupar: promete algo
 * que no esta. Y con un solo grupo no se pinta cabecera ninguna, porque
 * separar de nada no separa.
 */
function OpcionesAgrupadas({ empresa }: { empresa: EnlaceEmpresa[] }) {
  const conContenido = GRUPOS_EMPRESA.map((g) => ({
    ...g,
    enlaces: empresa.filter((e) => e.grupo === g.clave),
  })).filter((g) => g.enlaces.length > 0);

  const agrupar = conContenido.length > 1;

  return (
    <>
      {conContenido.map((g, i) => (
        <div key={g.clave}>
          {agrupar && (
            <>
              {i > 0 && (
                <div
                  className="my-1 border-t"
                  style={{ borderColor: "var(--borde)" }}
                />
              )}
              <p className="px-3 pt-1.5 pb-1 text-xs font-medium tracking-wide uppercase opacity-50">
                {g.titulo}
              </p>
            </>
          )}
          {g.enlaces.map((e) => (
            <Opcion key={e.href} enlace={e} />
          ))}
        </div>
      ))}
    </>
  );
}

export function Navegacion({ empresa, operador, avisos, usuario }: Props) {
  const [cajonAbierto, setCajonAbierto] = useState(false);

  return (
    <>
      <div className="hidden items-center gap-3 sm:flex">
        <Campana href={avisos.href} sinLeer={avisos.sinLeer} />
        {/* El manual, SIEMPRE a la vista.

            Estaba solo dentro del menu de empresa, que es justo donde no se
            busca ayuda: quien se atasca en una pantalla de obra no piensa en
            entrar a la configuracion de su constructora. Es un icono, sin
            texto, porque no compite con el trabajo: espera. */}
        <Link
          href="/manual"
          title="Manual de GCM"
          aria-label="Abrir el manual"
          className="inline-flex size-9 items-center justify-center rounded-lg border"
          style={{ borderColor: "var(--borde)" }}
        >
          <BookOpen className="size-4 opacity-70" aria-hidden="true" />
        </Link>
        {/* Fuera del menu de empresa y a su izquierda: se opera GCM o se
            trabaja en una obra, y quien hace lo primero no deberia tener que
            entrar en «Empresa» —la suya— para dar de alta otra distinta. */}
        {operador && (
          <Link
            href={operador.href}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Landmark className="size-4 opacity-70" aria-hidden="true" />
            {operador.etiqueta}
          </Link>
        )}

        {empresa.length > 0 && (
          <MenuDesplegable
            etiqueta="Empresa"
            icono={<Building2 className="size-4" aria-hidden="true" />}
          >
            <OpcionesAgrupadas empresa={empresa} />
          </MenuDesplegable>
        )}

        <MenuDesplegable
          etiqueta={usuario.nombre}
          icono={
            <Avatar
              nombre={usuario.nombre}
              foto={usuario.foto}
              className="size-7"
              textoClase="text-xs"
            />
          }
        >
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
        aria-label={cajonAbierto ? "Cerrar el menú" : "Abrir el menú"}
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
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Avatar
                nombre={usuario.nombre}
                foto={usuario.foto}
                className="size-8"
                textoClase="text-xs"
              />
              <p className="text-sm font-medium">
                {usuario.nombre}
                <span className="ml-2 text-xs font-normal opacity-60">
                  {usuario.rol}
                </span>
              </p>
            </div>

            <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />

            {/* Arriba del todo: en el movil es donde se mira primero, y es lo
                unico de este menu que puede haber cambiado desde ayer. */}
            <EnlaceMenu href={avisos.href} icono={Bell} badge={avisos.sinLeer}>
              Avisos
            </EnlaceMenu>

            <div className="my-1 border-t" style={{ borderColor: "var(--borde)" }} />

            {operador && (
              <>
                <EnlaceMenu href={operador.href} icono={Landmark}>
                  {operador.etiqueta}
                </EnlaceMenu>
                <div
                  className="my-1 border-t"
                  style={{ borderColor: "var(--borde)" }}
                />
              </>
            )}

            <OpcionesAgrupadas empresa={empresa} />

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

/**
 * La campanita, a la izquierda de todo.
 *
 * Con cero sin leer sigue estando: no parpadea ni se esconde. Un icono que
 * aparece y desaparece obliga a buscarlo, y GCM ya decidio que la urgencia se
 * transmite con el numero y con el orden, nunca con movimiento.
 */
function Campana({ href, sinLeer }: { href: string; sinLeer: number }) {
  return (
    <Link
      href={href}
      aria-label={
        sinLeer === 0
          ? "Avisos"
          : `Avisos: ${sinLeer} sin leer`
      }
      className="relative rounded-lg border p-2"
      style={{ borderColor: "var(--borde)" }}
    >
      <Bell className="size-4 opacity-70" aria-hidden="true" />
      {sinLeer > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full px-1 text-center text-xs font-semibold text-white tabular-nums"
          style={{ backgroundColor: "var(--color-peligro)" }}
        >
          {sinLeer > 99 ? "99+" : sinLeer}
        </span>
      )}
    </Link>
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
    // `stopPropagation`: sin esto, el clic burbujea al contenedor del menu,
    // que se cierra —y desmonta este formulario— ANTES de que su envio llegue
    // a ejecutarse, y cerrar sesion no hacia nada. Los enlaces de arriba no
    // sufren esto porque navegan; un `form` con server action, si. El menu no
    // se cierra, pero da igual: cerrar sesion lleva a /login de inmediato.
    <form action={accionCerrarSesion} onClick={(e) => e.stopPropagation()}>
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
