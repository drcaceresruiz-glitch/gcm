import type { Metadata } from "next";

/**
 * El marco del PASE DE OBRA: quien documenta en campo sin ser usuario de GCM.
 *
 * Es deliberadamente pobre. El layout de `(dashboard)` arrastra cabecera con
 * reloj y avatar, riel de ubicacion de la obra y dos niveles de pestanas:
 * todo eso existe para quien NAVEGA el sistema. Aqui la persona viene a hacer
 * una sola cosa —adjuntar una foto de lo que tiene delante—, muchas veces con
 * una mano, con guantes, con sol en la pantalla y con el dato movil de la
 * obra. Cada elemento de mas es un estorbo y unos kilobytes que tardan.
 *
 * Tampoco hereda el de `(auth)`, que en pantalla ancha pinta el carrusel de la
 * portada: esto no es la cara publica de GCM, es una herramienta de trabajo.
 */

export const metadata: Metadata = {
  title: "Evidencia de obra | GCM",
  // Que no acabe indexado: la URL lleva el id de una obra real.
  robots: { index: false, follow: false },
};

export default function PaseLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6">
      {children}
    </div>
  );
}
