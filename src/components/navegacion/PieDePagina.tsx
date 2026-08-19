import { HardHat, Ruler, Tag } from "lucide-react";

import { SelloMetodologia } from "@/components/ui/SelloMetodologia";
import { AUTORIA } from "@/lib/autoria";
import { versionParaMostrar } from "@/lib/version";

/**
 * Pie de pagina del area privada: marca, ano, creditos y version.
 *
 * Centrado, en negrita y con iconos. El ano se calcula en horario de Peru
 * —como el resto de fechas del sistema— para que el aviso de derechos no
 * cambie de ano un dia antes por el desfase del servidor. `print:hidden` para
 * no ensuciar los documentos que se imprimen.
 *
 * LA VERSION NO SE ESCRIBE AQUI, y es lo unico importante de este archivo.
 * Aqui vivio `const VERSION = "0.1.0"` con la instruccion de tocarla a mano
 * en cada publicacion; nadie la toco en 473 commits y el pie anuncio la
 * version del andamio con la aplicacion ya en produccion. Ahora sale sola de
 * `lib/version`: el numero de `package.json` y el SHA del paquete que corre.
 */

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
          {/* El aviso de derechos va a nombre de la EMPRESA, no del producto:
              «GCM © 2026» no atribuia nada a nadie. Sale de `lib/autoria`, que
              es el unico sitio donde se escribe. */}
          <span className="opacity-60">
            &copy; {ANIO} {AUTORIA.empresa}
          </span>
        </p>

        {/* Creditos y version, centrados y en negrita, envolviendo en pantallas
            estrechas. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          {/* Los nombres tambien salen de `lib/autoria`: estaban escritos aqui
              a mano, y un nombre escrito a mano en un sitio es un nombre que
              algun dia solo se corrige en ese sitio. El `title` dice el papel
              de cada uno, que en el pie no cabe. */}
          {AUTORIA.personas.map(({ nombre, papel }, i) => (
            <span key={nombre} className="flex items-center gap-1.5" title={papel}>
              {i > 0 && (
                <Ruler
                  className="size-3.5 shrink-0 opacity-60"
                  aria-hidden="true"
                />
              )}
              {nombre}
            </span>
          ))}
          <span
            className="flex items-center gap-1.5 tracking-wider opacity-70"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
          >
            <Tag className="size-3.5 shrink-0" aria-hidden="true" />
            {versionParaMostrar()}
          </span>
        </div>

        {/* Sobre que esta construido. Va debajo de los creditos y no encima:
            primero quien lo hizo, despues con que metodo. */}
        <SelloMetodologia compacto className="mt-1" />
      </div>
    </footer>
  );
}
