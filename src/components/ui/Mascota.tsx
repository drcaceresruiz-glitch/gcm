import Image from "next/image";

/**
 * Mascota de GCM: el maestro de obra que acompana algunas pantallas.
 *
 * Las cuatro poses viven en `public/mascota` como WebP con transparencia. Se
 * declaran aqui —y no en cada pantalla— para que anadir o renombrar una pose
 * sea un solo cambio, y para que el texto alternativo describa lo que hace en
 * cada una en lugar de repetir "mascota" cuatro veces.
 *
 * Las medidas de la tabla son las REALES del archivo, no las de pantalla. De
 * ellas deduce el navegador la proporcion y reserva el hueco antes de que la
 * imagen llegue; el tamano visible lo fija `alto` con el ancho en automatico.
 * Poner `w-auto h-auto` en su lugar deja la imagen en 0x0 mientras no ha
 * cargado, y como la carga es diferida, un elemento sin area nunca entra en
 * el viewport y por tanto no carga nunca.
 */

const POSES = {
  saludando: { alt: "Maestro de obra saludando", ancho: 295, alto: 480 },
  sonriendo: { alt: "Maestro de obra sonriendo", ancho: 273, alto: 480 },
  pensando: { alt: "Maestro de obra pensando", ancho: 361, alto: 480 },
  trabajando: { alt: "Maestro de obra trabajando", ancho: 448, alto: 480 },
} as const;

export type PoseMascota = keyof typeof POSES;

export function Mascota({
  pose = "saludando",
  alto = 200,
  flotar = false,
  prioritaria = false,
  className = "",
}: {
  pose?: PoseMascota;
  /** Alto en pantalla, en pixeles. El ancho sale de la proporcion. */
  alto?: number;
  /** Balanceo lento; se apaga solo si el sistema pide menos animacion. */
  flotar?: boolean;
  /** Para la que encabeza una pantalla: la carga sin esperar al viewport. */
  prioritaria?: boolean;
  className?: string;
}) {
  const pieza = POSES[pose];

  return (
    <Image
      src={`/mascota/${pose}.webp`}
      alt={pieza.alt}
      width={pieza.ancho}
      height={pieza.alto}
      priority={prioritaria}
      className={`${flotar ? "flotar " : ""}select-none${className ? ` ${className}` : ""}`}
      style={{ height: alto, width: "auto" }}
    />
  );
}
