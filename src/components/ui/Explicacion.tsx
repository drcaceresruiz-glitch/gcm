import { CircleHelp, TriangleAlert } from "lucide-react";

/**
 * Explicacion plegable de un concepto o una accion delicada.
 *
 * Nace de una pregunta del usuario despues de semanas con la palabra
 * "congelar" en pantalla: que significa, para que sirve y que hace falta antes.
 * El sistema esta lleno de decisiones asi —congelar una linea base, cerrar la
 * semana, aprobar un adicional, elegir suma alzada frente a precios
 * unitarios— que cambian dinero, plazo o responsabilidad, y ninguna se explica
 * DONDE se toma. La ayuda que existe (`PanelAyuda`) acompana a los formularios
 * de alta; esta va pegada al boton.
 *
 * SOBRE `<details>` NATIVO, no un desplegable de React. Es deliberado:
 *
 *   - Abre SIN JavaScript y SIN hidratacion. El 10 de agosto de 2026 hubo
 *     paginas enteras congeladas esperando a que React revelara contenido; una
 *     ayuda que dependa del cliente para abrirse es lo ultimo que queremos
 *     justo cuando algo va mal.
 *   - Es accesible por teclado y anunciable por lector de pantalla de serie,
 *     sin una sola propiedad ARIA escrita a mano.
 *
 * La estructura es SIEMPRE la misma —que es, para que, requisitos,
 * consecuencias— para que se aprenda a leer una vez y sirva para todas.
 */

export interface TextoExplicacion {
  /// El titulo del desplegable. Se escribe como la duda que resuelve:
  /// "¿Que significa congelar?", no "Informacion sobre la linea base".
  titulo: string;
  /// Una frase, en lenguaje de obra. Sin jerga y sin remitir a otro sitio.
  queEs: string;
  /// Por que existe: que pregunta contesta o que problema evita. Es lo que
  /// convierte una instruccion en algo que se entiende.
  paraQue: string;
  /// Que tiene que estar hecho ANTES. Vacio si no hay ninguno.
  requisitos?: string[];
  /// Que cambia despues, y que se rompe si se hace a destiempo.
  consecuencias?: string[];
  /// Si se puede deshacer. `false` pinta el aviso de irreversible: es la
  /// diferencia entre una decision y un error permanente.
  reversible: boolean;
  /// Como se deshace, cuando `reversible` es true y no es evidente.
  comoSeDeshace?: string;
}

export function Explicacion({ texto }: { texto: TextoExplicacion }) {
  return (
    <details
      className="rounded-lg border print:hidden"
      style={{
        borderColor: "var(--borde)",
        backgroundColor:
          "color-mix(in oklab, var(--color-marca-500) 5%, var(--superficie))",
      }}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
        <CircleHelp
          className="size-4 shrink-0"
          style={{ color: "var(--color-marca-600)" }}
          aria-hidden="true"
        />
        {texto.titulo}
      </summary>

      <div
        className="space-y-3 border-t px-3 py-3 text-sm"
        style={{ borderColor: "var(--borde)" }}
      >
        <p className="text-pretty">{texto.queEs}</p>

        <Bloque titulo="Para qué sirve">
          <p className="text-pretty opacity-80">{texto.paraQue}</p>
        </Bloque>

        {texto.requisitos && texto.requisitos.length > 0 && (
          <Bloque titulo="Antes hace falta">
            <Lista puntos={texto.requisitos} />
          </Bloque>
        )}

        {texto.consecuencias && texto.consecuencias.length > 0 && (
          <Bloque titulo="Qué pasa después">
            <Lista puntos={texto.consecuencias} />
          </Bloque>
        )}

        {texto.reversible ? (
          texto.comoSeDeshace && (
            <Bloque titulo="Si te equivocas">
              <p className="text-pretty opacity-80">{texto.comoSeDeshace}</p>
            </Bloque>
          )
        ) : (
          // El unico bloque con color: lo irreversible tiene que verse distinto
          // de lo que solo es informacion.
          <p
            className="flex items-start gap-2 rounded-lg px-3 py-2 text-pretty"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
            }}
          >
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              <strong>Esto no se puede deshacer.</strong>{" "}
              {texto.comoSeDeshace ??
                "Comprueba los requisitos antes de continuar."}
            </span>
          </p>
        )}
      </div>
    </details>
  );
}

function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide uppercase opacity-50">
        {titulo}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Lista({ puntos }: { puntos: string[] }) {
  return (
    <ul className="space-y-1">
      {puntos.map((p) => (
        <li key={p} className="flex items-start gap-2 text-pretty opacity-80">
          <span
            aria-hidden="true"
            className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}
