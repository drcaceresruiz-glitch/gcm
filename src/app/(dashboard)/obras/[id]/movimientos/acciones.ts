"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerSesion } from "@/services/sesion.service";
import {
  aprobarMovimiento,
  crearMovimiento,
  eliminarBorrador,
  type LineaEntrada,
} from "@/services/movimientos.service";
import { conSigno } from "@/lib/movimientos";

/**
 * Acciones de los movimientos presupuestales.
 *
 * Aqui vive una traduccion entre dos vocabularios, como en revisiones. El
 * formulario habla de dinero que ENTRA y que SALE de una partida, con
 * importes siempre positivos, porque asi se dicta un movimiento en obra:
 * «saco 5.000 de tabiqueria y los meto en drywall». El dominio trabaja con
 * un unico importe con SIGNO. La conversion se hace aqui, en la frontera.
 *
 * Pedir el signo en el formulario era la alternativa, y es peor: un menos
 * que se olvida convierte una reconversion en un adicional encubierto, y
 * un menos de mas la descuadra. La direccion no se escribe a medias.
 *
 * La union de direccion e importe es `conSigno`, en `lib/movimientos`, y se
 * comparte con el formulario para que la vista previa y lo que se guarda no
 * puedan discrepar.
 *
 * Las reglas de fondo —que una reconversion sume cero, que un adicional no
 * lleve salidas, que nadie saque de una partida mas de lo que tiene— son
 * del servicio y NO se repiten aqui. Esto solo comprueba la FORMA de lo que
 * llego, porque las lineas viajan como JSON y el navegador puede mandar
 * cualquier cosa.
 */

export interface EstadoMovimiento {
  error?: string;
}

const esquemaLineaExistente = z.object({
  clase: z.literal("existente"),
  wbsItemId: z.string().min(1),
  direccion: z.enum(["entra", "sale"]),
  importe: z.string(),
  justificacion: z.string().optional(),
});

/**
 * Una partida que todavia no existe. Solo un adicional puede traerlas, y el
 * servicio lo vuelve a comprobar.
 *
 * La modalidad no admite ALCANCE: esa modalidad describe el alcance de otra
 * partida y no lleva importe propio, asi que nacer con un importe seria una
 * contradiccion.
 */
const esquemaLineaNueva = z.object({
  clase: z.literal("nueva"),
  parentId: z.string().min(1),
  codigoPartida: z.string().min(1),
  descripcion: z.string().min(1),
  unidad: z.string().optional(),
  metrado: z.string().optional(),
  precioUnitario: z.string().optional(),
  modalidad: z.enum(["PRECIOS_UNITARIOS", "SUMA_ALZADA"]),
  direccion: z.enum(["entra", "sale"]),
  importe: z.string(),
  justificacion: z.string().optional(),
});

const esquemaLineas = z
  .array(
    z.discriminatedUnion("clase", [esquemaLineaExistente, esquemaLineaNueva]),
  )
  .min(1);

export async function accionCrearMovimiento(
  _previo: EstadoMovimiento,
  datos: FormData,
): Promise<EstadoMovimiento> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  if (!obraId) return { error: "Falta la obra." };

  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  const tipo = z
    .enum(["RECONVERSION", "ADICIONAL", "DEDUCTIVO"])
    .safeParse(texto("tipo"));
  if (!tipo.success) return { error: "Elige el tipo de movimiento." };

  let crudo: unknown;
  try {
    crudo = JSON.parse(String(datos.get("lineas") ?? "[]"));
  } catch {
    return { error: "No se pudieron leer las lineas del movimiento." };
  }

  const lineas = esquemaLineas.safeParse(crudo);
  if (!lineas.success) {
    return {
      error:
        "Hay alguna linea incompleta. Revisa que todas tengan partida e importe.",
    };
  }

  const resultado = await crearMovimiento(sesion, obraId, {
    tipo: tipo.data,
    fecha: texto("fecha"),
    concepto: texto("concepto"),
    motivo: texto("motivo"),
    referencia: texto("referencia") || undefined,
    lineas: lineas.data.map(
      (linea): LineaEntrada =>
        linea.clase === "nueva"
          ? {
              parentId: linea.parentId,
              codigoPartida: linea.codigoPartida,
              descripcion: linea.descripcion,
              unidad: linea.unidad || undefined,
              metrado: linea.metrado || undefined,
              precioUnitario: linea.precioUnitario || undefined,
              modalidad: linea.modalidad,
              importe: conSigno(linea.direccion, linea.importe),
              justificacion: linea.justificacion || undefined,
            }
          : {
              wbsItemId: linea.wbsItemId,
              importe: conSigno(linea.direccion, linea.importe),
              justificacion: linea.justificacion || undefined,
            },
    ),
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}/movimientos`);
  redirect(`/obras/${obraId}/movimientos?creado=${resultado.numero}`);
}

/**
 * Aprobar incorpora el movimiento al presupuesto vigente y no se puede
 * deshacer, asi que la accion no acepta nada que se pueda escribir: solo
 * los dos identificadores. El permiso y las comprobaciones de saldo viven
 * en el servicio, que es la frontera real.
 */
export async function accionAprobarMovimiento(
  _previo: EstadoMovimiento,
  datos: FormData,
): Promise<EstadoMovimiento> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const movimientoId = String(datos.get("movimientoId") ?? "");
  if (!obraId || !movimientoId) {
    return { error: "Falta el movimiento a aprobar." };
  }

  const resultado = await aprobarMovimiento(sesion, movimientoId);
  if (!resultado.ok) return { error: resultado.error };

  // Un adicional da de alta partidas al aprobarse, asi que tambien cambia
  // el arbol de la obra, no solo esta pantalla.
  revalidatePath(`/obras/${obraId}`);
  revalidatePath(`/obras/${obraId}/movimientos`);
  redirect(`/obras/${obraId}/movimientos?aprobado=${resultado.numero}`);
}

/**
 * Elimina un borrador. Un movimiento aprobado no se toca: se corrige con
 * otro de signo contrario, y de eso se encarga el servicio.
 *
 * El numero viaja solo para el mensaje de vuelta. Si alguien lo manipulara,
 * lo unico que conseguiria es leer un numero equivocado en su propio aviso.
 */
export async function accionEliminarBorrador(
  _previo: EstadoMovimiento,
  datos: FormData,
): Promise<EstadoMovimiento> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("obraId") ?? "");
  const movimientoId = String(datos.get("movimientoId") ?? "");
  const numero = String(datos.get("numero") ?? "");
  if (!obraId || !movimientoId) {
    return { error: "Falta el movimiento a eliminar." };
  }

  const resultado = await eliminarBorrador(sesion, movimientoId);
  if (!resultado.ok) return { error: resultado.error };

  revalidatePath(`/obras/${obraId}/movimientos`);
  redirect(`/obras/${obraId}/movimientos?eliminado=${numero}`);
}
