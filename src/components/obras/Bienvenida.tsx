import Link from "next/link";
import { ArrowRight, Compass, Plus } from "lucide-react";
import { Mascota } from "@/components/ui/Mascota";
import { PaletasHero } from "@/components/obras/PaletasHero";
import type { AlertaEmpresa, ResumenEmpresa } from "@/services/obras.service";

/**
 * La cabecera del panel: saludo, fecha y EL SIGUIENTE PASO.
 *
 * Antes el panel arrancaba con «Obras» y una cifra: correcto y frio. Esta
 * tarjeta lo convierte en un despacho que recibe a la persona por su nombre
 * y le contesta la unica pregunta con la que se abre un panel: «¿que tengo
 * que mirar hoy?». La respuesta no es decorativa —sale de las alertas
 * reales de la empresa, con el enlace al sitio exacto donde se arregla—.
 */

/**
 * La hora se toma SIEMPRE en Lima, no en la del servidor: GCM es una
 * herramienta peruana (RUC, soles) y el servidor puede estar en cualquier
 * huso. Un «buenos dias» a las siete de la tarde ensenaria justo lo
 * contrario de lo que esta tarjeta quiere: que el sistema sabe donde esta.
 */
function saludoSegunHora(hora: number): string {
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

interface Guia {
  texto: string;
  href: string | null;
  /// El aviso pinta el chip en ambar; el resto, en color de marca.
  esAviso: boolean;
  /// Enlace a la guia completa. Solo mientras la constructora se esta
  /// montando: despues no hay guia que ver y seria un enlace muerto.
  guiaCompleta: boolean;
}

/**
 * ESTE ES EL UNICO «siguiente paso» DEL PANEL, y hay que mantenerlo asi.
 *
 * Cuando se escribio el anclaje de continuidad de la obra, la tentacion fue
 * pintar aqui otro igual alimentado por la puesta en marcha. Habrian quedado
 * dos carteles contestando la misma pregunta en la misma pantalla, que es el
 * error de los dos mapas del mismo territorio que este proyecto ya pago
 * dentro de la obra. En vez de eso, la puesta en marcha entra AQUI.
 *
 * El orden de prioridad es el de la pregunta que se hace quien abre el panel:
 *
 *   1. **La constructora todavia se esta montando.** Entonces «que miro hoy»
 *      no es una alerta: es el paso que falta para que GCM sirva de algo. Una
 *      alerta de una obra sin presupuesto cargado no significa nada.
 *   2. **La alerta mas urgente**, que el servicio ya ordena.
 *   3. **Sin nada urgente**, que tambien es una respuesta.
 */
function siguientePaso(
  vacia: boolean,
  alertas: AlertaEmpresa[],
  enEjecucion: number,
  puedeCrear: boolean,
  pasoInicial: { titulo: string; camino: string } | null,
): Guia {
  if (pasoInicial) {
    return {
      texto: pasoInicial.titulo,
      href: pasoInicial.camino,
      esAviso: false,
      guiaCompleta: true,
    };
  }

  if (vacia) {
    /**
     * «Vacía» dejo de significar una sola cosa desde que existe el alcance
     * por obra: para el administrador es que la constructora no tiene
     * ninguna, y para todos los demas puede ser que no les hayan asignado
     * ninguna. Decirle «crea tu primera obra» a quien no puede crearlas es
     * mandarle a un sitio donde no hay boton.
     *
     * Con `pasoInicial` resuelto arriba, aqui ya solo cae quien NO puede dar
     * ningun paso de la puesta en marcha: tipicamente el residente al que
     * nadie ha asignado su obra.
     */
    return {
      texto: puedeCrear
        ? "Crea tu primera obra: la guía te acompaña paso a paso."
        : "Todavía no tienes ninguna obra asignada. El administrador de la empresa te asigna las tuyas desde la pestaña Equipo de cada obra.",
      href: null,
      esAviso: false,
      guiaCompleta: false,
    };
  }

  // La primera alerta es la mas urgente: el servicio ya las ordena y cada
  // una trae el camino exacto donde se arregla.
  const alerta = alertas[0];
  if (alerta) {
    const resto = alertas.length - 1;
    return {
      texto:
        resto > 0
          ? `${alerta.obraNombre}: ${alerta.texto} (y ${resto} aviso${resto === 1 ? "" : "s"} más).`
          : `${alerta.obraNombre}: ${alerta.texto}.`,
      href: alerta.camino,
      esAviso: true,
      guiaCompleta: false,
    };
  }

  return {
    texto:
      enEjecucion > 0
        ? "Sin avisos urgentes. Revisa el tablero y sigue con la semana."
        : "Sin avisos urgentes ni obras en ejecución.",
    href: null,
    esAviso: false,
    guiaCompleta: false,
  };
}

export function Bienvenida({
  nombres,
  resumen,
  alertas,
  vacia,
  puedeCrear,
  pasoInicial,
}: {
  nombres: string;
  resumen: ResumenEmpresa;
  alertas: AlertaEmpresa[];
  vacia: boolean;
  puedeCrear: boolean;
  /// El paso pendiente de la puesta en marcha, si queda alguno que quien
  /// mira pueda dar. Manda sobre las alertas: ver `siguientePaso`.
  pasoInicial: { titulo: string; camino: string } | null;
}) {
  const ahora = new Date();
  const hora = Number(
    new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      hour: "numeric",
      hourCycle: "h23",
    }).format(ahora),
  );
  const fecha = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(ahora);

  const guia = siguientePaso(
    vacia,
    alertas,
    resumen.obrasEnEjecucion,
    puedeCrear,
    pasoInicial,
  );

  return (
    <section
      aria-label="Bienvenida"
      className="relative overflow-hidden rounded-2xl border p-5 sm:p-6"
      style={{
        borderColor:
          "color-mix(in oklab, var(--color-marca-500) 24%, var(--borde))",
        // El degradado usa la marca DILUIDA sobre la superficie: cambia con
        // la paleta elegida sin una linea de JavaScript, y en oscuro se
        // apaga solo porque la superficie es oscura.
        background:
          "linear-gradient(120deg, color-mix(in oklab, var(--color-marca-500) 14%, var(--superficie)) 0%, var(--superficie) 60%)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* La fecha con el peso visual MENOR y el nombre con el mayor:
              la tarjeta saluda, no da la hora. */}
          <p className="text-xs font-medium tracking-wide uppercase opacity-60">
            {fecha}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-balance">
            {saludoSegunHora(hora)}, {nombres}
          </h1>
          {!vacia && (
            <p className="mt-1 text-sm opacity-70">
              {resumen.obrasEnEjecucion} de {resumen.obras} obra
              {resumen.obras === 1 ? "" : "s"} en ejecución.
            </p>
          )}
        </div>

        {/* Decorativa: el alt informativo lo lleva la mascota del estado
            vacio. En angosto desaparece para no robarle ancho al saludo. */}
        <Mascota
          pose="sonriendo"
          alto={96}
          className="hidden shrink-0 sm:block"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: guia.esAviso ? "var(--color-alerta)" : "var(--color-marca-600)",
              backgroundColor: `color-mix(in oklab, ${
                guia.esAviso ? "var(--color-alerta)" : "var(--color-marca-500)"
              } 16%, transparent)`,
            }}
          >
            <Compass className="size-3.5" aria-hidden="true" />
            Siguiente paso
          </span>
          <span className="opacity-80">{guia.texto}</span>
          {guia.href && (
            <Link
              href={guia.href}
              className="inline-flex items-center gap-1 font-medium"
              style={{ color: "var(--color-marca-600)" }}
            >
              Ir
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
          {/* La guia entera, solo mientras queda algo por montar. Va DETRAS
              del «Ir» y en tono menor: lo normal es dar el paso que toca; la
              lista completa es para quien quiere sentarse a llenarlo todo de
              una vez, que es justo lo que pedia el primer dia. */}
          {guia.guiaCompleta && (
            <Link
              href="/empresa/puesta-en-marcha"
              className="inline-flex items-center gap-1 opacity-70 hover:opacity-100"
            >
              Ver todos los pasos
            </Link>
          )}
        </p>

        {/* Con la empresa vacia el boton no se duplica: ya lo pone, en
            grande, el estado vacio de la lista. */}
        {puedeCrear && !vacia && (
          <Link
            href="/obras/nueva"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva obra
          </Link>
        )}
      </div>

      {/* Las paletas, en el sitio mas visto de la aplicacion: una
          preferencia que nadie descubre no es una preferencia. */}
      <div className="mt-3 flex justify-end">
        <PaletasHero />
      </div>
    </section>
  );
}
