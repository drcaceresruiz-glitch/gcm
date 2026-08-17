"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Check,
  ChevronRight,
  Minimize2,
} from "lucide-react";
import {
  MODULOS,
  guardarTablero,
  type ModuloTablero,
} from "@/lib/tablero";
import type { DatosTablero } from "@/services/tablero.service";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";
import { ModuloContenido, moduloConDatos } from "@/components/tablero/modulos";

/**
 * El tablero de supervision de UNA obra: sus indicadores juntos, del avance
 * al presupuesto.
 *
 * Vivio en el panel hasta el 17 de agosto de 2026, con un desplegable para
 * elegir que obra se miraba. Ahora es una pantalla de la obra y la obra sale
 * de la ruta, que es lo que siempre describieron sus once modulos: todos
 * hablan de una sola obra, ninguno de la empresa.
 *
 * De aquella version quedan dos cosas y se conservan porque siguen valiendo:
 *   - QUE modulos se ven, en cookie, para que el servidor pinte el tablero ya
 *     configurado sin parpadeo. APAGAR uno es instantaneo: solo se oculta.
 *     ENCENDER uno que estaba apagado si va al servidor, porque desde el 10 de
 *     agosto de 2026 el tablero carga unicamente los datos de los modulos
 *     encendidos: traerlos todos, con once modulos, tumbo produccion. Lo paga
 *     quien enciende, una vez, en vez de cobrarselo a todos en cada carga.
 *   - Que las cifras salgan de las MISMAS funciones que las pantallas de
 *     detalle, para que el tablero no diga un numero distinto del sitio al que
 *     enlaza.
 *
 * Lo que se fue con la mudanza: el desplegable de obra, el bloque de avisos
 * —eran de TODA la empresa a proposito, y eso se contradice dentro de una
 * obra; el panel los sigue dando en la bienvenida— y el plegado, cuyo motivo
 * era no tapar la lista de obras del panel. Aqui no hay lista que tapar: la
 * pantalla ES el tablero.
 */
export function Tablero({
  datos,
  modulosIniciales,
}: {
  datos: DatosTablero;
  modulosIniciales: ModuloTablero[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  // La seleccion de modulos SI vive en estado de cliente: es la unica
  // preferencia que se aplica sin volver al servidor. Se arranca con lo que
  // el servidor leyo de la cookie, asi que ya llega bien pintado.
  const [visibles, setVisibles] = useState<Set<ModuloTablero>>(
    () => new Set(modulosIniciales),
  );
  const [configurando, setConfigurando] = useState(false);

  /// Modulo abierto en grande, o null. Uno cada vez.
  const [ampliado, setAmpliado] = useState<ModuloTablero | null>(null);

  const hayCronograma = datos.cronograma != null;

  // Un modulo que necesita cronograma no se pinta si la obra no tiene: en su
  // sitio quedaria un hueco que parece un error. Se filtra aqui y no en el
  // estado para que, al cargar un cronograma, el modulo reaparezca solo.
  //
  // Y lo mismo con los datos: `requiereCronograma` no bastaba. Sin permiso de
  // ordenes, o con un modulo cuyos datos no vienen, se pintaba la caja VACIA
  // —borde y nada dentro—, que no se lee como "no hay datos" sino como "esto
  // se ha roto".
  const aPintar = useMemo(
    () =>
      MODULOS.filter(
        (m) =>
          visibles.has(m.clave) &&
          (!m.requiereCronograma || hayCronograma) &&
          moduloConDatos(m.clave, datos),
      ),
    [visibles, hayCronograma, datos],
  );

  function alternar(clave: ModuloTablero) {
    const encendiendo = !visibles.has(clave);
    const copia = new Set(visibles);
    if (encendiendo) copia.add(clave);
    else copia.delete(clave);

    setVisibles(copia);
    guardarTablero([...copia]);

    // Si se enciende un modulo cuyos datos no vinieron, hay que pedirlos: sin
    // esto el modulo no apareceria —`moduloConDatos` lo filtra— y encenderlo
    // no haria nada visible, que es la peor respuesta posible a un clic.
    // `refresh` reaprovecha la cookie que se acaba de guardar y solo repinta
    // la parte de servidor, sin perder el resto del estado de la pantalla.
    if (encendiendo && !moduloConDatos(clave, datos)) {
      iniciar(() => router.refresh());
    }
  }

  // Escape cierra el modulo ampliado. Es lo que espera cualquiera que abra
  // algo que tapa la pantalla, y evita quedarse atrapado si el boton de
  // cerrar queda fuera de vista en un movil.
  useEffect(() => {
    if (!ampliado) return;

    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAmpliado(null);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [ampliado]);

  return (
    <section
      className="rounded-2xl border-2 p-4 sm:p-5"
      style={{
        // Borde grueso y tintado de marca, sombra fuerte y un lavado de fondo
        // distinto del blanco de las tarjetas internas: asi el cajon se
        // despega del fondo de la pagina y las tarjetas se despegan del cajon.
        // Tres alturas, no dos apiladas del mismo color.
        borderColor: "color-mix(in oklab, var(--color-marca-500) 40%, var(--borde))",
        backgroundColor:
          "color-mix(in oklab, var(--color-marca-500) 6%, var(--superficie))",
        boxShadow: "var(--sombra-3)",
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor:
                "color-mix(in oklab, var(--color-marca-500) 16%, transparent)",
            }}
          >
            <LayoutDashboard
              className="size-4"
              style={{ color: "var(--color-marca-600)" }}
              aria-hidden="true"
            />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Tablero de supervisión</h2>
            <p className="text-xs opacity-60">
              Los indicadores de esta obra, de un vistazo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfigurando((p) => !p)}
            aria-expanded={configurando}
            aria-label="Configurar módulos del tablero"
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{
              borderColor: configurando
                ? "var(--color-marca-600)"
                : "var(--borde)",
            }}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Configurar</span>
          </button>
        </div>
      </header>

      {configurando && (
        <Configurador
          visibles={visibles}
          hayCronograma={hayCronograma}
          onAlternar={alternar}
        />
      )}

      {/* Aqui iba el nombre de la obra y su estado. Se fueron con la mudanza:
          la cabecera de la pantalla de obra ya los lleva, y el enlace «a la
          obra» apuntaba a la pagina en la que ya estas. En el panel hacian
          falta porque el tablero flotaba sobre una lista de obras. */}
      {aPintar.length === 0 ? (
        <p
          className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm opacity-60"
          style={{ borderColor: "var(--borde)" }}
        >
          No hay ningún módulo encendido. Pulsa «Configurar» para elegir cuáles
          ver.
        </p>
      ) : (
            // Sin `auto-rows-fr`: las cajas ya miden TODAS lo mismo (la
            // altura fija vive en la Caja), asi que estirar filas solo
            // serviria para que un modulo largo desalineara el resto, que es
            // justo lo que pasaba con «Que falta».
            <div
              className={`mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${
                pendiente ? "opacity-50 transition-opacity" : ""
              }`}
            >
              {aPintar.map((m) => (
                <div
                  key={m.clave}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ampliar ${m.etiqueta}`}
                  onClick={() => setAmpliado(m.clave)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setAmpliado(m.clave);
                    }
                  }}
                  // El enlace del pie sigue navegando: su clic no debe
                  // ampliar. Se corta aqui, en la captura, y no en cada
                  // modulo, que son once y bastaria olvidar uno.
                  onClickCapture={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) {
                      e.stopPropagation();
                    }
                  }}
                  className="cursor-pointer rounded-xl transition-transform hover:-translate-y-0.5"
                >
                  <ModuloContenido modulo={m} datos={datos} />
                </div>
              ))}
        </div>
      )}

      {ampliado && (
        <ModuloAmpliado
          clave={ampliado}
          datos={datos}
          onCerrar={() => setAmpliado(null)}
        />
      )}
    </section>
  );
}

/**
 * Un modulo a pantalla casi completa, encima de todo.
 *
 * Para mirar UNA cifra con calma: en la rejilla cada modulo vive en un cuarto
 * de ancho, y ahi las curvas y las listas se aprietan. Aqui tiene sitio.
 *
 * Se cierra por tres caminos —el boton de la esquina, tocar fuera y Escape—
 * porque es lo que la gente prueba, en ese orden, y quedarse encerrado en una
 * capa que tapa la pantalla es de las cosas que mas enfadan.
 */
function ModuloAmpliado({
  clave,
  datos,
  onCerrar,
}: {
  clave: ModuloTablero;
  datos: DatosTablero;
  onCerrar: () => void;
}) {
  const modulo = MODULOS.find((m) => m.clave === clave);
  if (!modulo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "color-mix(in oklab, black 55%, transparent)" }}
      onClick={onCerrar}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modulo.etiqueta}
        // Se para la propagacion: tocar DENTRO no puede cerrar, o seria
        // imposible usar nada de lo que hay dentro.
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-2 shadow-2xl"
        style={{
          borderColor:
            "color-mix(in oklab, var(--color-marca-500) 40%, var(--borde))",
          backgroundColor:
            "color-mix(in oklab, var(--color-marca-500) 6%, var(--superficie))",
        }}
      >
        <header
          className="flex items-start justify-between gap-3 border-b p-4"
          style={{ borderColor: "var(--borde)" }}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{modulo.etiqueta}</h3>
            {/* La nota del modulo solo cabe aqui: en la rejilla se omite por
                falta de sitio, y es justo lo que explica que significa la
                cifra que se esta mirando. */}
            <p className="mt-0.5 text-xs opacity-70">{modulo.nota}</p>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            <Minimize2 className="size-3.5" aria-hidden="true" />
            Volver al tablero
          </button>
        </header>

        <div className="overflow-y-auto p-4">
          {/* `ampliado`: sin altura fija ni cabecera repetida, que este marco
              ya pone el titulo y la nota arriba. */}
          <ModuloContenido modulo={modulo} datos={datos} ampliado />
        </div>
      </div>
    </div>
  );
}

/**
 * El configurador: una casilla por modulo.
 *
 * Los que necesitan cronograma se deshabilitan —no se ocultan— cuando la obra
 * no tiene uno: asi se ve que existen y por que no estan, en vez de que el
 * tablero cambie de opciones segun la obra.
 */
function Configurador({
  visibles,
  hayCronograma,
  onAlternar,
}: {
  visibles: Set<ModuloTablero>;
  hayCronograma: boolean;
  onAlternar: (clave: ModuloTablero) => void;
}) {
  return (
    <div
      className="mt-3 grid gap-1.5 rounded-xl border p-3 sm:grid-cols-2 xl:grid-cols-4"
      style={{
        borderColor: "var(--borde)",
        backgroundColor: "var(--fondo)",
      }}
    >
      {MODULOS.map((m) => {
        const activo = visibles.has(m.clave);
        const bloqueado = m.requiereCronograma && !hayCronograma;

        return (
          <button
            key={m.clave}
            type="button"
            disabled={bloqueado}
            onClick={() => onAlternar(m.clave)}
            aria-pressed={activo}
            className="flex items-start gap-2 rounded-lg border p-2 text-left disabled:opacity-45"
            style={{
              borderColor:
                activo && !bloqueado
                  ? "var(--color-marca-600)"
                  : "var(--borde)",
              backgroundColor:
                activo && !bloqueado
                  ? "color-mix(in oklab, var(--color-marca-500) 10%, transparent)"
                  : "transparent",
            }}
          >
            <span
              className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border"
              style={{
                borderColor: activo
                  ? "var(--color-marca-600)"
                  : "var(--borde)",
                backgroundColor: activo
                  ? "var(--color-marca-600)"
                  : "transparent",
              }}
            >
              {activo && (
                <Check className="size-3 text-white" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium">{m.etiqueta}</span>
              <span className="block text-xs opacity-60">
                {bloqueado ? "Necesita cronograma cargado" : m.nota}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * El pie de cada modulo: el enlace a la pantalla con el detalle.
 *
 * El modulo da la lectura de un vistazo; el enlace lleva a «mayor exposicion y
 * procesamiento», que es donde se actua. Vive aparte para que todos los
 * modulos lo pinten igual.
 */
export function EnlaceModulo({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  // `mt-auto` en el envoltorio y no en el boton: asi el pie queda pegado abajo
  // y los ocho modulos alinean su enlace aunque tengan distinto alto.
  return (
    <div className="mt-auto pt-3">
      <EnlaceBoton href={href} icono={ChevronRight} tamano="sm">
        {children}
      </EnlaceBoton>
    </div>
  );
}
