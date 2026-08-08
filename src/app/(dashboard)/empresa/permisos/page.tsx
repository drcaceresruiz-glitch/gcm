import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldAlert } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerMatriz } from "@/services/permisos.service";
import { puede } from "@/lib/rbac";
import { MatrizPermisos } from "@/components/permisos/MatrizPermisos";

export const metadata: Metadata = { title: "Permisos por perfil" };

/**
 * Quien puede hacer que, en esta empresa.
 *
 * Los cinco roles son PLANTILLAS: traen unos permisos de serie y encima se
 * conceden o revocan los que hagan falta. Lo que se guarda son solo las
 * desviaciones, asi que una empresa que no toque nada se comporta como
 * siempre.
 */
export default async function PermisosPage({
  searchParams,
}: {
  searchParams: Promise<{ guardados?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "permiso:leer")) redirect("/panel");

  const matriz = await obtenerMatriz(sesion);
  const { guardados } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/panel"
          className="inline-flex items-center gap-1.5 text-sm opacity-70 hover:opacity-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver al panel
        </Link>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Permisos por perfil
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
          Cada rol trae unos permisos de serie. Aqui se conceden o se quitan
          los que hagan falta, solo para esta empresa. Lo que se guarda son
          las diferencias: una casilla devuelta a su valor por defecto deja de
          ocupar sitio.
        </p>
      </div>

      {guardados && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {guardados === "1"
            ? "1 permiso actualizado."
            : `${guardados} permisos actualizados.`}{" "}
          Surte efecto en la siguiente peticion de cada usuario, sin cerrar
          sesiones.
        </p>
      )}

      <div
        className="flex items-start gap-3 rounded-xl border p-4"
        style={{ borderColor: "var(--borde)" }}
      >
        <ShieldAlert className="mt-0.5 size-5 shrink-0 opacity-70" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-semibold">Cuatro permisos no se tocan</h2>
          <p className="mt-1 max-w-3xl text-sm text-pretty opacity-70">
            Aprobar una linea base y aprobar un movimiento son actos
            contractuales irreversibles: mueven la cifra contra la que se mide
            la obra. Y quien reparte permisos podria repartirselos a si mismo.
            Los cuatro quedan reservados al administrador y salen bloqueados
            en la rejilla.
          </p>
        </div>
      </div>

      <MatrizPermisos
        matriz={matriz}
        editable={puede(sesion, "permiso:editar")}
      />
    </div>
  );
}
