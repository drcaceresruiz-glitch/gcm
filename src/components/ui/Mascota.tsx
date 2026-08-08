import Image from "next/image";

/**
 * Mascota de GCM: el maestro de obra que acompana algunas pantallas.
 *
 * Las cuatro poses viven en `public/mascota` como WebP con transparencia. Se
 * declaran aqui —y no en cada pantalla— para que anadir o renombrar una pose
 * sea un solo cambio, y para que el texto alternativo describa lo que hace en
 * cada una en lugar de repetir "mascota" cuatro veces.
 */

const POSES = {
  saludando: { archivo: "saludando", alt: "Maestro de obra saludando" },
  sonriendo: { archivo: "sonriendo", alt: "Maestro de obra sonriendo" },
  pensando: { archivo: "pensando", alt: "Maestro de obra pensando" },
  trabajando: { archivo: "trabajando", alt: "Maestro de obra trabajando" },
} as const;

export type PoseMascota = keyof typeof POSES;

export function Mascota({
  pose = "saludando",
  ancho = 160,
  alto = 260,
  flotar = false,
  className = "",
}: {
  pose?: PoseMascota;
  ancho?: number;
  alto?: number;
  /** Balanceo lento; se apaga solo si el sistema pide menos animacion. */
  flotar?: boolean;
  className?: string;
}) {
  const { archivo, alt } = POSES[pose];

  return (
    <Image
      src={`/mascota/${archivo}.webp`}
      alt={alt}
      width={ancho}
      height={alto}
      className={`${flotar ? "flotar " : ""}h-auto w-auto select-none${className ? ` ${className}` : ""}`}
      style={{ maxHeight: alto }}
      priority={false}
    />
  );
}
