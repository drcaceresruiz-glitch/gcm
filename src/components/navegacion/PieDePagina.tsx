import { HardHat, Ruler, Tag } from "lucide-react";

/**
 * Pie de pagina del area privada: marca, ano, creditos y version.
 *
 * Centrado, en negrita y con iconos. El ano se calcula en horario de Peru
 * —como el resto de fechas del sistema— para que el aviso de derechos no
 * cambie de ano un dia antes por el desfase del servidor. `print:hidden` para
 * no ensuciar los documentos que se imprimen.
 */

/// Version de la aplicacion. Acompana a la de `package.json`; se toca a mano
/// al publicar para que el pie diga que hay desplegado.
const VERSION = "0.1.0";

const ANIO = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  year: "numeric",
}).format(new Date());

export function PieDePagina() {
  return (
    <footer
      className="border-t print:hidden"
      style={{ borderColor: "var(--borde)" }}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2 px-4 py-5 text-center text-xs font-semibold sm:px-6">
        {/* Marca centrada: icono en el color de marca y el nombre en negrita. */}
        <p className="flex items-center gap-2">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: "var(--color-marca-500)" }}
          >
            <HardHat className="size-3.5 text-white" aria-hidden="true" />
          </span>
          <span className="font-bold">GCM</span>
          <span className="opacity-60">&copy; {ANIO}</span>
        </p>

        {/* Creditos y version, centrados y en negrita, envolviendo en pantallas
            estrechas. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <span>Dr. Caceres Ruiz</span>
          <span className="flex items-center gap-1.5">
            <Ruler className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
            Arq. Eduardo Antonio Perez Moreno
          </span>
          <span
            className="flex items-center gap-1.5 tracking-wider opacity-70"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
          >
            <Tag className="size-3.5 shrink-0" aria-hidden="true" />
            v{VERSION}
          </span>
        </div>
      </div>
    </footer>
  );
}
