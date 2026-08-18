import Link from "next/link";

import { Mascota } from "@/components/ui/Mascota";

/**
 * Lo que se ve cuando algo no existe.
 *
 * Cubre las dos formas de llegar aqui: una direccion tecleada a mano y las
 * llamadas a `notFound()` de las pantallas —que hoy son dos, y devuelven eso
 * tanto si el registro no existe como si es de OTRA empresa—.
 *
 * Y de ahi el texto: **no distingue «no existe» de «no es tuyo», a
 * proposito**. Decir «esa obra existe pero no es de tu constructora»
 * confirmaria a quien prueba identificadores que acerto. Es la misma regla
 * que ya sigue el resto de la aplicacion.
 *
 * No lleva `reset` porque no hay nada que reintentar: la direccion seguira
 * sin existir.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Mascota pose="pensando" alto={170} />

        <h1 className="text-lg font-semibold">Aquí no hay nada</h1>

        <p className="text-sm opacity-70">
          La dirección no existe, o lo que buscas ya no está. Si llegaste desde
          un enlace de dentro de GCM, puede que se haya eliminado.
        </p>

        <Link
          href="/panel"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          Volver al panel
        </Link>
      </div>
    </div>
  );
}
