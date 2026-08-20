import "server-only";
import { puede } from "@/lib/rbac";
import {
  predecirHitos,
  type Prediccion,
  type TareaPredecible,
} from "@/lib/hitos-predictivos";
import { obtenerCronograma } from "@/services/cronograma.service";
import { datosEvm } from "@/services/evm.service";
import { obtenerCalendario } from "@/services/calendario.service";
import { listarHitos } from "@/services/hitos.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Los hitos que GCM PROPONE para una obra.
 *
 * Va en su propio archivo y no dentro de `hitos.service` porque solo LEE: no
 * escribe una fila, no toca el cronograma y no puede romper nada. Aceptar una
 * propuesta es otra cosa, y de eso ya se encarga `crearHito`.
 *
 * Nada se guarda: se calcula al abrir la pantalla. Asi una propuesta nunca se
 * queda rancia contradiciendo al plan, y —lo que de verdad importa— **una
 * propuesta no existe como fila del cronograma hasta que alguien la acepta**.
 * Si naciera como fila, `esHito` la sacaria del avance ponderado y la curva se
 * descuadraria sola, sin dar ningun error.
 *
 * Todos los insumos ya existian; aqui no se calcula ninguna metrica nueva.
 */
export async function hitosPropuestos(
  sesion: SesionActiva,
  obraId: string,
): Promise<Prediccion> {
  const vacio: Prediccion = { propuestas: [], sinDato: [] };

  if (!puede(sesion, "cronograma:leer")) return vacio;

  const [cronograma, evm, calendario, hitos] = await Promise.all([
    obtenerCronograma(sesion, obraId),
    datosEvm(sesion, obraId),
    obtenerCalendario(sesion, obraId),
    listarHitos(sesion, obraId),
  ]);

  // Sin cronograma no hay nada sobre lo que predecir, ni siquiera huecos que
  // explicar: la pantalla de hitos ya dice que falta cargar el plan.
  if (!cronograma) return vacio;

  const tareas: TareaPredecible[] = cronograma.tareas.map((t) => ({
    uid: t.uid,
    codigo: t.codigo,
    nombre: t.nombre,
    esResumen: t.esResumen,
    esHito: t.esHito,
    esCritico: t.esCritico,
    inicio: t.inicio,
    fin: t.fin,
    porcentajePlaneado: t.porcentajePlaneado,
    porcentajeReal: t.porcentajeReal,
    // El ULTIMO reporte de obra. Null si nadie reporto nunca: el servicio ya
    // deja `avance` en null cuando el porcentaje viene sembrado del archivo,
    // que no es lo mismo que alguien midiendo en obra.
    ultimoAvance: t.avance?.fecha ?? null,
  }));

  /**
   * El fin de obra sale del cronograma, no de la ficha: es contra el plan
   * vigente contra el que se proyecta el retraso. Si la ficha dice otra cosa,
   * eso ya lo señala el modulo de plazo por su cuenta.
   */
  const finObra = tareas.reduce<Date | null>(
    (mayor, t) => (mayor === null || t.fin > mayor ? t.fin : mayor),
    null,
  );

  return predecirHitos({
    tareas,
    dependencias: cronograma.dependencias,
    calendario,
    hoy: cronograma.fechaCorte,
    finObra,
    spi: evm?.metricas.spi ?? null,
    cpi: evm?.metricas.cpi ?? null,
    coberturaMapeo: evm?.coberturaMapeo ?? 0,
    conLineaBase: evm?.lineaBase != null,
    // Por ANCLA, no por uid: el hito es una fila nueva con uid propio, asi que
    // comparar uids no casaria nunca y se propondria cada vez lo ya aceptado.
    anclasConHito: new Set(
      hitos.map((h) => h.anclaCodigo).filter((c): c is string => c !== null),
    ),
  });
}
