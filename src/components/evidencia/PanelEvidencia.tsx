"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, LoaderCircle, Paperclip, X } from "lucide-react";
import { GaleriaEvidencia } from "@/components/evidencia/GaleriaEvidencia";
import type { FotoResumen, ResultadoSubida } from "@/services/evidencia.service";

/**
 * Evidencia fotografica adosada al dato donde se decide.
 *
 * La foto no vive en una galeria aparte: cuelga de la restriccion que se
 * libera o de la causa de no cumplimiento que se anota. Por eso este panel se
 * abre DENTRO de la matriz del Lookahead y del cierre del Plan Semanal, y no
 * en una pantalla propia.
 *
 * Tres decisiones que no se pueden cambiar a la ligera:
 *
 * 1. **La compresion es del NAVEGADOR.** Se reduce con un canvas antes de
 *    enviar. En el servidor no se puede: LiteSpeed mata los procesos lentos
 *    —es la misma razon por la que el despliegue tuvo que salir del arranque—.
 * 2. **La foto se sirve por `/api/evidencia/<id>`,** que valida quien pide
 *    —sesion o pase— y la empresa. Nunca hay una URL publica adivinable.
 * 3. **No hay boton de borrar.** El registro es evidencia de auditoria; la
 *    purga futura quitara el archivo del disco y dejara el rastro (nombre,
 *    hash, quien y cuando). Una foto purgada se muestra como tal.
 * 4. **La accion de subida llega por PROPIEDAD, no por import.** Hay dos
 *    puertas —la sesion de un usuario y el pase de obra— con modelos de
 *    autorizacion distintos, y este panel sirve a las dos. Si importara una
 *    de ellas, la pantalla del pase acabaria llamando a la puerta de sesion
 *    y fallando en silencio con una redireccion al login; peor aun, un
 *    descuido futuro podria hacer que llamara a la que NO comprueba lo que
 *    toca. Quien monta el panel dice explicitamente por donde entra.
 *
 * Se despliega en linea, sin dialogo modal, por lo mismo que `PanelComprometer`:
 * en un movil en obra un panel que empuja la pagina se maneja mejor que una
 * ventana flotante.
 */

/// Lado maximo tras comprimir. 1600 px basta para leer una etiqueta o ver un
/// frente vacio, y deja el archivo en unos cientos de KB.
const LADO_MAXIMO = 1600;
const CALIDAD = 0.8;

export type DestinoPanel =
  | { restriccionId: string }
  | { compromisoId: string };

/**
 * La puerta por la que sube la foto.
 *
 * La firma es la misma para la sesion y para el pase a proposito: el panel no
 * tiene por que saber cual le toco. Quien la implementa comprueba lo suyo
 * —permisos en un caso, obra del pase en el otro— y devuelve el mismo
 * resultado.
 */
export type AccionSubirEvidencia = (
  obraId: string,
  datos: FormData,
) => Promise<ResultadoSubida>;

/**
 * El clip que abre el panel, con el numero de fotos.
 *
 * Cuando no hay ninguna se pinta tenue: en la matriz hay siete por fila y a
 * plena opacidad competirian con las casillas, que son lo importante.
 */
export function BotonEvidencia({
  cantidad,
  abierto,
  etiqueta,
  onClick,
}: {
  cantidad: number;
  abierto: boolean;
  /// Que se esta adjuntando, para quien navega a ciegas.
  etiqueta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-label={
        cantidad > 0
          ? `Evidencia de ${etiqueta}: ${cantidad} foto(s)`
          : `Adjuntar evidencia de ${etiqueta}`
      }
      title={cantidad > 0 ? `${cantidad} foto(s)` : "Adjuntar foto"}
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs tabular-nums hover:opacity-100"
      style={{
        opacity: abierto ? 1 : cantidad > 0 ? 0.9 : 0.35,
        color: cantidad > 0 ? "var(--color-marca-600)" : undefined,
        outline: abierto ? "1px solid var(--color-marca-600)" : undefined,
      }}
    >
      <Paperclip className="size-3.5" aria-hidden="true" />
      {cantidad > 0 && cantidad}
    </button>
  );
}

export function PanelEvidencia({
  obraId,
  destino,
  titulo,
  fotos,
  puedeSubir,
  accion,
  onCerrar,
}: {
  obraId: string;
  destino: DestinoPanel;
  /// A que esta adosada la evidencia, dicho en la lengua de la obra.
  titulo: string;
  fotos: FotoResumen[];
  /// Ver la evidencia y anadirla son cosas distintas: un consultor mira.
  puedeSubir: boolean;
  /// Por donde sube la foto. Sin valor por defecto: ver la nota 4 de arriba.
  accion: AccionSubirEvidencia;
  onCerrar: () => void;
}) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const ocupado = comprimiendo || pendiente;

  async function alElegir(original: File) {
    setError(null);
    setComprimiendo(true);
    try {
      const archivo = await comprimir(original);
      setComprimiendo(false);

      const datos = new FormData();
      datos.set("archivo", archivo);
      if (nota.trim()) datos.set("nota", nota.trim());
      if ("restriccionId" in destino) {
        datos.set("restriccionId", destino.restriccionId);
      } else {
        datos.set("compromisoId", destino.compromisoId);
      }

      iniciar(async () => {
        const r = await accion(obraId, datos);
        if (r.ok) setNota("");
        else setError(r.error);
      });
    } catch {
      setComprimiendo(false);
      // Formatos que el navegador no sabe decodificar (HEIC de iPhone en
      // Android o en escritorio es el caso tipico). No se envia el original a
      // ciegas: el servicio solo acepta JPG, PNG y WebP y lo rechazaria con un
      // mensaje mas oscuro que este.
      setError(
        "No se pudo leer esa imagen. Prueba con una foto JPG, PNG o WebP.",
      );
    }
  }

  return (
    <div
      className="mt-2 space-y-3 rounded-lg border p-3 text-left"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Evidencia</p>
          <p className="truncate text-xs opacity-70" title={titulo}>
            {titulo}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar la evidencia"
          className="rounded p-1 opacity-60 hover:opacity-100"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {fotos.length === 0 ? (
        <p className="text-xs opacity-60">Todavía no hay fotos aquí.</p>
      ) : (
        <GaleriaEvidencia fotos={fotos} />
      )}

      {puedeSubir && (
        <div className="space-y-2">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={300}
            placeholder="Nota (opcional): qué se ve en la foto"
            className="w-full rounded-lg border px-2 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          />

          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {ocupado ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="size-4" aria-hidden="true" />
            )}
            {comprimiendo
              ? "Preparando la foto…"
              : pendiente
                ? "Subiendo…"
                : "Añadir foto"}
          </button>

          <p className="text-xs opacity-60">
            Se reduce en tu equipo antes de subirla, así que sirve el dato móvil
            de la obra. La foto queda como evidencia y no se puede borrar.
          </p>

          <input
            ref={entrada}
            type="file"
            accept="image/*"
            // `capture` no se pone a proposito: en el movil deja elegir entre
            // la camara y el carrete, y muchas veces la foto util ya esta
            // tomada.
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) alElegir(f);
              // Se limpia para poder volver a elegir el MISMO archivo.
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Reduce la foto a `LADO_MAXIMO` por su lado mayor y la devuelve como JPEG.
 *
 * Una foto de movil son 3-8 MB; asi baja a unos cientos de KB, que es lo que
 * hace viable subirla desde la obra. Se hace con el mismo canvas que el avatar
 * (`FotoPerfil`), que ya resolvio la lectura y la orientacion.
 *
 * Nunca AMPLIA: si la imagen ya es pequena se recomprime tal cual, sin
 * inventar pixeles.
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
            // El nombre se conserva (cambiando la extension) porque es lo
            // unico que ata la evidencia al archivo que el usuario reconoce.
            const nombre = archivo.name.replace(/\.[^.]+$/, "") || "foto";
            resolver(
              new File([blob], `${nombre}.jpg`, { type: "image/jpeg" }),
            );
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
