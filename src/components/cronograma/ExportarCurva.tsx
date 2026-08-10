"use client";

import { useState, useTransition, type RefObject } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Image as IconoImagen,
  LoaderCircle,
  Mail,
  Printer,
  Share2,
} from "lucide-react";
import {
  accionEnviarCurva,
  type RespuestaEnvio,
} from "@/app/(dashboard)/obras/[id]/cronograma/acciones";
import { aBase64, descargar, svgAPng, svgAutonomo } from "@/utils/grafico";

/**
 * Sacar la curva de la pantalla: descargarla, imprimirla, enviarla.
 *
 * TODO se genera en el navegador. Producir la imagen en el servidor exigiria
 * un navegador sin ventana, y este despliegue no puede correr binarios
 * compilados: es el mismo muro que dejo fuera al motor de Prisma.
 *
 * Sobre WhatsApp, para que no haya malentendidos: una pagina web NO puede
 * adjuntar un archivo a WhatsApp. Un enlace `wa.me` solo lleva texto. Lo que
 * si funciona es la bandeja de compartir del propio sistema, que en el movil
 * incluye WhatsApp y admite la imagen; por eso el boton «Compartir» aparece
 * solo donde el dispositivo lo soporta, en vez de prometer algo que en el
 * escritorio no iba a ocurrir.
 */

export interface ResumenCurva {
  obra: string;
  corte: string;
  planeado: string;
  real: string;
  desfase: string;
  ritmo: string;
  termino: string;
}

export function ExportarCurva({
  obraId,
  grafico,
  resumen,
}: {
  obraId: string;
  /// El SVG que se esta viendo. Se copia antes de tocarlo.
  grafico: RefObject<SVGSVGElement | null>;
  resumen: ResumenCurva;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [formulario, setFormulario] = useState(false);
  const [envio, setEnvio] = useState<RespuestaEnvio | null>(null);
  const [enviando, iniciarEnvio] = useTransition();

  const nombreBase = `curva-avance-${resumen.corte.replace(/\//g, "-")}`;

  async function conGrafico<T>(
    etiqueta: string,
    trabajo: (svg: SVGSVGElement) => Promise<T>,
  ): Promise<T | null> {
    const svg = grafico.current;
    if (!svg) {
      setError("El gráfico aún no está listo.");
      return null;
    }

    setError(null);
    setAviso(null);
    setOcupado(etiqueta);

    try {
      return await trabajo(svg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo preparar el gráfico.");
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function descargarImagen() {
    await conGrafico("png", async (svg) => {
      descargar(await svgAPng(svg), `${nombreBase}.png`);
    });
  }

  async function compartir() {
    await conGrafico("compartir", async (svg) => {
      const blob = await svgAPng(svg);
      const archivo = new File([blob], `${nombreBase}.png`, { type: "image/png" });

      if (!navigator.canShare?.({ files: [archivo] })) {
        // En vez de fallar en silencio se descarga y se explica: el usuario
        // tiene la imagen y sabe que le toca adjuntarla a mano.
        descargar(blob, `${nombreBase}.png`);
        setAviso(
          "Este equipo no puede compartir archivos directamente. La imagen se ha descargado: adjúntala tú en WhatsApp o donde la necesites.",
        );
        return;
      }

      try {
        await navigator.share({
          files: [archivo],
          title: `Curva de avance — ${resumen.obra}`,
          text: `Corte ${resumen.corte}: real ${resumen.real}% sobre un plan de ${resumen.planeado}% (${resumen.desfase}%).`,
        });
      } catch {
        // Cancelar la bandeja de compartir no es un error que haya que
        // contarle a nadie.
      }
    });
  }

  /**
   * Vista de impresion.
   *
   * Se abre una ventana con el grafico en SVG —no en PNG— para que el PDF
   * salga vectorial y se pueda ampliar sin pixelarse. Desde ahi, «Guardar como
   * PDF» del propio navegador hace el resto: no hace falta ninguna libreria ni
   * nada corriendo en el servidor.
   */
  async function imprimir() {
    await conGrafico("pdf", async (svg) => {
      const marcado = svgAutonomo(svg);
      const ventana = window.open("", "_blank", "width=1024,height=768");

      if (!ventana) {
        setError(
          "El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes de este sitio y vuelve a intentarlo.",
        );
        return;
      }

      const dato = (etiqueta: string, valor: string) =>
        `<tr><th>${etiqueta}</th><td>${valor}</td></tr>`;

      ventana.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${nombreBase}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1b2733; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  p.sub { margin: 0 0 16px; color: #6b7a82; font-size: 13px; }
  svg { width: 100%; height: auto; }
  table { border-collapse: collapse; margin-top: 14px; font-size: 13px; }
  th { text-align: left; color: #6b7a82; font-weight: normal; padding: 4px 18px 4px 0; }
  td { font-weight: bold; padding: 4px 0; }
  footer { margin-top: 18px; color: #6b7a82; font-size: 11px; }
</style></head>
<body>
  <h1>Curva de avance — ${escapar(resumen.obra)}</h1>
  <p class="sub">Corte del ${escapar(resumen.corte)}</p>
  ${marcado}
  <table>
    ${dato("Avance real", `${escapar(resumen.real)}%`)}
    ${dato("Avance planeado", `${escapar(resumen.planeado)}%`)}
    ${dato("Desfase", `${escapar(resumen.desfase)}%`)}
    ${dato("Ritmo actual", `${escapar(resumen.ritmo)} de lo previsto`)}
    ${dato("Término proyectado", escapar(resumen.termino))}
  </table>
  <footer>GCM - Gestión en Construcción Moderna</footer>
</body></html>`);

      ventana.document.close();
      ventana.focus();

      // Se espera a que la ventana termine de montar antes de imprimir: si se
      // llama de inmediato, algunos navegadores imprimen la pagina en blanco.
      ventana.setTimeout(() => ventana.print(), 400);
    });
  }

  function enviar(datos: FormData) {
    iniciarEnvio(async () => {
      const svg = grafico.current;
      if (!svg) return;

      try {
        datos.set("imagen", await aBase64(await svgAPng(svg)));
      } catch {
        setEnvio({ ok: false, error: "No se pudo preparar el gráfico." });
        return;
      }

      const resultado = await accionEnviarCurva({ ok: true }, datos);
      setEnvio(resultado);
      if (resultado.ok) setFormulario(false);
    });
  }

  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--borde)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Boton onClick={descargarImagen} cargando={ocupado === "png"} icono={IconoImagen}>
          Descargar imagen
        </Boton>
        <Boton onClick={imprimir} cargando={ocupado === "pdf"} icono={Printer}>
          Ver / Guardar PDF
        </Boton>
        <Boton
          onClick={() => {
            setFormulario((v) => !v);
            setEnvio(null);
          }}
          icono={Mail}
          activo={formulario}
        >
          Enviar por correo
        </Boton>
        <Boton onClick={compartir} cargando={ocupado === "compartir"} icono={Share2}>
          Compartir
        </Boton>
      </div>

      {error && <Nota tono="peligro">{error}</Nota>}
      {aviso && <Nota tono="alerta">{aviso}</Nota>}
      {envio?.error && <Nota tono="peligro">{envio.error}</Nota>}
      {envio?.ok && envio.mensaje && <Nota tono="exito">{envio.mensaje}</Nota>}

      {formulario && (
        <form action={enviar} className="mt-3 space-y-3">
          <input type="hidden" name="obraId" value={obraId} />
          <input type="hidden" name="corte" value={resumen.corte} />
          <input type="hidden" name="planeado" value={resumen.planeado} />
          <input type="hidden" name="real" value={resumen.real} />
          <input type="hidden" name="desfase" value={resumen.desfase} />
          <input type="hidden" name="ritmo" value={resumen.ritmo} />
          <input type="hidden" name="termino" value={resumen.termino} />

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-64 flex-1 text-xs">
              <span className="block opacity-70">
                Para (varios correos separados por coma)
              </span>
              <input
                name="para"
                type="text"
                required
                placeholder="residente@obra.pe, cliente@empresa.pe"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              />
            </label>

            <label className="min-w-64 flex-1 text-xs">
              <span className="block opacity-70">Nota (opcional)</span>
              <input
                name="nota"
                type="text"
                maxLength={500}
                placeholder="Comentario para quien lo reciba"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
              />
            </label>

            <button
              type="submit"
              disabled={enviando}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              {enviando && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              Enviar
            </button>
          </div>

          <p className="text-xs opacity-60">
            El gráfico va adjunto como imagen, y las cifras también en el cuerpo
            del correo. Cada destinatario lo recibe por separado: nadie ve la
            lista de los demás.
          </p>
        </form>
      )}
    </div>
  );
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function Boton({
  onClick,
  icono: Icono,
  cargando,
  activo,
  children,
}: {
  onClick: () => void;
  icono: typeof Mail;
  cargando?: boolean;
  activo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      aria-pressed={activo}
      className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
      style={{
        borderColor: activo ? "var(--color-marca-600)" : "var(--borde)",
        backgroundColor: activo
          ? "color-mix(in oklab, var(--color-marca-600) 12%, transparent)"
          : undefined,
      }}
    >
      {cargando ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icono className="size-4" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

function Nota({
  tono,
  children,
}: {
  tono: "peligro" | "alerta" | "exito";
  children: React.ReactNode;
}) {
  const color = `var(--color-${tono})`;
  const Icono = tono === "exito" ? CheckCircle2 : AlertCircle;

  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)` }}
    >
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
