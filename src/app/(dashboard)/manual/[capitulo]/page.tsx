import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { Volver } from "@/components/ui/Volver";
import { CAPITULOS, capituloPorSlug } from "@/components/manual/capitulos";

/**
 * Un capitulo del manual.
 *
 * Un slug desconocido o un capitulo aun sin escribir dan 404: enlazar a un
 * capitulo vacio seria prometer texto que no hay, y el indice ya dice
 * cuales faltan y con que palabras.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ capitulo: string }>;
}): Promise<Metadata> {
  const { capitulo } = await params;
  const datos = capituloPorSlug(capitulo);
  // Un capitulo sin escribir titula «Manual» a secas: la pagina va a dar
  // 404 y una pestana con el titulo del capitulo prometeria texto que no hay.
  return {
    title: datos?.contenido ? `${datos.titulo} · Manual` : "Manual",
  };
}

export default async function CapituloManualPage({
  params,
}: {
  params: Promise<{ capitulo: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { capitulo } = await params;
  const datos = capituloPorSlug(capitulo);
  if (!datos || !datos.contenido) notFound();

  const indice = CAPITULOS.findIndex((c) => c.slug === datos.slug);
  const siguiente = CAPITULOS.slice(indice + 1).find(
    (c) => c.contenido !== null,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Volver href="/manual">Volver al índice del manual</Volver>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {datos.titulo}
        </h1>
        <p className="mt-1 text-sm opacity-60">
          Contesta: {datos.pregunta} · Para: {datos.paraQuien}
        </p>
      </div>

      <div className="space-y-7">{datos.contenido}</div>

      {siguiente && (
        <p
          className="border-t pt-4 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          Siguiente capítulo:{" "}
          <Link
            href={`/manual/${siguiente.slug}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {siguiente.titulo}
          </Link>
        </p>
      )}
    </div>
  );
}
