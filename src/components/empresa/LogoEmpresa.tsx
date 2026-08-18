"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";

import { Nota } from "@/components/ui/Nota";
import { encajar, LADO_MAXIMO_LOGO } from "@/lib/imagen";
import {
  accionQuitarLogo,
  accionSubirLogo,
} from "@/app/(dashboard)/empresa/datos/acciones";

/**
 * Subir el logo de la empresa.
 *
 * **EL AJUSTE SE HACE AQUI, EN EL NAVEGADOR.** En este hosting no hay `sharp`
 * —los binarios compilados no van—, asi que redimensionar en el servidor no
 * es una opcion. Es el mismo camino que ya siguen la galeria y la evidencia:
 * el navegador dibuja la imagen en un `canvas` del tamano bueno y sube el
 * resultado, y quien lo usa no tiene que preparar nada.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN:
 *
 * 1. **La proporcion se respeta siempre** (`encajar`). Un logo estirado se lee
 *    como descuido de la empresa que lo manda, y este sale en el papel que
 *    recibe el cliente.
 * 2. **No se agranda.** Un logo de 90 px llevado a 512 solo se emborrona; se
 *    sube tal cual y ya se vera pequeno donde toque.
 *
 * El PNG se mantiene PNG: pasarlo a JPEG rellenaria de negro la transparencia
 * y el logo saldria con un recuadro sobre la cabecera de color.
 */
export function LogoEmpresa({
  logo,
  soloLectura,
}: {
  logo: { src: string; alt: string; ancho: number; alto: number } | null;
  soloLectura: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enCurso, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  async function ajustar(archivo: File): Promise<{ datos: Blob; nota: string | null }> {
    const mapa = await createImageBitmap(archivo);

    // Se copian ANTES de cerrarlo: `close()` libera el mapa de bits y a
    // partir de ahi `width` y `height` valen 0. Leerlos despues hacia que el
    // aviso dijera «se ajustó de 0×0», que es peor que no decir nada.
    const origen = { ancho: mapa.width, alto: mapa.height };
    const destino = encajar(origen.ancho, origen.alto, LADO_MAXIMO_LOGO);

    if (destino.ancho === origen.ancho && destino.alto === origen.alto) {
      mapa.close();
      return { datos: archivo, nota: null };
    }

    const lienzo = document.createElement("canvas");
    lienzo.width = destino.ancho;
    lienzo.height = destino.alto;

    const pincel = lienzo.getContext("2d");
    if (!pincel) {
      mapa.close();
      throw new Error("Este navegador no puede ajustar la imagen.");
    }

    // Se dibuja ocupando EXACTAMENTE el lienzo, que ya tiene la proporcion
    // del original: por eso no deforma. El lienzo se creo a la medida que
    // devolvio `encajar`, no a una caja fija.
    pincel.drawImage(mapa, 0, 0, destino.ancho, destino.alto);
    mapa.close();

    const datos = await new Promise<Blob | null>((resolver) =>
      // El mismo tipo que entro: un PNG sigue siendo PNG y conserva su
      // transparencia. La calidad solo la mira el JPEG.
      lienzo.toBlob(resolver, archivo.type, 0.92),
    );

    if (!datos) throw new Error("No se pudo ajustar la imagen.");

    return {
      datos,
      nota: `Se ajustó de ${origen.ancho}×${origen.alto} a ${destino.ancho}×${destino.alto} px, sin deformarlo.`,
    };
  }

  function alElegir(archivo: File | undefined) {
    if (!archivo) return;

    setError(null);
    setAviso(null);

    iniciar(async () => {
      try {
        const { datos, nota } = await ajustar(archivo);

        const cuerpo = new FormData();
        // El nombre se conserva para que el servidor pueda quejarse citandolo.
        cuerpo.set("logo", new File([datos], archivo.name, { type: archivo.type }));

        const r = await accionSubirLogo(cuerpo);
        if (!r.ok) {
          setError(r.error ?? "No se pudo guardar el logo.");
          return;
        }
        setAviso(nota ?? "Logo guardado.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo leer la imagen.");
      } finally {
        if (entrada.current) entrada.current.value = "";
      }
    });
  }

  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div>
        <h2 className="text-sm font-semibold">Logo de la empresa</h2>
        <p className="mt-0.5 text-xs opacity-70">
          Sale en la cabecera del sistema, en el informe en PDF y en los correos
          que se mandan desde GCM.
        </p>
      </div>

      {/* La caja tiene medida fija y la imagen va con `object-contain`: cabe
          dentro sin salirse y sin estirarse, sea cual sea su proporcion. */}
      <div
        className="flex h-20 w-full max-w-xs items-center justify-center rounded-lg border p-2"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo.src}
            alt={logo.alt}
            width={logo.ancho}
            height={logo.alto}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs opacity-50">Todavía sin logo</span>
        )}
      </div>

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => alElegir(e.target.files?.[0])}
          />

          <button
            type="button"
            disabled={enCurso}
            onClick={() => entrada.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {enCurso ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ImageUp className="size-4" aria-hidden="true" />
            )}
            {logo ? "Cambiar logo" : "Subir logo"}
          </button>

          {logo && (
            <button
              type="button"
              disabled={enCurso}
              onClick={() =>
                iniciar(async () => {
                  const r = await accionQuitarLogo();
                  if (!r.ok) setError(r.error ?? "No se pudo quitar.");
                  else setAviso("Logo quitado.");
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--borde)" }}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Quitar
            </button>
          )}
        </div>
      )}

      <p className="text-xs opacity-60">
        PNG o JPG, hasta 1 MB. Si es más grande de {LADO_MAXIMO_LOGO} px se
        ajusta solo al subirlo, respetando la proporción. Un PNG con fondo
        transparente es lo que mejor queda sobre la cabecera de color.
      </p>

      {error && <Nota tono="peligro">{error}</Nota>}
      {aviso && !error && <Nota tono="exito">{aviso}</Nota>}
    </section>
  );
}
