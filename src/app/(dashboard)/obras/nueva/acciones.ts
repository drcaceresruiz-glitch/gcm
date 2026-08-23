"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/services/sesion.service";
import { crearObra } from "@/services/obras.service";
import {
  cargarMetaDesdeExcel,
  mesesEntre,
} from "@/services/meta-desde-excel";

/**
 * Alta de obras, con el presupuesto meta opcional en la misma tacada.
 *
 * Aqui solo se lee el formulario; las reglas —nombre obligatorio, fechas
 * coherentes, codigo no repetido dentro de la empresa— viven en el servicio,
 * que es quien tambien saca el `companyId` de la sesion.
 *
 * EL EXCEL VA ADJUNTO AL FORMULARIO, y no al reves. Se penso en dejar que un
 * Excel con una hoja «Obra» creara la obra entera, y no salia a cuenta: el
 * ahorro real eran dos clics de navegacion, y a cambio los campos se irian al
 * peor sitio posible para meterlos. El formulario valida en vivo —comprueba
 * que el fin no sea anterior al inicio y no habilita el boton hasta que
 * cuadra—; una celda de Excel no valida nada, y un nombre en blanco o una
 * fecha al reves se descubririan al subir el archivo en vez de al escribirlo.
 *
 * Lo que si sobraba era el VIAJE: crear la obra, salir, entrar en Meta y
 * subir. Eso es lo que se junta aqui, reutilizando la MISMA lectura del Excel
 * (`services/meta-desde-excel.ts`) que usa la pantalla de la meta. Un solo
 * camino, un solo parser.
 */

export interface EstadoObra {
  error?: string;
}

export async function accionCrearObra(
  _previo: EstadoObra,
  datos: FormData,
): Promise<EstadoObra> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const texto = (campo: string) => String(datos.get(campo) ?? "").trim();

  const resultado = await crearObra(sesion, {
    nombreObra: texto("nombreObra"),
    codigoObra: texto("codigoObra") || undefined,
    ubicacion: texto("ubicacion") || undefined,
    cliente: texto("cliente") || undefined,
    fechaInicio: texto("fechaInicio"),
    fechaFinProgramada: texto("fechaFinProgramada"),
    estado: texto("estado") || undefined,
  });

  if (!resultado.ok) return { error: resultado.error };

  revalidatePath("/panel");

  /*
   * El presupuesto, si vino adjunto.
   *
   * LA OBRA YA ESTA CREADA cuando esto corre, y eso es deliberado: si la
   * carga del Excel falla —una fila mal, un archivo que no es el que era— la
   * obra se queda, vacia, y se avisa de que hay que cargarle el presupuesto.
   * Deshacerla seria peor: quien acaba de teclear seis campos correctos los
   * perderia por un error que esta en OTRO documento, y ademas ya hay un
   * correlativo de empresa consumido.
   */
  const archivo = datos.get("archivo");
  const traeExcel = archivo instanceof File && archivo.size > 0;

  if (traeExcel) {
    const carga = await cargarMetaDesdeExcel(sesion, resultado.id, {
      archivo,
      modo: texto("modo"),
      // El plazo con el que se presupuestan las lineas por mes sale de las
      // fechas que se acaban de teclear: en el alta no hay nada mas fiable, y
      // pedirlo otra vez seria pedir dos veces el mismo dato.
      mesesPlazo: mesesEntre(
        new Date(`${texto("fechaInicio")}T00:00:00.000Z`),
        new Date(`${texto("fechaFinProgramada")}T00:00:00.000Z`),
      ),
      // La meta se fija HOY: es la fecha en que se asume el compromiso.
      fechaMeta: new Date().toISOString().slice(0, 10),
    });

    if (!carga.ok) {
      // Se manda a la obra, no se devuelve el error a un formulario que ya no
      // existe: la obra esta creada y volver a el invitaria a crearla otra
      // vez. El motivo viaja para que la pantalla lo explique donde toca.
      redirect(
        `/obras/${resultado.id}/meta?fallo=${encodeURIComponent(carga.error)}`,
      );
    }

    revalidatePath(`/obras/${resultado.id}`);
    // Con presupuesto ya dentro, lo siguiente es el contractual: es donde se
    // deciden los recargos mirando la bolsa.
    redirect(`/obras/${resultado.id}/contractual`);
  }

  // Sin Excel, a la obra recien creada, que esta vacia: lo siguiente es
  // cargarle el presupuesto, y es donde vive el importador.
  redirect(`/obras/${resultado.id}`);
}
