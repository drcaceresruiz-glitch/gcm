import { ImageOff } from "lucide-react";
import { fechaHora } from "@/utils/fechas";
import type { FotoResumen } from "@/services/evidencia.service";

/**
 * Las fotos de un dato, en miniaturas.
 *
 * Presentacion pura y sin estado, para que sirva igual en el servidor (la
 * semana ya cerrada, que solo se mira) que dentro del panel de subida, que es
 * cliente. Sin `"use client"`: quien la importe decide de que lado vive.
 *
 * La imagen se pide a `/api/evidencia/<id>`, que valida sesion, permiso y
 * empresa; no hay URL publica que adivinar. Por eso es un `<img>` normal y no
 * `next/image`: el optimizador no puede con una ruta que exige sesion.
 */
export function GaleriaEvidencia({
  fotos,
  tamano = "size-20",
}: {
  fotos: FotoResumen[];
  /// Clase de Tailwind con el lado de la miniatura.
  tamano?: string;
}) {
  if (fotos.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {fotos.map((f) => (
        <li key={f.id}>
          <Miniatura foto={f} tamano={tamano} />
        </li>
      ))}
    </ul>
  );
}

function Miniatura({ foto, tamano }: { foto: FotoResumen; tamano: string }) {
  // Quien subio la foto y cuando es parte de la evidencia, no un adorno: sin
  // eso, una foto no prueba nada.
  const pie = `${foto.subidaPor} · ${fechaHora(foto.createdAt)}${
    foto.nota ? ` · ${foto.nota}` : ""
  }`;

  // Purgada: el archivo ya no esta en el disco, pero el registro sobrevive. Se
  // dice, en vez de dejar una imagen rota o de esconderla como si nunca
  // hubiera existido.
  if (foto.purgada) {
    return (
      <div
        className={`flex ${tamano} flex-col items-center justify-center gap-1 rounded-lg border text-center text-[10px] opacity-60`}
        style={{ borderColor: "var(--borde)" }}
        title={`Purgada del disco · ${pie}`}
      >
        <ImageOff className="size-5" aria-hidden="true" />
        <span>Purgada</span>
      </div>
    );
  }

  return (
    <a
      href={`/api/evidencia/${foto.id}`}
      target="_blank"
      rel="noopener noreferrer"
      title={pie}
      className={`block ${tamano} overflow-hidden rounded-lg border`}
      style={{ borderColor: "var(--borde)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/evidencia/${foto.id}`}
        alt={foto.nota ?? foto.nombreOriginal}
        loading="lazy"
        className="size-full object-cover"
      />
    </a>
  );
}
