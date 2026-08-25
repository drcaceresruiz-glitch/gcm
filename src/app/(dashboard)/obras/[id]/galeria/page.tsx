import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { listarGaleria } from "@/services/galeria.service";
import { puede } from "@/lib/rbac";
import { Mascota } from "@/components/ui/Mascota";
import { AcentoTitulo } from "@/components/ui/Regla";
import { SubirFotosGaleria } from "@/components/galeria/SubirFotosGaleria";
import { RejillaGaleria } from "@/components/galeria/RejillaGaleria";
import { PanelEnlaceCliente } from "@/components/galeria/PanelEnlaceCliente";
import {
  accionEditarFotoGaleria,
  accionEliminarFotoGaleria,
  accionEnlaceGaleria,
  accionMarcarVisible,
  accionSubirFotoGaleria,
} from "./acciones";
import {
  AvisoSinEscritura,
  SiSePuedeEscribir,
} from "@/components/obras/EscrituraDeLaObra";

export const metadata: Metadata = { title: "Galería" };

/**
 * La galeria de la obra: el escaparate, curado, con enlace de cliente.
 *
 * El marco (nombre de la obra, riel, migas) lo pone el layout de la obra;
 * aqui solo vive la galeria. Que se ensena a quien:
 * - `galeria:leer` ve todo (esta pantalla no existe sin el permiso).
 * - `galeria:gestionar` ademas sube, describe y quita fotos.
 * - `galeria:publicar` ademas decide que ve el cliente y maneja su enlace.
 */
export default async function GaleriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const galeria = await listarGaleria(sesion, id);
  if (!galeria) notFound();

  const puedeGestionar = puede(sesion, "galeria:gestionar");
  const puedePublicar = puede(sesion, "galeria:publicar");
  const visibles = galeria.fotos.filter((f) => f.visibleCliente).length;

  return (
    <div className="space-y-5">
      <AcentoTitulo>
        <h2 className="text-xl font-semibold tracking-tight">Galería</h2>
        <p className="mt-1 text-sm opacity-70">
          {galeria.fotos.length === 0
            ? "El avance de la obra, en fotos."
            : `${galeria.fotos.length} foto${galeria.fotos.length === 1 ? "" : "s"}, agrupadas por ${galeria.agrupacion === "SEMANA" ? "semana" : "mes"}.`}
          {puedePublicar &&
            ` ${visibles} visible${visibles === 1 ? "" : "s"} para el cliente.`}
        </p>
      </AcentoTitulo>

      <AvisoSinEscritura />

      {/* SUBIR es lo unico que el servidor rechaza en una obra cerrada
          -`subirFotoGaleria` es la unica de las nueve funciones de galeria con
          guarda-. Editar, eliminar y marcar visible las acepta, asi que sus
          botones se quedan: esconder lo que si funciona seria quitar una
          funcion, no evitar un fallo. */}
      {puedeGestionar && (
        <SiSePuedeEscribir>
          <SubirFotosGaleria obraId={id} accion={accionSubirFotoGaleria} />
        </SiSePuedeEscribir>
      )}

      {puedePublicar && (
        <PanelEnlaceCliente
          obraId={id}
          enlace={galeria.enlace}
          cuantasVisibles={visibles}
          accion={accionEnlaceGaleria}
        />
      )}

      {galeria.fotos.length === 0 ? (
        <div
          className="rounded-xl border border-dashed p-10 text-center"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="flex justify-center">
            <Mascota pose="trabajando" alto={150} />
          </div>
          <p className="mt-3 text-sm opacity-70">
            Todavía no hay fotos.{" "}
            {/* La invitacion solo si de verdad se puede subir: decirle «sube
                la de hoy» a quien no puede es peor que no decir nada. */}
            <SiSePuedeEscribir>
              La primera cuenta más que un informe: sube la de hoy.
            </SiSePuedeEscribir>
          </p>
        </div>
      ) : (
        <RejillaGaleria
          fotos={galeria.fotos}
          agrupacion={galeria.agrupacion}
          acciones={
            puedeGestionar
              ? {
                  editar: accionEditarFotoGaleria,
                  eliminar: accionEliminarFotoGaleria,
                  marcarVisible: puedePublicar ? accionMarcarVisible : undefined,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
