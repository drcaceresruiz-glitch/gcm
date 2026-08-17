"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerSesion } from "@/services/sesion.service";
import {
  actualizarPartida,
  crearPartida,
  eliminarPartida,
  renumerarPartidas,
  agruparEnSumaAlzada,
  type Agrupacion,
  type CamposPartida,
  type NuevaPartida,
} from "@/services/partidas.service";
import { eliminarObra, cambiarEstadoObra } from "@/services/obras.service";
import { eliminarObraCerrada } from "@/services/obra-borrado.service";
import { ponerEdtAlDia } from "@/services/edt-sincronizar";

export interface RespuestaEdicion {
  ok: boolean;
  error?: string;
  /**
   * Algo que hay que contar aunque la operacion saliera bien.
   *
   * Dos cosas caben aqui: que el costo directo se haya movido de una forma que
   * nadie espera al teclear una fila, y que el cronograma se haya puesto al
   * dia detras —o no haya podido—.
   */
  aviso?: string;
}

/**
 * Las tres modalidades que existen.
 *
 * La modalidad llega del `value` de un desplegable, que es texto crudo del
 * navegador: sin esta puerta, cualquiera podia guardar una modalidad
 * inventada y dejar la partida fuera de todas las reglas de calculo. La ruta
 * de movimientos ya validaba asi y esta no.
 */
const MODALIDAD = z.enum(["PRECIOS_UNITARIOS", "SUMA_ALZADA", "ALCANCE"]);

/**
 * Lo que decir cuando la base rechaza algo que nadie previo.
 *
 * Los servicios validan lo que saben validar, pero la base tiene la ultima
 * palabra —anchuras, magnitudes, claves ajenas, indices unicos— y cada una de
 * esas negativas llegaba aqui como una excepcion suelta.
 */
function mensajeDeFallo(e: unknown): string {
  // Los avisos que se lanza el propio sistema van con marca, para poder
  // distinguirlos de una excepcion cualquiera y contarlos tal cual.
  if (e instanceof Error && e.message.startsWith("AVISO: ")) {
    return e.message.slice("AVISO: ".length);
  }

  const codigo = (e as { code?: unknown } | null)?.code;

  switch (codigo) {
    case "P2000":
      return "Algún valor es más largo de lo que admite esa columna. Acórtalo.";
    case "P2002":
      return "Ya existe una partida con ese código en esta obra.";
    case "P2003":
      return "Esa partida está enlazada con algo más (una orden, un encargo, un movimiento o una meta). Quítala de ahí primero.";
    case "P2020":
      return "Alguna cifra es demasiado grande para su columna. Revísala.";
    case "P2025":
      return "Esa partida ya no existe: puede que la haya borrado otra persona. Recarga la página.";
    default:
      return "No se pudo guardar el cambio. Si vuelve a pasar, avisa indicando qué partida estabas tocando.";
  }
}

/**
 * Ejecuta una operacion del servicio sin que un fallo tumbe la pantalla.
 *
 * Una Server Action que lanza NO se ve como un error: React sube el rechazo,
 * y sin `error.tsx` en el arbol sale la pantalla generica de Next —«This page
 * couldn't load»—, sin traza y sin decir que paso. Un presupuesto con cientos
 * de filas se queda entonces inservible por un metrado con un cero de mas.
 *
 * Aqui se convierte en lo que siempre debio ser: un mensaje al lado del campo,
 * con la pagina intacta. El error se registra en el servidor, que es donde
 * sirve para arreglarlo.
 */
async function intentar(
  operacion: () => Promise<{ ok: boolean; error?: string }>,
): Promise<RespuestaEdicion> {
  try {
    const r = await operacion();
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  } catch (e) {
    console.error("[partidas] fallo no previsto", e);
    return { ok: false, error: mensajeDeFallo(e) };
  }
}

/**
 * El cronograma sigue al presupuesto SIN QUE NADIE LO PIDA.
 *
 * Anadir una partida y que no aparezca en el cronograma es el divorcio entre
 * las dos estructuras que toda esta parte existe para evitar; y dejarlo en un
 * boton no lo arregla, porque quien teclea una partida no se acuerda de
 * pulsarlo.
 *
 * Va DESPUES de que la operacion del presupuesto haya terminado, y en su
 * propia transaccion: la partida ya se guardo y es correcta, asi que si el
 * cronograma no puede seguirla eso es una noticia, no un motivo para deshacer
 * lo que el usuario acaba de hacer bien.
 */
async function alDiaLaEdt(
  sesion: Awaited<ReturnType<typeof obtenerSesion>>,
  obraId: string,
): Promise<string | undefined> {
  if (!sesion) return undefined;
  try {
    return await ponerEdtAlDia(sesion, obraId);
  } catch (e) {
    console.error("[edt] no se pudo poner al dia", e);
    return "AVISO: el cambio se guardo, pero el cronograma no se pudo poner al dia.";
  }
}

/// Junta los avisos que haya, sin dejar cadenas vacias ni dobles espacios.
function juntar(...avisos: (string | undefined)[]): string | undefined {
  const hay = avisos.filter((a): a is string => Boolean(a && a.trim()));
  return hay.length > 0 ? hay.join(" ") : undefined;
}

export async function accionEditarPartida(
  obraId: string,
  partidaId: string,
  campos: CamposPartida,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  if (campos.modalidad !== undefined && !MODALIDAD.safeParse(campos.modalidad).success) {
    return { ok: false, error: "Esa modalidad no existe." };
  }

  const r = await intentar(() => actualizarPartida(sesion, partidaId, campos));
  if (!r.ok) return r;

  const alDia = await alDiaLaEdt(sesion, obraId);

  revalidatePath(`/obras/${obraId}`);
  return { ok: true, aviso: alDia };
}

export async function accionCrearPartida(
  obraId: string,
  nueva: NuevaPartida,
): Promise<RespuestaEdicion & { aviso?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  // El aviso no es un error: la partida se ha creado. Dice que el costo
  // directo ha cambiado de una forma que nadie espera al teclear una fila.
  let aviso: string | undefined;

  const r = await intentar(async () => {
    const hecho = await crearPartida(sesion, obraId, nueva);
    if (hecho.ok) aviso = hecho.datos.aviso;
    return hecho;
  });

  if (!r.ok) return r;

  const alDia = await alDiaLaEdt(sesion, obraId);

  revalidatePath(`/obras/${obraId}`);
  return { ok: true, aviso: juntar(aviso, alDia) };
}

export async function accionEliminarPartida(
  obraId: string,
  partidaId: string,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await intentar(() => eliminarPartida(sesion, partidaId));
  if (!r.ok) return r;

  const alDia = await alDiaLaEdt(sesion, obraId);

  revalidatePath(`/obras/${obraId}`);
  return { ok: true, aviso: alDia };
}

/**
 * Cierra los huecos de la numeracion.
 *
 * Devuelve cuantas cambiaron para poder decirlo: «se renumeraron 14» y «ya
 * estaban seguidas» son respuestas distintas, y sin el numero la pantalla no
 * podria distinguirlas.
 */
export async function accionRenumerarPartidas(
  obraId: string,
): Promise<RespuestaEdicion & { cambiadas?: number }> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  let cambiadas = 0;

  const r = await intentar(async () => {
    const salida = await renumerarPartidas(sesion, obraId);
    if (salida.ok) cambiadas = salida.datos.cambiadas;
    return salida;
  });

  if (!r.ok) return r;

  // Renumerar ya arrastra el mapeo por su cuenta, pero los CODIGOS de las
  // tareas tambien cambian: sin esto la EDT seguiria mostrando los viejos.
  const alDia = await alDiaLaEdt(sesion, obraId);

  revalidatePath(`/obras/${obraId}`);
  return { ok: true, cambiadas, aviso: alDia };
}

/**
 * Agrupa varias partidas en una sola a suma alzada.
 *
 * Devuelve la suma de las agrupadas junto al importe guardado: si no
 * coinciden, la pantalla puede decir cuanto entro o salio del presupuesto,
 * que es lo unico que no debe pasar en silencio.
 */
export async function accionAgruparPartidas(
  obraId: string,
  datos: Agrupacion,
): Promise<RespuestaEdicion & { codigo?: string; importe?: string; suma?: string }> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  let salida: { codigo: string; importe: string; suma: string } | null = null;

  const r = await intentar(async () => {
    const hecho = await agruparEnSumaAlzada(sesion, obraId, datos);
    if (hecho.ok) salida = hecho.datos;
    return hecho;
  });

  if (!r.ok) return r;

  const alDia = await alDiaLaEdt(sesion, obraId);

  revalidatePath(`/obras/${obraId}`);
  return { ok: true, ...(salida ?? {}), aviso: alDia };
}

/**
 * Elimina la obra entera. Solo procede en planificacion y sin compromisos; de
 * eso se encarga el servicio. Al lograrlo, la obra ya no existe: se vuelve al
 * panel, y por eso el `redirect` va fuera —no se puede revalidar una ruta que
 * se acaba de borrar—.
 */
export async function accionEliminarObra(
  _previo: RespuestaEdicion,
  datos: FormData,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarObra(sesion, String(datos.get("id") ?? ""));
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/panel");
  redirect("/panel");
}

/**
 * Elimina DEFINITIVAMENTE una obra cerrada, con todo lo que cuelga de ella.
 *
 * La accion no decide nada: pasa lo tecleado al servicio, que comprueba el
 * permiso, el estado, el nombre, la contrasena y que exista un respaldo
 * reciente. Aqui solo se recoge el formulario y se vuelve al panel, porque la
 * obra ya no existe y no hay ruta suya que revalidar.
 */
export async function accionEliminarObraCerrada(
  _previo: RespuestaEdicion,
  datos: FormData,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await eliminarObraCerrada(sesion, String(datos.get("id") ?? ""), {
    nombreEscrito: String(datos.get("nombre") ?? ""),
    clave: String(datos.get("clave") ?? ""),
  });
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath("/panel");
  redirect("/panel");
}

/** Cambia el estado de la obra por uno de los permitidos desde el actual. */
export async function accionCambiarEstadoObra(
  _previo: RespuestaEdicion,
  datos: FormData,
): Promise<RespuestaEdicion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const obraId = String(datos.get("id") ?? "");
  const r = await cambiarEstadoObra(sesion, obraId, String(datos.get("estado") ?? ""));
  if (!r.ok) return { ok: false, error: r.error };

  revalidatePath(`/obras/${obraId}`, "layout");
  revalidatePath("/panel");
  return { ok: true };
}
