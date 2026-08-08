import { HardHat, Code2, Tag } from "lucide-react";

/**
 * Pie de pagina del area privada: marca, ano, creditos y version.
 *
 * Minimalista y con iconos: la marca en negrita a la izquierda, los creditos
 * y la version a la derecha. El ano se calcula en horario de Peru —como el
 * resto de fechas del sistema— para que el aviso de derechos no cambie de ano
 * un dia antes por el desfase del servidor. `print:hidden` para no ensuciar
 * los documentos que se imprimen.
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
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 text-xs sm:flex-row sm:px-6">
        {/* Marca: el icono en el color de marca, el nombre en negrita. */}
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

        <div className="flex items-center gap-4 opacity-70">
          <span className="flex items-center gap-1.5">
            <Code2 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="font-semibold">Dr. Caceres Ruiz</span>
          </span>
          <span className="flex items-center gap-1.5 tabular-nums">
            <Tag className="size-3.5 shrink-0" aria-hidden="true" />
            v{VERSION}
          </span>
        </div>
      </div>
    </footer>
  );
}
