"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { obtenerSesion } from "@/services/sesion.service";
import {
  congelarEmpresa,
  descongelarEmpresa,
} from "@/services/empresa-migracion.service";

/**
 * Congelar y descongelar la empresa.
 *
 * La EXPORTACION no esta aqui y no puede estarlo: una accion de servidor
 * devuelve su resultado por el payload de React, y por ahi no caben cientos
 * de MB. Va por una ruta que transmite el zip, igual que el respaldo de obra.
 *
 * El criterio —quien puede, que se apunta— vive en el servicio y se comprueba
 * alli. Una accion de servidor es un endpoint invocable sin haber pintado
 * nunca la pantalla, asi que no basta con esconder el boton.
 */

export interface EstadoMigracionUi {
  error?: string;
  ok?: string;
}

export async function accionCongelar(
  _previo: EstadoMigracionUi,
): Promise<EstadoMigracionUi> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await congelarEmpresa(sesion);
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/migracion");
  return {
    ok: "Empresa congelada. Nadie puede registrar nada hasta que la descongeles.",
  };
}

export async function accionDescongelar(
  _previo: EstadoMigracionUi,
): Promise<EstadoMigracionUi> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const r = await descongelarEmpresa(sesion);
  if (!r.ok) return { error: r.error };

  revalidatePath("/empresa/migracion");
  return { ok: "La empresa vuelve a admitir cambios." };
}
