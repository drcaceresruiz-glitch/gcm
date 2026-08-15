"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, LoaderCircle } from "lucide-react";
import type { ResultadoGaleria } from "@/services/galeria.service";

/**
 * Subir fotos a la galeria: varias de una vez, comprimidas en el navegador.
 *
 * La compresion es DEL NAVEGADOR por lo mismo que en la evidencia: LiteSpeed
 * mata los procesos lentos del servidor y `sharp` no es fiable en CloudLinux.
 * La funcion `comprimir` se DUPLICA aqui a proposito en vez de importarse de
 * `PanelEvidencia`: galeria y evidencia son mundos separados por decision, y
 * un ajuste de calidad en el escaparate no debe arrastrar al archivo
 * probatorio (ni al reves).
 *
 * Las fotos suben EN SERIE, no en paralelo: el hosting compartido atiende
 * una peticion grande a la vez de buena gana y cuatro de mala, y el contador
 * «3 de 7» le dice a quien espera que la cola avanza.
 */

const LADO_MAXIMO = 1600;
const CALIDAD = 0.8;

export type AccionSubirFoto = (
  obraId: string,
  datos: FormData,
) => Promise<ResultadoGaleria>;

export function SubirFotosGaleria({
  obraId,
  accion,
}: {
  obraId: string;
  accion: AccionSubirFoto;
}) {
  const [progreso, setProgreso] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function subirTodas(archivos: File[]) {
    if (archivos.length === 0 || progreso !== null) return;
    setErrores([]);

    const fallos: string[] = [];
    for (const [i, original] of archivos.entries()) {
      setProgreso(
        archivos.length === 1 ? "Subiendo…" : `Subiendo ${i + 1} de ${archivos.length}…`,
      );
      try {
        const archivo = await comprimir(original);
        const datos = new FormData();
        datos.set("archivo", archivo);
        const r = await accion(obraId, datos);
        if (!r.ok) fallos.push(`${original.name}: ${r.error}`);
      } catch {
        fallos.push(`${original.name}: no se pudo leer (prueba JPG, PNG o WebP).`);
      }
    }

    setProgreso(null);
    setErrores(fallos);
    // Un solo repintado al final, no uno por foto: la accion no revalida a
    // proposito, para que subir siete fotos no recargue la pagina siete veces.
    router.refresh();
  }

  return (
    <div>
      {/* Zona de arrastre Y boton: el arrastre es comodo en escritorio, pero
          en el movil de obra no existe; el boton abre camara o carrete. */}
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={progreso !== null}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          subirTodas([...e.dataTransfer.files]);
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-sm disabled:opacity-60"
        style={{
          borderColor: arrastrando ? "var(--color-marca-600)" : "var(--borde)",
          backgroundColor: arrastrando
            ? "color-mix(in oklab, var(--color-marca-500) 8%, transparent)"
            : "var(--superficie)",
        }}
      >
        {progreso !== null ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <ImagePlus
            className="size-5"
            style={{ color: "var(--color-marca-600)" }}
            aria-hidden="true"
          />
        )}
        <span className="font-medium">
          {progreso ?? "Añadir fotos: toca aquí o arrástralas"}
        </span>
        <span className="text-xs opacity-60">
          Se reducen en tu equipo antes de subir; puedes elegir varias.
        </span>
      </button>

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          subirTodas([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {errores.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-xs" style={{ color: "var(--color-peligro)" }}>
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Reduce la foto a `LADO_MAXIMO` por su lado mayor y la devuelve como JPEG.
 * Nunca amplia. Copia deliberada de la de PanelEvidencia (ver cabecera).
 */
function comprimir(archivo: File): Promise<File> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("lectura"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error("imagen"));
      img.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
        const ancho = Math.max(1, Math.round(img.width * escala));
        const alto = Math.max(1, Math.round(img.height * escala));

        const lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx = lienzo.getContext("2d");
        if (!ctx) return rechazar(new Error("canvas"));
        ctx.drawImage(img, 0, 0, ancho, alto);

        lienzo.toBlob(
          (blob) => {
            if (!blob) return rechazar(new Error("blob"));
            const nombre = archivo.name.replace(/\.[^.]+$/, "") || "foto";
            resolver(new File([blob], `${nombre}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          CALIDAD,
        );
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}
