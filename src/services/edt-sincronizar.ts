import "server-only";
import { prisma } from "@/lib/prisma";
import { puede } from "@/lib/rbac";
import { sumar } from "@/lib/decimal";
import { sumarHojas } from "@/lib/jerarquia-partidas";
import { motivoSiObraCerrada } from "@/services/obra-abierta";
import { edtDesdePresupuesto } from "@/lib/edt-desde-presupuesto";
import { planSincronizacion } from "@/lib/sincronizar-edt";
import { partidasEnEjecucionQueDesaparecen } from "@/services/partidas-en-ejecucion";
import { recalcularResumenes, type Resultado } from "@/services/edt.service";
import type { SesionActiva } from "@/services/sesion.service";

/**
 * Poner la EDT del cronograma al dia con el presupuesto.
 *
 * El presupuesto ES la EDT, pero sigue vivo: se anaden partidas, se corrigen
 * importes, se agrupa a suma alzada. Sin esto la EDT se queda en la foto del
 * dia que se genero, y las dos versiones de la misma estructura empiezan a
 * discrepar sin que nada falle.
 *
 * Se aplica SOLA y sin preguntar, que es como lo pidio quien manda en el
 * producto. Lo que no se puede decidir solo, se rechaza entero y se explica.
 */

export interface EdtSincronizada {
  version: number;
  altas: number;
  cambios: number;
  enlacesCreados: number;
  enlacesRetirados: number;
  /// Tareas cuya partida ya no existe. NO se borran: se nombran.
  sobrantes: string[];
}

export async function sincronizarEdtConPresupuesto(
  sesion: SesionActiva,
  obraId: string,
): Promise<Resultado<EdtSincronizada>> {
  if (!puede(sesion, "cronograma:editar")) {
    return { ok: false, error: "No tienes permiso para editar el cronograma." };
  }

  const cerrada = await motivoSiObraCerrada(sesion, obraId);
  if (cerrada) return { ok: false, error: cerrada };

  const obra = await prisma.project.findFirst({
    where: { id: obraId, companyId: sesion.companyId },
    select: { id: true, fechaInicio: true },
  });
  if (!obra) return { ok: false, error: "Obra no encontrada." };

  const partidas = await prisma.wbsItem.findMany({
    where: { projectId: obraId },
    select: {
      id: true,
      codigoPartida: true,
      descripcion: true,
      parentId: true,
      orden: true,
      parcial: true,
    },
  });

  if (partidas.length === 0) {
    return { ok: false, error: "Esta obra no tiene presupuesto todavia." };
  }

  const filas = partidas.map((p) => ({
    ...p,
    parcial: p.parcial?.toString() ?? null,
  }));

  const edt = edtDesdePresupuesto(filas);
  if (edt.length === 0) {
    return {
      ok: false,
      error:
        "Ninguna partida del presupuesto tiene importe, asi que no hay nada " +
        "que programar.",
    };
  }

  const vigente = await prisma.cronograma.findFirst({
    where: { projectId: obraId },
    orderBy: [{ fechaCorte: "desc" }, { version: "desc" }],
    select: { id: true, version: true, lineaBaseAt: true },
  });

  if (!vigente) {
    return {
      ok: false,
      error:
        "Esta obra no tiene cronograma todavia. Generalo desde el presupuesto " +
        "y luego se mantendra al dia solo.",
    };
  }

  if (vigente.lineaBaseAt) {
    return {
      ok: false,
      error:
        `El cronograma v${vigente.version} esta fijado como linea base. Los ` +
        `indicadores se calculan contra el, asi que no admite cambios.`,
    };
  }

  const tareas = await prisma.tareaCronograma.findMany({
    where: { cronogramaId: vigente.id },
    orderBy: { fila: "asc" },
    select: { uid: true, codigo: true, nombre: true, nivel: true, fila: true, esResumen: true },
  });

  const plan = planSincronizacion(edt, tareas);

  /**
   * LO QUE YA SE ESTA EJECUTANDO NO SE QUEDA SIN RESPALDO.
   *
   * Si una partida desaparecio del presupuesto y su tarea tiene avance
   * reportado, hay una cuadrilla trabajando y un contratista al que pagarle, y
   * ese pago sale del presupuesto. No es cosa de mover la tarea de sitio: es
   * que esa situacion no debe existir. Se rechaza entera la sincronizacion y
   * se dice cual, para que se arregle en el presupuesto.
   *
   * Las puertas que podrian crearla ya estan cerradas —`eliminarPartida` y el
   * reemplazo del presupuesto se niegan—, pero esto es la red de debajo: si
   * alguna vez se cuela por otro camino, aqui se ve.
   */
  const codigosVivos = new Set(partidas.map((p) => p.codigoPartida));
  const enEjecucion = await partidasEnEjecucionQueDesaparecen(obraId, codigosVivos);

  if (enEjecucion.length > 0) {
    const lista = enEjecucion.slice(0, 5).join(", ");
    const resto = enEjecucion.length > 5 ? `, y ${enEjecucion.length - 5} mas` : "";
    return {
      ok: false,
      error:
        `${enEjecucion.length} partida(s) que YA SE ESTAN EJECUTANDO no estan ` +
        `en el presupuesto: ${lista}${resto}. Hay trabajo hecho y un pago que ` +
        `sale de ellas: devuelvelas al presupuesto, o registra el cambio como ` +
        `adicional o deductivo antes de sincronizar.`,
    };
  }

  /**
   * LA INVARIANTE DEL DINERO, comprobada antes de escribir.
   *
   * La suma de los importes que van a quedar enlazados tiene que ser
   * EXACTAMENTE el costo directo del presupuesto. Es lo mismo que garantiza
   * `edtDesdePresupuesto` por construccion, pero se vuelve a medir aqui porque
   * de esto vive el avance ponderado: si algun dia el calculo se tuerce, es
   * preferible no sincronizar a repartir mal el dinero en silencio.
   */
  const importePorCodigo = new Map(filas.map((f) => [f.codigoPartida, f.parcial]));
  const enlazado = sumar(plan.enlacesDeseados.map((c) => importePorCodigo.get(c) ?? "0"));
  const costoDirecto = sumarHojas(
    filas.map((f) => ({ codigo: f.codigoPartida, parcial: f.parcial })),
  );

  if (enlazado !== costoDirecto) {
    return {
      ok: false,
      error:
        `No se sincronizo: las tareas cubririan ${enlazado} de un costo ` +
        `directo de ${costoDirecto}. Es un fallo del calculo, no del ` +
        `presupuesto; no se toca nada hasta arreglarlo.`,
    };
  }

  const quien = `${sesion.nombres} ${sesion.apellidos} (${sesion.email})`.trim().slice(0, 150);

  const salida = await prisma.$transaction(
    async (tx) => {
      // La linea base puede fijarse entre la lectura y la escritura, y es justo
      // lo que esa guarda existe para impedir.
      const ahora = await tx.cronograma.findUnique({
        where: { id: vigente.id },
        select: { lineaBaseAt: true },
      });
      if (!ahora) throw new Error("AVISO: el cronograma dejo de existir. Recarga la pantalla.");
      if (ahora.lineaBaseAt) {
        throw new Error(
          "AVISO: el cronograma acaba de fijarse como linea base. Recarga la pantalla.",
        );
      }

      /**
       * Los uid de las altas, del contador monotono de la obra y de golpe.
       *
       * Nunca se recicla uno: `AvanceTarea` y `MapeoTareaPartida` se anclan a
       * el sin clave ajena, asi que un uid reutilizado le pegaria a una tarea
       * el avance de otra —y apagaria el aviso de huerfanos en el mismo acto—.
       */
      const uidPorCodigo = new Map(
        tareas.filter((t) => t.codigo !== null).map((t) => [t.codigo!, t.uid]),
      );

      if (plan.altas.length > 0) {
        const obraActualizada = await tx.project.update({
          where: { id: obraId },
          data: { ultimoUidManual: { decrement: plan.altas.length } },
          select: { ultimoUidManual: true },
        });
        const primerUid = obraActualizada.ultimoUidManual + plan.altas.length - 1;

        const nuevas = plan.altas.map((f, i) => ({ ...f, uid: primerUid - i }));
        for (const n of nuevas) uidPorCodigo.set(n.codigo, n.uid);

        await tx.tareaCronograma.createMany({
          data: nuevas.map((f) => ({
            cronogramaId: vigente.id,
            uid: f.uid,
            fila: f.fila,
            codigo: f.codigo.slice(0, 40),
            nombre: f.nombre.slice(0, 500),
            nivel: f.nivel,
            esResumen: f.esResumen,
            esHito: false,
            esCritico: false,
            holguraDias: "0.00",
            holguraInferida: true,
            // Nace sin programar, como en el generador: el presupuesto no trae
            // fechas y no se las inventa.
            sinProgramar: true,
            inicio: obra.fechaInicio,
            fin: obra.fechaInicio,
            duracionDias: "0.00",
            porcentajePlaneado: "0.00",
            porcentajeArchivo: "0.00",
            origen: "MANUAL" as const,
          })),
        });
      }

      /**
       * Los cambios, uno a uno.
       *
       * `fila` no tiene indice unico —lo unico unico es `[cronogramaId, uid]`—,
       * asi que no hace falta el baile en dos fases de la renumeracion del
       * presupuesto. Se escribe por `uid`, que es lo estable.
       *
       * Las FECHAS no se tocan nunca aqui: son lo unico que no sale del
       * presupuesto, y pisarlas borraria el plan que alguien tecleo.
       */
      for (const c of plan.cambios) {
        const { uid, ...datos } = c;
        await tx.tareaCronograma.updateMany({
          where: { cronogramaId: vigente.id, uid },
          data: datos,
        });
      }

      /**
       * Los enlaces con el dinero: el conjunto final es exactamente el de los
       * aportantes. Hay que QUITAR ademas de poner —una partida que gana
       * subpartidas deja de llevar el importe— o su avance y el de sus hijas
       * contarian dos veces lo mismo.
       */
      const deseados = new Map<string, number>();
      for (const codigo of plan.enlacesDeseados) {
        const uid = uidPorCodigo.get(codigo);
        if (uid !== undefined) deseados.set(codigo, uid);
      }

      const actuales = await tx.mapeoTareaPartida.findMany({
        where: { projectId: obraId },
        select: { uid: true, codigoPartida: true },
      });

      const sobran = actuales.filter(
        (m) => deseados.get(m.codigoPartida) !== m.uid,
      );

      let enlacesRetirados = 0;
      for (const m of sobran) {
        const { count } = await tx.mapeoTareaPartida.deleteMany({
          where: { projectId: obraId, uid: m.uid, codigoPartida: m.codigoPartida },
        });
        enlacesRetirados += count;
      }

      const yaEstan = new Set(
        actuales
          .filter((m) => deseados.get(m.codigoPartida) === m.uid)
          .map((m) => m.codigoPartida),
      );

      const porCrear = [...deseados.entries()].filter(([codigo]) => !yaEstan.has(codigo));

      if (porCrear.length > 0) {
        await tx.mapeoTareaPartida.createMany({
          data: porCrear.map(([codigo, uid]) => ({
            projectId: obraId,
            uid,
            codigoPartida: codigo.slice(0, 32),
            confirmadoPor: quien,
            nota: "Enlace puesto al sincronizar la EDT con el presupuesto.",
          })),
        });
      }

      // Mover filas cambia quien cuelga de quien, y con ello las fechas que
      // hereda cada paquete.
      await recalcularResumenes(tx, vigente.id);

      const resumen = {
        version: vigente.version,
        altas: plan.altas.length,
        cambios: plan.cambios.length,
        enlacesCreados: porCrear.length,
        enlacesRetirados,
        sobrantes: plan.sobrantes.map((s) => s.codigo ?? s.nombre),
      };

      await tx.auditLog.create({
        data: {
          companyId: sesion.companyId,
          userId: sesion.userId,
          projectId: obraId,
          entidad: "Cronograma",
          entidadId: vigente.id,
          accion: "UPDATE",
          despues: { evento: "edt_sincronizada_con_presupuesto", ...resumen },
        },
      });

      return resumen;
    },
    { timeout: 60_000 },
  );

  return { ok: true, datos: salida };
}
