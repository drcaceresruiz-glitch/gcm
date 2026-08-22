import type { FilaEdt } from "@/lib/edt-desde-presupuesto";

/**
 * Escritura del cronograma en XML de MS Project (MSPDI).
 *
 * ESPEJO EXACTO de `lib/msproject-xml.ts`, que lo lee. Existe para cerrar el
 * viaje de ida y vuelta que pidio el usuario: sacar la EDT del presupuesto,
 * abrirla en ProjectLibre —que es gratis—, planificarla alli con fechas,
 * dependencias y ruta critica, y volver a cargarla en GCM.
 *
 * POR QUE MSPDI Y NO EL FORMATO DE PROJECTLIBRE. ProjectLibre guarda en
 * `.pod`, pero ABRE tambien el XML de MS Project, y ese es el formato que GCM
 * ya sabe leer. Generar `.pod` seria escribir un formato propietario para
 * ganar exactamente nada.
 *
 * ALCANCE, Y ESTO IMPORTA: esto exporta **la EDT que sale del presupuesto para
 * planificarla**, no un cronograma vivo. La razon es dura y esta en el lector:
 * rechaza los `<UID>` negativos porque los reserva para las tareas escritas
 * dentro de GCM, y son justo los que reparte `generarEdtDesdePresupuesto`. Un
 * cronograma ya generado no se puede exportar y reimportar por aqui sin que
 * cada tarea vuelva como nueva. Por eso se numera 1..N, igual que la plantilla
 * de Excel.
 */

/** El campo personalizado del «% Planeado». Ver el lector. */
export const CAMPO_PORCENTAJE_PLANEADO = "188743731";

export interface CronogramaAExportar {
  nombreObra: string;
  /// AAAA-MM-DD. Va como `<StatusDate>`, que es lo que identifica el corte.
  fechaCorte: string;
  /// Plazo de la obra, AAAA-MM-DD.
  inicioObra: string;
  finObra: string;
  /// Dias laborables del plazo, del calendario de la obra.
  diasPlazo: number;
  /// Minutos de la jornada. Con el se convierten los dias a duracion ISO.
  minutosPorDia: number;
  filas: readonly FilaEdt[];
}

/**
 * Escapa lo que va DENTRO de un elemento XML.
 *
 * No es adorno: los nombres salen del presupuesto, que lo escribe una persona
 * en un Excel. Un `&` en «Acero & habilitado» —o un `<`— rompe el archivo
 * entero, y el planificador solo veria que ProjectLibre no lo abre.
 */
function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Dias -> duracion ISO 8601, que es como MSPDI la escribe: "PT408H0M0S".
 *
 * Se pasa por la jornada y NUNCA por 24 h: un dia de obra son las horas que
 * diga el calendario, y `duracionADias` del lector deshace exactamente esta
 * cuenta. Si las dos no coinciden, el plazo cambia solo al ir y volver.
 */
export function diasADuracionIso(dias: number, minutosPorDia: number): string {
  const totalMinutos = Math.round(dias * minutosPorDia);
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `PT${horas}H${minutos}M0S`;
}

/** AAAA-MM-DD -> el instante que escribe MSPDI. */
function fechaMspdi(dia: string): string {
  return `${dia}T08:00:00`;
}

/**
 * El nombre tal como lo espera el lector: el codigo DELANTE.
 *
 * El codigo no viaja en `<WBS>` —ahi Project pone su numeracion interna— sino
 * al principio del nombre, y el lector lo separa con
 * `/^(\d+(?:\.\d+)+)\s+(.+)$/`.
 *
 * OJO A ESA EXPRESION: exige al menos UN PUNTO. Un capitulo numerado "1" a
 * secas volveria con el codigo pegado al nombre y sin codigo propio. Los
 * presupuestos reales numeran "01.01" o "1.0", asi que en la practica no
 * pasa; pero si algun dia pasa, es aqui donde se ve por que.
 */
function nombreConCodigo(fila: FilaEdt): string {
  return `${fila.codigo} ${fila.nombre}`;
}

export function generarProjectXml(datos: CronogramaAExportar): string {
  const {
    nombreObra, fechaCorte, inicioObra, finObra,
    diasPlazo, minutosPorDia, filas,
  } = datos;

  const inicio = fechaMspdi(inicioObra);
  const fin = fechaMspdi(finObra);

  /**
   * La fila del proyecto, con `<OutlineLevel>0`.
   *
   * El lector la descarta POR EL NIVEL —nunca por su texto— y solo le toma el
   * plazo. Va con `<UID>0`, que es el unico UID no positivo que admite.
   */
  const filaProyecto = tarea({
    uid: 0,
    id: 0,
    nombre: nombreObra,
    nivel: 0,
    esResumen: true,
    inicio,
    fin,
    duracion: diasADuracionIso(diasPlazo, minutosPorDia),
  });

  /**
   * Y el resto, numeradas 1..N.
   *
   * El `<OutlineLevel>` sale de `FilaEdt.nivel` TAL CUAL, sin desplazar: aqui
   * el proyecto es el nivel 0 y los capitulos el 1, mientras que en la
   * plantilla de Excel el nivel 1 es la obra y los capitulos bajan al 2. Son
   * dos convenciones distintas para el mismo arbol, y confundirlas mete todos
   * los capitulos dentro del primero.
   *
   * Las fechas salen al plazo entero, como en la plantilla de Excel y por lo
   * mismo: es un marcador que se ve que hay que ajustar, no un plan inventado.
   */
  const filasTareas = filas.map((f, i) =>
    tarea({
      uid: i + 1,
      id: i + 1,
      nombre: nombreConCodigo(f),
      nivel: f.nivel,
      esResumen: f.esResumen,
      inicio,
      fin,
      duracion: diasADuracionIso(diasPlazo, minutosPorDia),
    }),
  );

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    `  <Name>${escaparXml(nombreObra)}</Name>`,
    `  <Title>${escaparXml(nombreObra)}</Title>`,
    "  <ScheduleFromStart>1</ScheduleFromStart>",
    `  <StartDate>${inicio}</StartDate>`,
    `  <FinishDate>${fin}</FinishDate>`,
    // Lo que identifica el corte para el lector. Ni `LastSaved` ni
    // `CurrentDate` sirven: lo dice su propia cabecera.
    `  <StatusDate>${fechaMspdi(fechaCorte)}</StatusDate>`,
    // Con esto se deshacen las duraciones. Sin el, el lector no puede
    // convertir y el plazo entero se queda en nada.
    `  <MinutesPerDay>${minutosPorDia}</MinutesPerDay>`,
    "  <Tasks>",
    filaProyecto,
    ...filasTareas,
    "  </Tasks>",
    "</Project>",
    "",
  ].join("\n");
}

function tarea(t: {
  uid: number;
  id: number;
  nombre: string;
  nivel: number;
  esResumen: boolean;
  inicio: string;
  fin: string;
  duracion: string;
}): string {
  return [
    "    <Task>",
    `      <UID>${t.uid}</UID>`,
    `      <ID>${t.id}</ID>`,
    `      <Name>${escaparXml(t.nombre)}</Name>`,
    `      <OutlineLevel>${t.nivel}</OutlineLevel>`,
    `      <Start>${t.inicio}</Start>`,
    `      <Finish>${t.fin}</Finish>`,
    `      <Duration>${t.duracion}</Duration>`,
    `      <Summary>${t.esResumen ? 1 : 0}</Summary>`,
    // Un hito es duracion cero y aqui ninguna la tiene. Se escribe explicito
    // para no depender de que el lector suponga el valor por defecto.
    "      <Milestone>0</Milestone>",
    // Plan sin ejecutar: no hay avance que declarar.
    "      <PercentComplete>0</PercentComplete>",
    // El «% Planeado» se OMITE a proposito: es el campo que ProjectLibre
    // llena al planificar, no algo que GCM deba inventar antes de que exista
    // un plan. OJO, a diferencia de la plantilla de Excel: el lector de este
    // XML (`msproject-xml.ts`) NO reparte la duracion para deducirlo -esa
    // deduccion es solo del importador de Excel-. Aqui, sin el campo, el
    // lector anota "0.00" y avisa; es la misma regla que el propio archivo
    // declara en su cabecera ("nada se deduce ni se recalcula: MS Project
    // manda sobre el plan").
    "    </Task>",
  ].join("\n");
}
