import Link from "next/link";
import { ArrowRight, Compass, Plus } from "lucide-react";
import { Mascota } from "@/components/ui/Mascota";
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
}

function siguientePaso(
  vacia: boolean,
  alertas: AlertaEmpresa[],
  enEjecucion: number,
): Guia {
  if (vacia) {
    return {
      texto: "Crea tu primera obra: la guía te acompaña paso a paso.",
      href: null,
      esAviso: false,
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
    };
  }

  return {
    texto:
      enEjecucion > 0
        ? "Sin avisos urgentes. Revisa el tablero y sigue con la semana."
        : "Sin avisos urgentes ni obras en ejecución.",
    href: null,
    esAviso: false,
  };
}

export function Bienvenida({
  nombres,
  resumen,
  alertas,
  vacia,
  puedeCrear,
}: {
  nombres: string;
  resumen: ResumenEmpresa;
  alertas: AlertaEmpresa[];
  vacia: boolean;
  puedeCrear: boolean;
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

  const guia = siguientePaso(vacia, alertas, resumen.obrasEnEjecucion);

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
    </section>
  );
}
