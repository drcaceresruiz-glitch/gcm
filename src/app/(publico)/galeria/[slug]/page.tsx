import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { galeriaPublica } from "@/services/galeria.service";
import { RejillaGaleria } from "@/components/galeria/RejillaGaleria";

/**
 * La galeria que ve EL CLIENTE con su enlace, sin cuenta.
 *
 * Vive fuera del grupo (dashboard) a proposito: nada de menus, migas ni
 * cabecera de GCM. El cliente recibe el nombre de su obra, las fotos que
 * gerencia publico y la fecha de cada una. Ni autores, ni cifras, ni un solo
 * enlace hacia dentro de la aplicacion.
 *
 * Si el slug no existe o el enlace esta apagado, 404 a secas: una pagina que
 * distinguiera "no existe" de "existe pero esta apagado" le contaria a un
 * curioso que el slug que probo es real.
 */
export const metadata: Metadata = { title: "Avance de obra" };

export default async function GaleriaClientePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const galeria = await galeriaPublica(slug);
  if (!galeria) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Avance de obra
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
          {galeria.obraNombre}
        </h1>
      </header>

      {galeria.fotos.length === 0 ? (
        <p
          className="rounded-xl border border-dashed p-10 text-center text-sm opacity-70"
          style={{ borderColor: "var(--borde)" }}
        >
          Aún no hay fotos publicadas. Vuelve a mirar en unos días.
        </p>
      ) : (
        <RejillaGaleria
          fotos={galeria.fotos}
          agrupacion={galeria.agrupacion}
          sufijoSrc={`?g=${slug}`}
        />
      )}
    </main>
  );
}
