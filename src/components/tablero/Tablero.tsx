"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Minimize2,
} from "lucide-react";
import {
  MODULOS,
  guardarTablero,
  type ModuloTablero,
} from "@/lib/tablero";
import type { DatosTablero, ObraDelSelector } from "@/services/tablero.service";
import type { AlertaEmpresa } from "@/services/obras.service";
import { AlertasEmpresa } from "@/components/obras/AlertasEmpresa";
import {
  ETIQUETA_ESTADO_OBRA,
  TONO_ESTADO_OBRA,
  type EstadoObra,
} from "@/lib/obras";
import { Chip } from "@/components/ui/Chip";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";
import { ModuloContenido, moduloConDatos } from "@/components/tablero/modulos";

/**
 * El tablero de supervision, a todo lo ancho encima de las obras.
 *
 * Es lo primero que se mira: una obra elegida y sus indicadores juntos, del
 * avance al presupuesto. Debajo, la rejilla de tarjetas sigue siendo la
 * lista; esto es el foco.
 *
 * Dos preferencias mandan, y viven en cookie para que el servidor pinte el
 * tablero ya configurado sin parpadeo:
 *   - QUE obra se supervisa. Cambiarla es traer cifras nuevas, asi que navega
 *     —el servidor recalcula—.
 *   - QUE modulos se ven. APAGAR uno es instantaneo: solo se oculta. ENCENDER
 *     uno que estaba apagado si va al servidor, porque desde el 10 de agosto
 *     de 2026 el tablero carga unicamente los datos de los modulos
 *     encendidos: traerlos todos, con once modulos, tumbo produccion. Lo paga
 *     quien enciende, una vez, en vez de cobrarselo a todos en cada carga.
 *
 * Los avisos son la excepcion: NO se filtran por la obra elegida. Son los de
 * la empresa entera, porque el problema que hay que ver es justo el de la obra
 * que no estas mirando.
 */
export function Tablero({
  obras,
  datos,
  modulosIniciales,
  alertas,
}: {
  obras: ObraDelSelector[];
  /// La obra seleccionada, ya resuelta por el servidor. Null si la empresa no
  /// tiene ninguna obra todavia.
  datos: DatosTablero | null;
  modulosIniciales: ModuloTablero[];
  alertas: AlertaEmpresa[];
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

  /**
   * El tablero arranca CERRADO, siempre.
   *
   * No se recuerda en cookie a proposito: lo pedido es que cada visita empiece
   * plegada. El panel es la lista de obras; el tablero es una herramienta que
   * se abre cuando se va a supervisar, no un muro de once tarjetas que hay
   * que pasar cada vez para llegar a lo demas.
   *
   * Esto NO cambia lo que se carga: el servidor sigue trayendo solo los datos
   * de los modulos encendidos. Plegar es visual; el ahorro de verdad lo hace
   * el configurador.
   */
  const [desplegado, setDesplegado] = useState(false);

  /// Modulo abierto en grande, o null. Uno cada vez.
  const [ampliado, setAmpliado] = useState<ModuloTablero | null>(null);

  const hayCronograma = datos?.cronograma != null;

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
          (datos === null || moduloConDatos(m.clave, datos)),
      ),
    [visibles, hayCronograma, datos],
  );

  function alternar(clave: ModuloTablero) {
    const encendiendo = !visibles.has(clave);
    const copia = new Set(visibles);
    if (encendiendo) copia.add(clave);
    else copia.delete(clave);

    setVisibles(copia);
    guardarTablero([...copia], datos?.obra.id);

    // Si se enciende un modulo cuyos datos no vinieron, hay que pedirlos: sin
    // esto el modulo no apareceria —`moduloConDatos` lo filtra— y encenderlo
    // no haria nada visible, que es la peor respuesta posible a un clic.
    // `refresh` reaprovecha la cookie que se acaba de guardar y solo repinta
    // la parte de servidor, sin perder el resto del estado de la pantalla.
    if (encendiendo && datos !== null && !moduloConDatos(clave, datos)) {
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

  function elegirObra(obraId: string) {
    // Navega en vez de mutar estado: son cifras nuevas y las calcula el
    // servidor. La cookie se guarda para recordar la eleccion en la proxima
    // visita, aunque no se pase por la URL.
    guardarTablero([...visibles], obraId);
    iniciar(() => router.push(`?obra=${obraId}`));
  }

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
              Los indicadores de la obra que elijas, de un vistazo.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Los avisos son de TODAS las obras, no de la elegida. Mismo popup
              que la tarjeta de Saldo, con enlace a la obra que corresponde. */}
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs"
            style={{ borderColor: "var(--borde)" }}
          >
            <span className="opacity-60">Avisos</span>
            <AlertasEmpresa alertas={alertas} />
          </span>

          {desplegado && obras.length > 0 && datos && (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Obra a supervisar</span>
              <select
                value={datos.obra.id}
                disabled={pendiente}
                onChange={(e) => elegirObra(e.target.value)}
                className="max-w-52 truncate rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                style={{
                  borderColor: "var(--borde)",
                  backgroundColor: "var(--fondo)",
                }}
              >
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.correlativo ? `${o.correlativo} · ` : ""}
                    {o.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          {desplegado && (
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
          )}

          {/* El interruptor. Dice lo que va a pasar («Desplegar» / «Plegar»),
              no el estado en que esta: un boton que se llama como su estado
              se lee al reves la mitad de las veces. */}
          <button
            type="button"
            onClick={() => {
              setDesplegado((p) => !p);
              setConfigurando(false);
              setAmpliado(null);
            }}
            aria-expanded={desplegado}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            {desplegado ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
            {desplegado ? "Plegar" : "Desplegar"}
          </button>
        </div>
      </header>

      {/* Plegado: una linea que dice QUE obra se supervisaria al abrir. Sin
          esto, el cajon cerrado no dice nada y hay que abrirlo para saber si
          interesa. */}
      {!desplegado && datos && (
        <p className="mt-3 truncate text-xs opacity-60">
          {datos.obra.nombre}
        </p>
      )}

      {desplegado && configurando && (
        <Configurador
          visibles={visibles}
          hayCronograma={hayCronograma}
          onAlternar={alternar}
        />
      )}

      {desplegado && datos ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <Chip tono={TONO_ESTADO_OBRA[datos.obra.estado as EstadoObra]}>
              {ETIQUETA_ESTADO_OBRA[datos.obra.estado as EstadoObra] ??
                datos.obra.estado}
            </Chip>
            <Link
              href={`/obras/${datos.obra.id}`}
              className="truncate text-sm font-semibold hover:underline"
            >
              {datos.obra.nombre}
            </Link>
          </div>

          {aPintar.length === 0 ? (
            <p
              className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm opacity-60"
              style={{ borderColor: "var(--borde)" }}
            >
              No hay ningún módulo encendido. Pulsa «Configurar» para elegir
              cuáles ver.
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
        </>
      ) : desplegado ? (
        <p
          className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm opacity-60"
          style={{ borderColor: "var(--borde)" }}
        >
          Crea una obra para empezar a supervisarla desde aquí.
        </p>
      ) : null}

      {ampliado && datos && (
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
