import { AlertTriangle, Building2, HandCoins, Wallet } from "lucide-react";
import type { AlertaEmpresa, ResumenEmpresa } from "@/services/obras.service";
import { soles } from "@/utils/formato";
import { CifraAnimada } from "@/components/obras/CifraAnimada";
import { AlertasEmpresa } from "@/components/obras/AlertasEmpresa";

/**
 * Las cifras de la empresa encabezando el panel: obras contadas todas, el
 * dinero SOLO de la que esta en ejecucion —y SOLO si es una sola—.
 *
 * Sumar la cartera completa mezclaba planificacion, ejecucion y cerradas en
 * un numero contra el que nadie decide nada; lo que se necesita a primera
 * vista es la exposicion de hoy. Cada etiqueta dice su ambito, porque una
 * cifra acotada que no declara el corte parece simplemente equivocada.
 *
 * Con MAS de una obra en ejecucion, Presupuesto/Comprometido/Saldo se
 * OCULTAN en vez de sumarse: una mezcla de varias obras en tres numeros no
 * dice a cual corresponde nada, y no hay decision que tomar contra un total
 * que no es de ninguna obra en particular. El dinero de cada una sigue
 * visible, uno por uno, en su propia tarjeta de la lista de abajo.
 *
 * "Obras" y el dinero NO van en la misma rejilla, a proposito. Las cuatro
 * tarjetas en fila pareja hacian leer las tres de dinero como si fueran del
 * mismo "5" de la primera: la jerarquia visual decia "mismo ambito" aunque
 * el texto dijera lo contrario. "Obras" queda sola, de cartera; el dinero
 * va aparte, dentro de una caja con su propio titulo —"La obra en
 * ejecución"—, que ya no necesita nombrar la obra: al mostrarse solo cuando
 * hay exactamente una, decirlo asi es exacto y no una aproximacion.
 *
 * El presupuesto va SIN IGV, que es la cifra de control. El comprometido va
 * por el importe IMPUTABLE de cada orden —neto con IGV, total con retencion—,
 * que no es lo mismo: decir «todo sin IGV» describia mal justo la columna que
 * se compara contra el presupuesto.
 */
export function ResumenEmpresaPanel({
  resumen,
  alertas,
}: {
  resumen: ResumenEmpresa;
  /// El detalle de las alertas: DE QUE obra es cada una. El popup de la
  /// tarjeta de Saldo enlaza a la obra directamente en vez de dejar solo el
  /// numero, que no llevaba a ningun sitio.
  alertas: AlertaEmpresa[];
}) {
  const saldoNegativo = resumen.saldo.trimStart().startsWith("-");

  /**
   * Presupuesto, Comprometido y Saldo son la SUMA de todas las obras en
   * ejecucion, no de una sola. Con una sola obra en ejecucion la suma y esa
   * obra son la misma cifra, y ahi tiene sentido mostrarlas. Con varias, un
   * usuario las vio en vivo y no encontro a que obra correspondian: un
   * resumen de varias obras mezcladas en tres numeros no dice nada que se
   * pueda accionar. El dinero de CADA obra ya esta, uno por uno, en su
   * propia tarjeta de la lista de abajo -eso no cambia-, asi que aqui se
   * quitan en vez de explicarlas con texto.
   */
  const unaSolaEnEjecucion = resumen.obrasEnEjecucion <= 1;

  return (
    // `relative z-20`: crea un contexto de apilamiento para TODO el panel de
    // cifras, por encima de la fila de filtros que viene despues en el DOM.
    // Sin esto, el popup de alertas -que se abre hacia abajo- quedaba por
    // detras del buscador y el select de estado, que se pintan despues.
    <div className="relative z-20 space-y-3">
      {/* Sola, no en la misma rejilla que el dinero: es la unica cifra de
          aqui que de verdad describe toda la cartera. */}
      <dl className="max-w-[15rem]">
        <Cifra
          icono={Building2}
          etiqueta="Obras"
          valor={String(resumen.obras)}
          numero={resumen.obras}
          acento="var(--color-marca-500)"
          detalle={
            resumen.obrasEnEjecucion === 1
              ? "1 en ejecución"
              : `${resumen.obrasEnEjecucion} en ejecución`
          }
        />
      </dl>

      {unaSolaEnEjecucion && (
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--borde)" }}
        >
          <p className="mb-2 px-1 text-xs font-medium opacity-60">
            La obra en ejecución
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            <Cifra
              icono={Wallet}
              etiqueta="Presupuesto"
              valor={soles(resumen.presupuestoTotal)}
              numero={Number(resumen.presupuestoTotal)}
              moneda
              acento="var(--color-exito)"
              detalle="Sin IGV"
            />

            <Cifra
              icono={HandCoins}
              etiqueta="Comprometido"
              valor={soles(resumen.comprometido)}
              numero={Number(resumen.comprometido)}
              moneda
              acento="var(--color-alerta)"
              detalle="Encargos vigentes + órdenes sueltas"
            />

            <Cifra
              icono={AlertTriangle}
              etiqueta="Saldo"
              valor={soles(resumen.saldo)}
              numero={Math.abs(Number(resumen.saldo))}
              moneda
              // En negativo se ha comprometido mas de lo presupuestado, y eso no
              // puede leerse igual que un saldo holgado: el degradado tambien lo
              // dice, no solo el numero.
              tono={saldoNegativo ? "peligro" : undefined}
              acento={saldoNegativo ? "var(--color-peligro)" : "var(--color-exito)"}
              detalle={<AlertasEmpresa alertas={alertas} />}
              detalleTono={alertas.length > 0 ? "peligro" : undefined}
            />
          </dl>
        </div>
      )}
    </div>
  );
}

function Cifra({
  icono: Icono,
  etiqueta,
  valor,
  numero,
  moneda,
  acento,
  detalle,
  tono,
  detalleTono,
}: {
  icono: typeof Building2;
  etiqueta: string;
  valor: string;
  numero: number;
  moneda?: boolean;
  /// El color que tine el degradado de fondo. Cada tarjeta el suyo, para que
  /// se distingan entre si a un vistazo y no solo por el texto.
  acento: string;
  /// String en tres tarjetas; en Saldo es el popup de `AlertasEmpresa`, que
  /// tambien es valido aqui porque un string es un ReactNode como cualquiera.
  detalle: React.ReactNode;
  tono?: "peligro";
  detalleTono?: "peligro";
}) {
  const color = tono === "peligro" ? "var(--color-peligro)" : undefined;

  return (
    <div
      className="elevacion-1 rounded-xl border p-4"
      style={{
        borderColor: "var(--borde)",
        // Un lavado diagonal, no un fondo saturado: el texto sigue siendo
        // oscuro sobre un fondo que sigue siendo casi blanco, asi que las
        // cifras de dinero no pierden legibilidad por darle color a la
        // tarjeta. El acento se mezcla con la SUPERFICIE y no con blanco a
        // secas, para que tambien funcione en modo oscuro.
        backgroundImage: `linear-gradient(135deg, color-mix(in oklab, ${acento} 20%, var(--superficie)) 0%, var(--superficie) 65%)`,
      }}
    >
      <dt className="flex items-center gap-1.5 text-xs opacity-70">
        <Icono
          className="size-3.5 shrink-0"
          style={{ color: color ?? "var(--color-marca-500)" }}
          aria-hidden="true"
        />
        {etiqueta}
      </dt>

      <dd
        className="mt-1 text-xl font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        <CifraAnimada hasta={numero} texto={valor} moneda={moneda} />
      </dd>

      {/* `div` y no `p`: el detalle de Saldo es el popup de `AlertasEmpresa`,
          que abre un `div` absolutamente posicionado, y un `div` dentro de un
          `p` es HTML invalido -React avisa por consola de eso mismo-. */}
      <div
        className="mt-0.5 text-xs opacity-70"
        style={
          detalleTono === "peligro" ? { color: "var(--color-peligro)" } : undefined
        }
      >
        {detalle}
      </div>
    </div>
  );
}
