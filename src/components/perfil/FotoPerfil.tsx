"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Camera, LoaderCircle, Trash2 } from "lucide-react";
import {
  accionGuardarFoto,
  type EstadoPerfil,
} from "@/app/(dashboard)/perfil/acciones";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Foto de perfil, opcional, recortada a un circulo.
 *
 * El recorte y la compresion se hacen AQUI, en el navegador, con un canvas:
 * se toma el cuadrado central de la imagen elegida, se reduce a 256x256 y se
 * exporta como JPEG. Asi lo que viaja al servidor son unas decenas de KB y no
 * la foto original de varios MB, y la base guarda un avatar chico embebido en
 * vez de depender de un almacen de archivos que todavia no existe.
 *
 * El circulo es de presentacion (recorte visual); la imagen guardada es el
 * cuadrado, que es lo que un `object-cover` circular necesita para verse bien
 * en cualquier tamano.
 */

const LADO = 256;

export function FotoPerfil({
  nombre,
  fotoActual,
}: {
  nombre: string;
  fotoActual: string | null;
}) {
  const [estado, accion] = useActionState<EstadoPerfil, FormData>(
    accionGuardarFoto,
    {},
  );

  // La vista previa local mientras no se ha guardado. Al montar, la foto que
  // vino del servidor.
  const [previa, setPrevia] = useState<string | null>(fotoActual);
  const [error, setError] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  // El data URL que se enviara. Vacio = sin cambio respecto a lo guardado.
  const campo = useRef<HTMLInputElement>(null);

  async function alElegir(archivo: File) {
    setError(null);

    if (!archivo.type.startsWith("image/")) {
      setError("Elige un archivo de imagen.");
      return;
    }

    try {
      const dataUrl = await recortarCuadrado(archivo, LADO);
      setPrevia(dataUrl);
      if (campo.current) campo.current.value = dataUrl;
    } catch {
      setError("No se pudo leer la imagen. Prueba con otra.");
    }
  }

  function quitar() {
    setPrevia(null);
    if (campo.current) campo.current.value = ""; // vacio = quitar al enviar
  }

  return (
    <form action={accion}>
      <input type="hidden" name="foto" ref={campo} />

      <div className="flex items-center gap-4">
        <Avatar nombre={nombre} foto={previa} className="size-20" />

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              <Camera className="size-4" aria-hidden="true" />
              {previa ? "Cambiar" : "Subir foto"}
            </button>

            {previa && (
              <button
                type="button"
                onClick={quitar}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--borde)", color: "var(--color-peligro)" }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Quitar
              </button>
            )}
          </div>

          <p className="text-xs opacity-60">
            Opcional. Se recorta a un circulo. Formatos JPG, PNG o WebP.
          </p>

          <GuardarFoto />
        </div>

        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) alElegir(f);
            // Se limpia para poder volver a elegir el MISMO archivo despues.
            e.target.value = "";
          }}
        />
      </div>

      {(error || estado.error) && (
        <p
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error ?? estado.error}</span>
        </p>
      )}
    </form>
  );
}

function GuardarFoto() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
      Guardar foto
    </button>
  );
}

/**
 * Toma el cuadrado central de una imagen y lo devuelve como data URL JPEG de
 * `lado`x`lado`. Todo en el navegador, sin subir el original.
 */
function recortarCuadrado(archivo: File, lado: number): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("lectura"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error("imagen"));
      img.onload = () => {
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;

        const lienzo = document.createElement("canvas");
        lienzo.width = lado;
        lienzo.height = lado;
        const ctx = lienzo.getContext("2d");
        if (!ctx) return rechazar(new Error("canvas"));

        ctx.drawImage(img, sx, sy, min, min, 0, 0, lado, lado);
        // JPEG con calidad 0.85: buen equilibrio para un avatar pequeno.
        resolver(lienzo.toDataURL("image/jpeg", 0.85));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(archivo);
  });
}
