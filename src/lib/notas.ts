import { Hammer, Scale, Truck, Wallet } from "lucide-react";
import type { CategoriaNota } from "@/generated/prisma/enums";

/**
 * La bitacora libre de la obra: lo que no encaja en ningun formulario
 * reglado. Aqui vive solo lo puro —el catalogo de categorias y la regla de
 * "vencida"— para que el servicio, el formulario, la lista y el widget del
 * tablero lean todos de un mismo sitio.
 */

/** Las cuatro categorias fijas del lanzamiento, con lo que hace falta pintarlas. */
export const CATEGORIAS_NOTA = [
  {
    valor: "FINANCIERO",
    titulo: "Financiero",
    icono: Wallet,
    ayuda: "Pagos, cobros, algo que afecta al dinero de la obra.",
  },
  {
    valor: "LOGISTICA",
    titulo: "Logística",
    icono: Truck,
    ayuda: "Materiales, equipos, transporte: lo que hace falta que llegue.",
  },
  {
    valor: "OPERATIVO",
    titulo: "Operativo",
    icono: Hammer,
    ayuda: "El dia a dia de la obra que no tiene otra pantalla donde ir.",
  },
  {
    valor: "LEGAL",
    titulo: "Legal",
    icono: Scale,
    ayuda: "Permisos, contratos, cualquier tema con la autoridad o un tercero.",
  },
] as const satisfies readonly {
  valor: CategoriaNota;
  titulo: string;
  icono: typeof Wallet;
  ayuda: string;
}[];

/** Lo minimo de una nota para saber si esta vencida. */
export interface NotaVencibilidad {
  atendida: boolean;
  fechaRecordatorio: Date | null;
}

/**
 * La UNICA regla de "vencida" en todo el sistema.
 *
 * Nunca se guarda en una columna: una nota que se crea hoy con fecha de ayer
 * ya nace vencida, y una columna calculada al escribir mentiria en cuanto
 * pasara un dia sin que nadie tocara la fila. Se deriva siempre, aqui, contra
 * la hora de la peticion.
 */
export function esVencida(nota: NotaVencibilidad, ahora: Date): boolean {
  return (
    !nota.atendida &&
    nota.fechaRecordatorio !== null &&
    nota.fechaRecordatorio.getTime() < ahora.getTime()
  );
}
