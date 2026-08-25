"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { agruparFotos, etiquetaGrupo, type AgrupacionGaleria } from "@/lib/galeria";
import type { ResultadoGaleria } from "@/services/galeria.service";
import { useMotivoSinEscritura } from "@/components/obras/EscrituraDeLaObra";

/**
 * La rejilla de la galeria: agrupada por periodo, con visor a pantalla
 * completa y la curaduria foto a foto.
 *
 * Sirve a DOS pantallas con la misma pieza: la interna (con acciones) y la
 * publica del cliente (solo mirar). Las acciones llegan como propiedades
 * OPCIONALES: la pagina publica simplemente no las pasa, y con eso no existe
 * ni el boton. Igual con `sufijoSrc`: la pagina del cliente lo usa para
 * colgar su slug de cada imagen, porque sus <img> se piden sin cookie.
 */

export interface FotoRejilla {
  id: string;
  titulo: string | null;
  descripcion: string | null;
  createdAt: Date;
  /// Solo en la vista interna; el cliente no recibe ni esto ni el autor.
  visibleCliente?: boolean;
  subidaPor?: string;
}

export interface AccionesGaleria {
  editar: (fotoId: string, datos: FormData) => Promise<ResultadoGaleria>;
  eliminar: (fotoId: string) => Promise<ResultadoGaleria>;
  /// Solo con `galeria:publicar`; sin ella el interruptor no se pinta.
  marcarVisible?: (fotoId: string, visible: boolean) => Promise<ResultadoGaleria>;
}

/// "vie. 14 de agosto, 3:24 p. m." en hora de Lima: la fecha que da fe de
/// cuando se tomo (bueno, de cuando se subio) cada foto.
function fechaFoto(instante: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(instante);
}

export function RejillaGaleria({
  fotos,
  agrupacion,
  sufijoSrc = "",
  acciones: accionesRecibidas,
}: {
  fotos: FotoRejilla[];
  agrupacion: AgrupacionGaleria;
  /// "?g=<slug>" en la pagina publica; vacio en la interna.
  sufijoSrc?: string;
  acciones?: AccionesGaleria;
}) {
  /// Indice sobre la lista PLANA, para que el visor recorra toda la galeria
  /// sin frenar en el borde de cada grupo.
  const [abierta, setAbierta] = useState<number | null>(null);

  /*
   * En una obra que no admite cambios se mira, no se toca: la rejilla se
   * queda entera y lo que se cae son editar, eliminar y marcar visible.
   * `subirFotoGaleria` y sus hermanas lo rechazan en el servidor.
   *
   * En la galeria PUBLICA no hay obra en el contexto, el hook devuelve null y
   * esto no cambia nada: alli `acciones` ya viene sin definir.
   */
  const acciones =
    useMotivoSinEscritura() === null ? accionesRecibidas : undefined;

  const grupos = agruparFotos(fotos, agrupacion);
  const indiceDe = new Map(fotos.map((f, i) => [f.id, i] as const));

  if (fotos.length === 0) return null;

  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <section key={g.clave} aria-label={etiquetaGrupo(g.inicio, agrupacion)}>
          <h3 className="mb-2 text-sm font-semibold">
            {etiquetaGrupo(g.inicio, agrupacion)}
            <span className="ml-2 text-xs font-normal opacity-55">
              {g.fotos.length} foto{g.fotos.length === 1 ? "" : "s"}
            </span>
          </h3>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.fotos.map((f) => (
              <Tarjeta
                key={f.id}
                foto={f}
                src={`/api/galeria/${f.id}${sufijoSrc}`}
                acciones={acciones}
                onAbrir={() => setAbierta(indiceDe.get(f.id) ?? 0)}
              />
            ))}
          </ul>
        </section>
      ))}

      {abierta !== null && (
        <Visor
          fotos={fotos}
          indice={abierta}
          sufijoSrc={sufijoSrc}
          onIr={setAbierta}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}

/**
 * Una foto de la rejilla: miniatura, fecha, y —si hay acciones— la
 * curaduria. La edicion transforma la tarjeta en su propio formulario en vez
 * de abrir un dialogo: en el movil de obra los dialogos flotantes estorban.
 */
function Tarjeta({
  foto,
  src,
  acciones,
  onAbrir,
}: {
  foto: FotoRejilla;
  src: string;
  acciones?: AccionesGaleria;
  onAbrir: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function correr(operacion: () => Promise<ResultadoGaleria>) {
    setOcupada(true);
    setError(null);
    const r = await operacion();
    setOcupada(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
    return r.ok;
  }

  return (
    <li
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <button
        type="button"
        onClick={onAbrir}
        className="block w-full"
        aria-label={`Ver en grande: ${foto.titulo ?? foto.descripcion ?? fechaFoto(foto.createdAt)}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- la imagen
            sale de un route handler propio con control de acceso; el
            optimizador de Next esta apagado en produccion (unoptimized). */}
        <img
          src={src}
          alt={foto.titulo ?? foto.descripcion ?? "Foto de la obra"}
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition-transform hover:scale-[1.02]"
        />
      </button>

      <div className="space-y-1 p-2">
        <p className="text-xs opacity-60">{fechaFoto(foto.createdAt)}</p>

        {editando && acciones ? (
          <form
            className="space-y-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              const datos = new FormData(e.currentTarget);
              if (await correr(() => acciones.editar(foto.id, datos))) {
                setEditando(false);
              }
            }}
          >
            <input
              name="titulo"
              defaultValue={foto.titulo ?? ""}
              maxLength={150}
              placeholder="Título"
              className="w-full rounded border px-2 py-1 text-xs"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            />
            <textarea
              name="descripcion"
              defaultValue={foto.descripcion ?? ""}
              maxLength={500}
              rows={2}
              placeholder="Descripción: qué se ve y por qué importa"
              className="w-full rounded border px-2 py-1 text-xs"
              style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
            />
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={ocupada}
                className="rounded px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--color-marca-600)" }}
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded border px-2 py-1 text-xs"
                style={{ borderColor: "var(--borde)" }}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <>
            {foto.titulo && (
              <p className="text-xs font-semibold text-balance">{foto.titulo}</p>
            )}
            {foto.descripcion && (
              <p className="line-clamp-2 text-xs opacity-75">{foto.descripcion}</p>
            )}
            {foto.subidaPor && (
              <p className="text-xs opacity-50">{foto.subidaPor}</p>
            )}
          </>
        )}

        {acciones && !editando && (
          <div className="flex items-center gap-1 pt-0.5">
            {acciones.marcarVisible && (
              // El interruptor de publicacion, foto a foto. Texto ademas de
              // icono: "visible para el cliente" no puede depender de saber
              // leer un ojo tachado.
              <button
                type="button"
                disabled={ocupada}
                onClick={() =>
                  correr(() =>
                    acciones.marcarVisible!(foto.id, !foto.visibleCliente),
                  )
                }
                title={
                  foto.visibleCliente
                    ? "El cliente la ve. Tocar para ocultarla."
                    : "El cliente no la ve. Tocar para publicarla."
                }
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  color: foto.visibleCliente
                    ? "var(--color-exito)"
                    : "var(--texto-suave)",
                  backgroundColor: foto.visibleCliente
                    ? "color-mix(in oklab, var(--color-exito) 14%, transparent)"
                    : "transparent",
                }}
              >
                {foto.visibleCliente ? (
                  <Eye className="size-3.5" aria-hidden="true" />
                ) : (
                  <EyeOff className="size-3.5" aria-hidden="true" />
                )}
                {foto.visibleCliente ? "Cliente" : "Oculta"}
              </button>
            )}

            <span className="flex-1" />

            {ocupada && (
              <LoaderCircle className="size-3.5 animate-spin opacity-60" aria-hidden="true" />
            )}

            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label="Editar título y descripción"
              className="rounded p-1 opacity-60 hover:opacity-100"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              disabled={ocupada}
              onClick={() => {
                // confirm() nativo y no un dialogo propio: es UNA pregunta y
                // el borrado de galeria no es probatorio (la evidencia, que
                // si lo es, directamente no tiene este boton).
                if (window.confirm("¿Quitar esta foto de la galería?")) {
                  void correr(() => acciones.eliminar(foto.id));
                }
              }}
              aria-label="Quitar la foto"
              className="rounded p-1 opacity-60 hover:opacity-100"
              style={{ color: "var(--color-peligro)" }}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-[11px]" style={{ color: "var(--color-peligro)" }}>
            {error}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * El visor a pantalla completa, con fundido corto entre fotos.
 *
 * Sin carrusel automatico a proposito: esto es control de obra, no un
 * salvapantallas. Se navega con las flechas —de teclado o de pantalla—, y se
 * sale por los tres caminos que la gente prueba: la equis, tocar fuera y
 * Escape (los mismos del modulo ampliado del tablero, porque quedarse
 * atrapado en una capa que tapa todo es de las cosas que mas enfadan).
 */
function Visor({
  fotos,
  indice,
  sufijoSrc,
  onIr,
  onCerrar,
}: {
  fotos: FotoRejilla[];
  indice: number;
  sufijoSrc: string;
  onIr: (indice: number) => void;
  onCerrar: () => void;
}) {
  const [visible, setVisible] = useState(true);
  const foto = fotos[indice];

  // El fundido: se apaga, se cambia, se enciende. 120 ms es lo bastante
  // corto para no estorbar a quien pasa veinte fotos seguidas.
  const ir = useCallback(
    (nuevo: number) => {
      if (nuevo < 0 || nuevo >= fotos.length) return;
      setVisible(false);
      window.setTimeout(() => {
        onIr(nuevo);
        setVisible(true);
      }, 120);
    },
    [fotos.length, onIr],
  );

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
      if (e.key === "ArrowLeft") ir(indice - 1);
      if (e.key === "ArrowRight") ir(indice + 1);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [indice, onCerrar, ir]);

  if (!foto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col p-4"
      style={{ backgroundColor: "color-mix(in oklab, black 82%, transparent)" }}
      onClick={onCerrar}
      role="presentation"
    >
      <div className="flex items-center justify-between gap-3 text-white">
        <p className="text-xs tabular-nums opacity-80">
          {indice + 1} de {fotos.length}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar el visor"
          className="rounded-lg p-2 opacity-80 hover:opacity-100"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-label={foto.titulo ?? "Foto de la obra"}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ver la nota
            de la miniatura: route handler propio y optimizador apagado. */}
        <img
          src={`/api/galeria/${foto.id}${sufijoSrc}`}
          alt={foto.titulo ?? foto.descripcion ?? "Foto de la obra"}
          className="min-h-0 max-w-full flex-1 object-contain transition-opacity duration-150"
          style={{ opacity: visible ? 1 : 0 }}
        />

        <div
          className="max-w-xl text-center text-white transition-opacity duration-150"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <p className="text-xs opacity-70">{fechaFoto(foto.createdAt)}</p>
          {foto.titulo && <p className="mt-0.5 text-sm font-semibold">{foto.titulo}</p>}
          {foto.descripcion && (
            <p className="mt-0.5 text-sm opacity-85">{foto.descripcion}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => ir(indice - 1)}
            disabled={indice === 0}
            aria-label="Foto anterior"
            className="rounded-lg border border-white/30 p-2 text-white disabled:opacity-30"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => ir(indice + 1)}
            disabled={indice === fotos.length - 1}
            aria-label="Foto siguiente"
            className="rounded-lg border border-white/30 p-2 text-white disabled:opacity-30"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
