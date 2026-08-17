import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { RestaurarRespaldo } from "@/components/obras/RestaurarRespaldo";

export const metadata: Metadata = { title: "Archivo de obras" };

/**
 * Recargar el respaldo de una obra borrada.
 *
 * Vive en «Empresa» y no dentro de una obra porque la obra ya no existe: es lo
 * primero que hay que entender de esta pantalla.
 */
export default async function ArchivoPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (!puede(sesion, "obra:restaurar")) redirect("/panel");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Archivo de obras</h1>
        <p className="mt-1 text-sm opacity-70">
          Vuelve a cargar el respaldo de una obra que se borró, para poder
          consultarla.
        </p>
      </header>

      <div
        className="flex items-start gap-2 rounded-lg px-3 py-3 text-sm text-pretty"
        style={{ backgroundColor: "var(--superficie)" }}
      >
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-2">
          <p>
            La obra restaurada entra como <strong>copia de solo lectura</strong>
            : se ve entera con las pantallas de siempre, pero no admite un solo
            cambio.
          </p>
          <p className="opacity-80">
            No es una vuelta atrás. Los identificadores son nuevos, y lo que
            vive fuera de la obra —usuarios y proveedores— se vuelve a enlazar
            si sigue existiendo y se pierde si no. Al terminar se dice todo lo
            que no quedó igual que en el original.
          </p>
          <p className="opacity-80">
            Solo se restaura un respaldo generado por esta misma empresa. Si el
            archivo está alterado, aunque sea un céntimo, se rechaza entero.
          </p>
        </div>
      </div>

      <RestaurarRespaldo />
    </div>
  );
}
