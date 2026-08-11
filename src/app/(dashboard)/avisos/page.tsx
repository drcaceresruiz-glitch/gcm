import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { misAvisos } from "@/services/avisos-bandeja";
import { BandejaAvisos } from "@/components/avisos/BandejaAvisos";

export const metadata: Metadata = { title: "Avisos" };

/**
 * La bandeja de avisos: lo que GCM tiene que decirte.
 *
 * Pagina propia y no un globo desplegable. Un globo obliga a leerlo de pie,
 * con la lista tapando lo que hay debajo, y en un movil de obra no cabe; una
 * pagina se puede recorrer, enlazar y dejar abierta mientras se resuelve lo
 * que dice.
 *
 * Sin permiso que comprobar: cada quien ve LO SUYO, y el filtro es su propio
 * usuario.
 */
export default async function AvisosPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const avisos = await misAvisos(sesion);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Avisos</h2>
        <p className="mt-0.5 max-w-2xl text-sm opacity-70">
          Lo que hay que mirar en tus obras: restricciones que dependen de ti y
          tareas que ya quedaron listas. Aquí no se avisa de todo, solo de
          aquello a lo que alguien te asignó.
        </p>
      </div>

      <BandejaAvisos avisos={avisos} />
    </div>
  );
}
