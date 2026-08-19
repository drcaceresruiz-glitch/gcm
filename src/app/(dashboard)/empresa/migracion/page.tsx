import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import { puede } from "@/lib/rbac";
import { leerEstadoMigracion } from "@/services/empresa-migracion.service";
import { puedeRecibirMigracion } from "@/services/importacion-empresa.service";
import { Volver } from "@/components/ui/Volver";
import { PanelAyuda } from "@/components/ui/PanelAyuda";
import { IlustracionDocumento } from "@/components/ui/IlustracionDocumento";
import { Migracion } from "@/components/empresa/Migracion";

export const metadata: Metadata = { title: "Llevarse la empresa" };

/**
 * Sacar la constructora entera para llevarla a otra instalacion de GCM.
 *
 * Vive fuera de «Configuracion» a proposito: aquello son ajustes que se
 * cambian y se dejan puestos, y esto es una OPERACION con un principio y un
 * final, mas cerca del respaldo de una obra. Ademas las gobiernan permisos
 * distintos: configuracion es `configuracion:editar` y esto es
 * `empresa:migrar`, que ni siquiera se puede delegar.
 */
export default async function MigracionPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (!puede(sesion, "empresa:migrar")) redirect("/panel");

  const [estado, destino] = await Promise.all([
    leerEstadoMigracion(sesion),
    puedeRecibirMigracion(sesion),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Llevarse la empresa
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-pretty opacity-70">
          Saca tu constructora entera en un archivo, para abrirla en otra
          instalación de GCM. Son dos pasos y el orden importa.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <Migracion
          enMigracion={estado.enMigracion}
          desde={estado.desde}
          destino={destino}
        />

        <PanelAyuda
          ilustracion={<IlustracionDocumento />}
          puntos={[
            {
              titulo: "No es el respaldo de una obra",
              texto:
                "Aquel solo se puede volver a cargar en esta misma empresa. Este está hecho para cruzar a otra instalación, y por eso se firma con una frase en vez de con el secreto del servidor.",
            },
            {
              titulo: "Congela cuando nadie trabaje",
              texto:
                "Mientras está congelada, tu equipo entra y mira pero no puede registrar nada. Al final de la jornada o un domingo; a media mañana paras la obra.",
            },
            {
              titulo: "La frase no se puede recuperar",
              texto:
                "GCM no la guarda en ningún sitio. Si se pierde, el archivo deja de servir y hay que volver a exportar. Anótala donde anotarías la llave de la caja fuerte.",
            },
            {
              titulo: "Lo que no viaja",
              texto:
                "El buzón de correo y el teléfono de los SMS se vuelven a configurar en destino: sus credenciales están atadas a esta instalación y allí no funcionarían.",
            },
            {
              titulo: "Descongela en cuanto termines",
              texto:
                "Descargar el archivo no descongela nada. Mientras no lo hagas tú, tu constructora sigue parada.",
            },
          ]}
        />
      </div>
    </div>
  );
}
