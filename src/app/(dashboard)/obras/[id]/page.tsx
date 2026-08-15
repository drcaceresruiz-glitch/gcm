import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Lock } from "lucide-react";
import { obtenerSesion } from "@/services/sesion.service";
import { obtenerObra, listarPartidas } from "@/services/obras.service";
import { puede } from "@/lib/rbac";
import { soles } from "@/utils/formato";
import { Explicacion } from "@/components/ui/Explicacion";
import { CONGELAR_PRESUPUESTO, MODALIDAD_PARTIDA } from "@/lib/explicaciones";
import { TablaPartidas } from "@/components/partidas/TablaPartidas";
import { NuevaFila } from "@/components/partidas/NuevaFila";
import { Mascota } from "@/components/ui/Mascota";
import { PanelAyuda, type PuntoAyuda } from "@/components/ui/PanelAyuda";

export const metadata: Metadata = { title: "Presupuesto de la obra" };

/**
 * Lo que hay que saber ANTES de teclear la primera fila.
 *
 * El texto no se inventa aqui: es el mismo que explica la plantilla de Excel
 * (`lib/plantilla-presupuesto.ts`), resumido. Si un dia divergen, el usuario
 * que empezo por Excel y el que empezo tecleando habran aprendido dos reglas
 * distintas para la misma cosa.
 */
const PRIMEROS_PASOS: PuntoAyuda[] = [
  {
    titulo: "Primero los capítulos, luego lo que cuelga",
    texto:
      "Un código terminado en .0 —1.0, 2.0— o sin punto agrupa y no lleva cifras. Los demás (1.1, 2.3, 01.02.01) son partidas y sí llevan importe.",
  },
  {
    titulo: "El importe del capítulo no se escribe",
    texto:
      "Lo calcula el sistema sumando sus partidas. Si le pusieras importe propio, el suyo taparía el de sus hijas y el presupuesto perdería dinero sin avisar.",
  },
  {
    titulo: "Puedes dejar los precios para después",
    texto:
      "Teclea las descripciones ahora y pulsa luego cualquier celda para rellenar metrado y precio. Elige «Partida» aunque no tengas las cifras todavía: lo que decide es lo que marcas, no lo que dejas en blanco.",
  },
  {
    titulo: "Nada de esto es definitivo",
    texto:
      "El presupuesto se edita libremente hasta que lo congelas en Revisiones. A partir de ahí, los cambios entran como adicionales.",
  },
];

/**
 * La portada de la obra: su presupuesto por partidas.
 *
 * El nombre, las fechas y los enlaces a las demas secciones ya no estan
 * aqui: viven en `layout.tsx`, que los pinta en todas las subrutas.
 */
export default async function ObraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ importadas?: string }>;
}) {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const { id } = await params;
  const obra = await obtenerObra(sesion, id);
  if (!obra) notFound();

  const { filas, totalPartidas, montoTotal } = await listarPartidas(sesion, id);
  const { importadas } = await searchParams;
  const puedeImportar = puede(sesion, "partida:importar");
  const puedeCrear = puede(sesion, "partida:crear");

  /**
   * Que codigo proponer para la fila siguiente.
   *
   * Se propone el capitulo raiz que toca —si la ultima raiz es la 3.0, se
   * ofrece 4.0—, que es lo que se teclea al arrancar. No se intenta adivinar
   * la subpartida siguiente: acertar exigiria saber si quien escribe va a
   * seguir dentro del capitulo o a abrir otro, y una propuesta equivocada
   * cuesta mas de corregir que un campo vacio.
   */
  const raices = filas
    .map((f) => Number.parseInt(f.codigoPartida.split(".")[0] ?? "", 10))
    .filter((n) => Number.isFinite(n));
  const siguienteCodigo = `${(raices.length ? Math.max(...raices) : 0) + 1}.0`;

  /**
   * Los capitulos que se pueden elegir como padre, con su sangria.
   *
   * Mismo criterio que el desplegable de los movimientos: el nivel de raiz se
   * toma del MENOR que aparezca y no se da por supuesto un 0, porque un
   * presupuesto importado puede empezar en cualquiera.
   */
  const nivelesCapitulo = filas
    .filter((f) => f.tipo === "CAPITULO")
    .map((f) => f.nivel);
  const nivelRaiz = nivelesCapitulo.length > 0 ? Math.min(...nivelesCapitulo) : 0;

  const capitulos = filas
    .filter((f) => f.tipo === "CAPITULO")
    .map((f) => ({
      id: f.id,
      codigo: f.codigoPartida,
      etiqueta: `${f.codigoPartida} ${f.descripcion}`,
      sangria: f.nivel - nivelRaiz,
    }));

  // Los codigos ya usados: con ellos la pantalla propone el siguiente hueco
  // libre dentro del capitulo elegido, sin tener que preguntar al servidor.
  const codigosUsados = filas.map((f) => f.codigoPartida);

  return (
    <div className="space-y-6">
      {puedeImportar && obra.lineaBaseVersion === null && (
        <div className="flex justify-end">
          <Link
            href={`/obras/${id}/importar`}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-marca-600)" }}
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Importar desde Excel
          </Link>
        </div>
      )}

      {importadas && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-exito) 15%, transparent)",
          }}
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          Presupuesto cargado: {importadas} partidas.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* No es «el presupuesto»: es la suma de las partidas, antes de
            gastos generales y utilidad. El presupuesto de control sale de
            la cascada y vive en la pantalla de revisiones. Llamar
            «Presupuesto» a las dos cifras invita a citar la que no es. */}
        <Tarjeta etiqueta="Subtotal de partidas" valor={soles(montoTotal)} destacado />
        <Tarjeta etiqueta="Partidas" valor={String(totalPartidas)} />
        <Tarjeta
          etiqueta="Línea base"
          valor={
            obra.lineaBaseVersion !== null
              ? `v${obra.lineaBaseVersion} congelada`
              : "Sin congelar"
          }
        />
      </dl>

      {obra.lineaBaseVersion !== null && (
        <p className="flex items-center gap-2 text-sm opacity-70">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          El presupuesto contractual está congelado. Los cambios se registran
          como adicionales.
        </p>
      )}

      {/* La tarjeta de arriba dice "Sin congelar" sin explicar que es congelar
          ni por que importa. La explicacion va aqui, donde se lee esa palabra,
          y no en otra pantalla. */}
      <Explicacion texto={CONGELAR_PRESUPUESTO} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Presupuesto por partidas</h2>

        {filas.length === 0 ? (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div
              className="rounded-xl border border-dashed p-10 text-center"
              style={{ borderColor: "var(--borde)" }}
            >
              <div className="flex justify-center">
                <Mascota pose="trabajando" alto={170} flotar />
              </div>
              <p className="mt-3 text-sm opacity-70">
                Esta obra aún no tiene partidas. Hay dos caminos, y ninguno
                excluye al otro: cargar el Excel que ya tengas, o empezar a
                teclearlo aquí.
              </p>

              <div className="mt-5 flex flex-col items-center gap-3">
                {puedeImportar && (
                  <Link
                    href={`/obras/${id}/importar`}
                    className="inline-flex items-center gap-2 text-sm font-medium underline"
                  >
                    Cargar el presupuesto desde Excel
                  </Link>
                )}
                {/* La segunda salida, que hasta ahora no existia: el servicio
                    de alta estaba escrito y no habia forma de llamarlo. */}
                {/* Sin partidas todavia no hay capitulos que elegir: lo
                    primero que se teclea es el 1.0. */}
                {puedeCrear && (
                  <NuevaFila
                    obraId={id}
                    codigoSugerido="1.0"
                    capitulos={[]}
                    codigosUsados={[]}
                  />
                )}
              </div>
            </div>

            <PanelAyuda puntos={PRIMEROS_PASOS} />
          </div>
        ) : (
          <div className="space-y-4">
            <TablaPartidas
              obraId={id}
              filas={filas}
              // Un presupuesto congelado no se edita: los indicadores se
              // calculan contra el y cambiarlo los invalidaria hacia atras.
              editable={puede(sesion, "partida:editar") && obra.lineaBaseVersion === null}
            />

            {/* Solo mientras se pueda editar: con el presupuesto congelado, lo
                que procede es un movimiento, no una partida nueva suelta. */}
            {puedeCrear && obra.lineaBaseVersion === null && (
              <NuevaFila
                obraId={id}
                codigoSugerido={siguienteCodigo}
                capitulos={capitulos}
                codigosUsados={codigosUsados}
              />
            )}
          </div>
        )}

        {/* Estaba escrita en `explicaciones.ts` desde hace tiempo y no la
            renderizaba nadie. Va aqui porque es donde se elige modalidad. */}
        {filas.length > 0 && <Explicacion texto={MODALIDAD_PARTIDA} />}
      </section>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <dt className="text-xs opacity-60">{etiqueta}</dt>
      <dd
        className={`mt-1 tabular-nums ${destacado ? "text-xl font-semibold" : "text-base font-medium"}`}
      >
        {valor}
      </dd>
    </div>
  );
}
