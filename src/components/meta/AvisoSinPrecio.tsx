import { CircleDollarSign } from "lucide-react";

/**
 * Cuantas partidas del borrador esperan todavia su precio.
 *
 * Es la otra mitad de «cargar solo la estructura», pedida el 27 de agosto de
 * 2026: si el Excel entra sin un solo precio, algo tiene que decir cuantos
 * faltan y que la meta no vale hasta ponerlos. Sin esto, un presupuesto
 * cargado a medias se ve exactamente igual que uno terminado -una lista de
 * partidas- y la unica pista seria un costo total sospechosamente bajo.
 *
 * Se cuenta al pintar, sobre las lineas guardadas, y no se anota en ningun
 * sitio: asi baja solo segun se van completando y llega a cero sin que nadie
 * tenga que cerrar el aviso.
 *
 * Cuenta SOLO partidas. Un capitulo no lleva importe propio -es la suma de
 * las suyas-, asi que incluirlo diria que falta algo que no falta.
 */
export function AvisoSinPrecio({
  cuantas,
  total,
}: {
  cuantas: number;
  /// Partidas del borrador, para poder decir «12 de 355» y no solo «12».
  total: number;
}) {
  if (cuantas === 0) return null;

  const todas = cuantas === total;

  return (
    <section
      role="status"
      className="flex items-start gap-3 rounded-xl border p-4"
      style={{
        borderColor: "var(--color-alerta)",
        backgroundColor:
          "color-mix(in oklab, var(--color-alerta) 12%, transparent)",
      }}
    >
      <CircleDollarSign className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">
          {todas
            ? `Falta poner los precios: ninguna de las ${total} partidas los tiene todavía`
            : `${cuantas} de ${total} partidas esperan su precio`}
        </h2>
        <p className="max-w-3xl text-sm text-pretty opacity-80">
          {todas
            ? "Se cargó solo la estructura, que era lo pedido. "
            : ""}
          Complétalas abajo, una a una: la unidad, la cantidad y el precio. El
          importe lo calcula GCM.{" "}
          {todas ? (
            <>
              <strong>Así como está no se puede aprobar</strong>: una meta sin
              un solo precio no dice nada sobre la bolsa de la obra.
            </>
          ) : (
            <>
              Se puede aprobar antes de terminarlas —hay presupuestos donde una
              partida no lleva precio propio a propósito—, pero entonces la
              bolsa se calcula sin ellas.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
