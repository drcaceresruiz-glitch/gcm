"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  SlidersHorizontal,
  Check,
  ChevronRight,
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

          {obras.length > 0 && datos && (
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

      {datos ? (
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
            <div
              className={`mt-4 grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4 ${
                pendiente ? "opacity-50 transition-opacity" : ""
              }`}
            >
              {aPintar.map((m) => (
                <ModuloContenido key={m.clave} modulo={m} datos={datos} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p
          className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm opacity-60"
          style={{ borderColor: "var(--borde)" }}
        >
          Crea una obra para empezar a supervisarla desde aquí.
        </p>
      )}
    </section>
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
