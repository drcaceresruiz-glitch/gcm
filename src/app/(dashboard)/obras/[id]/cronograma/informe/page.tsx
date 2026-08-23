import type { Metadata } from "next";
import { Download, FileText, Share2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import Link from "next/link";
import type { CorteDisponible } from "@/services/cronograma.service";
import { componerInforme } from "@/services/informe.service";
import { fechaCorta, hoy } from "@/utils/fechas";
import { Volver } from "@/components/ui/Volver";
import { BotonImprimir } from "@/components/cronograma/BotonImprimir";
import { EnviarInforme } from "@/components/cronograma/EnviarInforme";
import { EnviarInformeSms } from "@/components/cronograma/EnviarInformeSms";
import { InformeSemanal } from "@/components/cronograma/InformeSemanal";
import { puede } from "@/lib/rbac";
import { eleccionDeInforme } from "@/services/plantilla-informe.service";
import { ElegirPlantillaInforme } from "@/components/informe/ElegirPlantillaInforme";
import { ETIQUETA_PLANTILLA } from "@/lib/plantilla-informe";
import { accionPlantillaInformeObra } from "../../acciones-informe";
import { hayCanalSms } from "@/services/sms.service";
import {
  enlaceWhatsApp,
  textoSms,
  textoWhatsApp,
} from "@/lib/informe-mensaje";

export const metadata: Metadata = { title: "Informe semanal" };

/**
 * El informe semanal de obra, listo para imprimir o guardar como PDF.
 *
 * Todo se calcula en el servidor: la pagina no manda ni un byte de JavaScript
 * salvo el boton de imprimir, que ademas desaparece en el papel. Asi el
 * documento sale igual se imprima desde donde se imprima.
 */
export default async function InformePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corte?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const { corte } = await searchParams;

  // TODO el contenido se mide a la fecha elegida, no a la del ultimo XML
  // importado: las alertas, las partidas en marcha y los capitulos hablan de
  // ESA semana. Antes salian siempre del corte de la importacion, y por eso el
  // informe del 12 de agosto encabezaba «08 de agosto» y decia que no habia
  // ninguna partida en marcha.
  const informe = await componerInforme(sesion, id, corte);

  if (informe.estado === "sin-obra") notFound();
  if (informe.estado === "sin-permiso") redirect(`/obras/${id}`);
  // Sin cronograma no hay informe que dar: se devuelve a la pantalla que
  // explica como cargarlo, en vez de imprimir una hoja vacia.
  if (informe.estado === "sin-cronograma") redirect(`/obras/${id}/cronograma`);

  const datos = informe.datos;
  const corteIso = datos.fechaCorte.toISOString().slice(0, 10);

  // Los dos mensajes se componen AQUI, en el servidor, por lo mismo que el
  // correo: un resumen firmado por GCM no puede llevar cifras que vengan del
  // navegador. Al cliente solo baja el texto ya hecho.
  const paraWhatsApp = enlaceWhatsApp(textoWhatsApp(datos));
  const paraSms = textoSms(datos);
  const canalSms = await hayCanalSms(sesion.companyId);

  // Que hojas lleva, y de donde sale esa decision. Se enseña junto a los
  // botones que producen el documento, no en una pantalla de ajustes aparte.
  const seleccion = await eleccionDeInforme(sesion, id);
  const puedeEditarObra = puede(sesion, "obra:editar");

  return (
    <div className="space-y-4">
      {/* Todo este bloque desaparece al imprimir: el papel que recibe el
          cliente no puede salir con botones de navegacion encima. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Volver href={`/obras/${id}/cronograma`}>Volver al cronograma</Volver>
        <div className="flex flex-wrap items-center gap-2">
          {/* Un enlace, no un boton con JavaScript: la descarga la resuelve el
              navegador solo. Y lleva la fecha ESCRITA aunque la URL no la
              traiga, para que el archivo no pueda salir de otro corte que el
              que se esta mirando. */}
          <a
            href={`/obras/${id}/cronograma/informe/pdf?corte=${corteIso}`}
            download
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <FileText className="size-4" aria-hidden="true" />
            Descargar PDF
          </a>
          <a
            href={`/obras/${id}/cronograma/informe/csv?corte=${corteIso}`}
            download
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Download className="size-4" aria-hidden="true" />
            Descargar datos (CSV)
          </a>
          <EnviarInforme obraId={id} corteIso={corteIso} />

          {/* Un enlace normal, sin JavaScript: WhatsApp lo abre el sistema con
              el texto ya escrito, y quien manda elige el chat. GCM no envia
              nada aqui —no puede— y por eso no hace falta canal ninguno. */}
          <a
            href={paraWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium"
            style={{ borderColor: "var(--borde)" }}
          >
            <Share2 className="size-4" aria-hidden="true" />
            Compartir por WhatsApp
          </a>

          <EnviarInformeSms
            obraId={id}
            corteIso={corteIso}
            texto={paraSms}
            hayCanal={canalSms}
          />
          <BotonImprimir />
        </div>
      </div>

      {/* Que hojas lleva ESTA obra. Va aqui, junto a los botones que producen
          el documento, y no en una pantalla de ajustes aparte: se decide
          mirando lo que se va a mandar. Tambien fuera del papel al imprimir. */}
      {puedeEditarObra && (
        <details className="rounded-lg border p-3 print:hidden" style={{ borderColor: "var(--borde)" }}>
          <summary className="cursor-pointer text-sm font-medium">
            Qué lleva este informe
            <span className="ml-2 font-normal opacity-70">
              {ETIQUETA_PLANTILLA[seleccion.plantilla]}
              {seleccion.origen === "empresa" ? " (de la constructora)" : " (solo esta obra)"}
              {seleccion.apagadas.length > 0
                ? ` · ${seleccion.apagadas.length} sección(es) apagada(s)`
                : ""}
            </span>
          </summary>
          <div className="mt-3">
            <ElegirPlantillaInforme
              accion={accionPlantillaInformeObra}
              obraId={id}
              plantillaActual={seleccion.origen === "obra" ? seleccion.plantilla : null}
              apagadasActuales={seleccion.origen === "obra" ? seleccion.apagadas : []}
              puedeHeredar
              heredado={{
                plantilla: seleccion.plantilla,
                apagadas: seleccion.apagadas.length,
              }}
            />
          </div>
        </details>
      )}

      {/* El selector de semana. Enlaces y no un desplegable con JavaScript:
          esta pagina no manda ni un byte al cliente salvo el boton de
          imprimir, y no va a empezar ahora. */}
      <SelectorDeCorte
        obraId={id}
        cortes={datos.cortes}
        elegido={datos.fechaCorte}
        hoyIso={hoy().toISOString().slice(0, 10)}
      />

      <InformeSemanal datos={datos} />
    </div>
  );
}

/**
 * Elegir de que semana es el informe.
 *
 * Se ofrecen los dias de cierre que ya pasaron, rotulados con el numero de
 * semana del PTS cuando coinciden. Hasta ahora el informe solo sabia emitir
 * uno —el del ultimo XML—, asi que revisar lo que se entrego hace tres semanas
 * era imposible.
 */
function SelectorDeCorte({
  obraId,
  cortes,
  elegido,
  hoyIso,
}: {
  obraId: string;
  cortes: CorteDisponible[];
  elegido: Date;
  hoyIso: string;
}) {
  const elegidoIso = elegido.toISOString().slice(0, 10);
  if (cortes.length <= 1) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm print:hidden"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <span className="opacity-70">Informe al corte de:</span>

      {/* Cualquier dia, no solo los cortes. El informe se pide por motivos que
          no siguen el calendario del PTS —una visita del cliente, una
          valorizacion, un martes cualquiera— y con solo tres botones «informe
          al corte» era en realidad «informe de la semana».
          
          Es un formulario GET y no un desplegable con JavaScript: esta pagina
          no manda un solo byte al cliente salvo el boton de imprimir. */}
      <form method="get" className="flex items-center gap-1.5">
        <input
          type="date"
          name="corte"
          defaultValue={elegidoIso}
          max={hoyIso}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
          aria-label="Fecha del informe"
        />
        <button
          type="submit"
          className="rounded-lg border px-2 py-1 text-xs font-medium"
          style={{ borderColor: "var(--borde)" }}
        >
          Ver
        </button>
      </form>

      {cortes.slice(0, 8).map((c) => {
        const activo = c.fecha.getTime() === elegido.getTime();
        return (
          <Link
            key={c.iso}
            href={`/obras/${obraId}/cronograma/informe?corte=${c.iso}`}
            className="rounded-lg border px-2.5 py-1 text-xs font-medium"
            style={{
              borderColor: activo ? "var(--color-marca-600)" : "var(--borde)",
              color: activo ? "var(--color-marca-600)" : undefined,
            }}
          >
            {c.semana !== null ? `Semana ${c.semana} · ` : ""}
            {fechaCorta(c.fecha)}
            {c.esUltimo ? " (hoy)" : ""}
          </Link>
        );
      })}
    </div>
  );
}
