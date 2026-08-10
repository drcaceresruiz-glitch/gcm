import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { tokenRecuperacionValido } from "@/services/recuperacion.service";
import { FormularioNuevaClave } from "@/components/auth/FormularioNuevaClave";

export const metadata: Metadata = { title: "Elegir clave nueva" };

/**
 * El enlace del correo. Se comprueba el token ANTES de pintar el formulario:
 * pedirle a alguien que escriba dos veces una clave para luego decirle que el
 * enlace caduco es tratarlo mal.
 *
 * Comprobar aqui no consume el token —solo mira—; quien lo gasta es la accion
 * al guardar, y lo hace dentro de una transaccion.
 */
export default async function NuevaClavePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!(await tokenRecuperacionValido(token))) {
    return (
      <div className="space-y-4 text-center">
        <LinkIcon
          className="mx-auto size-9"
          style={{ color: "var(--color-peligro)" }}
          aria-hidden="true"
        />
        <p className="text-sm">
          Este enlace ya no sirve: caducó o ya se usó.
        </p>
        <p className="text-xs opacity-60">
          Los enlaces duran una hora y valen una sola vez. Pide uno nuevo.
        </p>
        <Link
          href="/recuperar-clave"
          className="inline-block text-sm font-medium underline"
        >
          Pedir otro enlace
        </Link>
      </div>
    );
  }

  return <FormularioNuevaClave token={token} />;
}
