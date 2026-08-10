"use client";

import { Fragment, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Lock, LoaderCircle, RotateCcw } from "lucide-react";
import {
  accionGuardarPermisos,
  type EstadoPermisos,
} from "@/app/(dashboard)/empresa/permisos/acciones";
import type { MatrizPermisos as Matriz } from "@/services/permisos.service";
import { ETIQUETA_ROL } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/enums";

/**
 * La rejilla de permisos: permisos en filas, roles en columnas.
 *
 * Se edita en memoria y se guarda de una vez. Con algo mas de cien casillas,
 * que cada una guardara sola convertiria un repaso de la organizacion en
 * cien actos sueltos, sin ocasion de mirar el conjunto antes de aplicarlo.
 * Por eso el boton dice cuantas casillas van a cambiar y cuales.
 *
 * Las casillas que se apartan de su plantilla se marcan, y no solo se
 * quedan marcadas o desmarcadas: sin eso no se distingue «este rol lo tiene
 * porque le toca» de «alguien se lo concedio», que es justo lo que se viene
 * a averiguar.
 */

/** Cabecera legible de cada bloque, por el prefijo del permiso. */
const ETIQUETA_DOMINIO: Record<string, string> = {
  empresa: "Empresa",
  usuario: "Usuarios",
  obra: "Obras",
  partida: "Partidas",
  linea_base: "Línea base",
  movimiento: "Movimientos presupuestales",
  permiso: "Permisos",
  auditoria: "Auditoría",
};

/** Clave de una casilla. El rol y el permiso, que es lo que la identifica. */
const casilla = (role: Role, permiso: string) => `${role}|${permiso}`;

interface Props {
  matriz: Matriz;
  /// Quien solo tiene `permiso:leer` ve la rejilla sin poder tocarla.
  editable: boolean;
}

export function MatrizPermisos({ matriz, editable }: Props) {
  const [estado, accion] = useActionState<EstadoPermisos, FormData>(
    accionGuardarPermisos,
    {},
  );

  /// Lo que hay en vigor segun el servidor, para comparar contra lo editado.
  const original = new Map<string, boolean>();
  for (const fila of matriz.filas) {
    for (const celda of fila.celdas) {
      original.set(casilla(celda.role, fila.permiso), celda.efectivo);
    }
  }

  const [valores, setValores] = useState<Map<string, boolean>>(
    () => new Map(original),
  );

  const cambiadas = [...valores].filter(
    ([clave, valor]) => original.get(clave) !== valor,
  );

  function alternar(role: Role, permiso: string) {
    const clave = casilla(role, permiso);
    setValores((previos) => {
      const siguiente = new Map(previos);
      siguiente.set(clave, !siguiente.get(clave));
      return siguiente;
    });
  }

  function descartar() {
    setValores(new Map(original));
  }

  /**
   * Solo viajan las casillas que cambian, no la rejilla entera.
   *
   * Ademas de ser menos trabajo, es lo correcto si dos personas editan a la
   * vez: cada una aplica lo suyo. Mandar la rejilla completa haria que la
   * segunda en guardar deshiciera en silencio lo que hizo la primera.
   */
  const carga = cambiadas.map(([clave, concedido]) => {
    const [role, permiso] = clave.split("|");
    return { role: role as Role, permiso: permiso ?? "", concedido };
  });

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="cambios" value={JSON.stringify(carga)} />

      {estado.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--color-peligro) 15%, transparent)",
          }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{estado.error}</span>
        </p>
      )}

      {editable && <BarraCambios cambios={carga} onDescartar={descartar} />}

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: "var(--borde)" }}
      >
        <table className="w-full min-w-[46rem] text-sm">
          <caption className="sr-only">
            Permisos por rol. Una casilla marcada concede el permiso; las que
            se apartan de la plantilla del rol llevan un aviso.
          </caption>
          <thead>
            <tr
              className="text-left text-xs uppercase"
              style={{
                backgroundColor:
                  "color-mix(in oklab, var(--borde) 40%, transparent)",
              }}
            >
              <th scope="col" className="px-3 py-2 font-medium">
                Permiso
              </th>
              {matriz.roles.map((role) => (
                <th key={role} scope="col" className="px-3 py-2 text-center font-medium">
                  {ETIQUETA_ROL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matriz.filas.map((fila, i) => {
              const dominio = fila.permiso.split(":")[0] ?? "";
              const anterior = matriz.filas[i - 1]?.permiso.split(":")[0];
              const abreBloque = dominio !== anterior;

              return (
                <Fragment key={fila.permiso}>
                  {abreBloque && <Cabecera dominio={dominio} columnas={matriz.roles.length + 1} />}

                  <tr className="border-t" style={{ borderColor: "var(--borde)" }}>
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <span className="font-medium">{fila.permiso}</span>
                      {!fila.editable && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor:
                              "color-mix(in oklab, var(--color-alerta) 18%, transparent)",
                          }}
                        >
                          <Lock className="size-3" aria-hidden="true" />
                          reservado
                        </span>
                      )}
                    </th>

                    {fila.celdas.map((celda) => {
                      const clave = casilla(celda.role, fila.permiso);
                      const valor = valores.get(clave) ?? celda.efectivo;
                      const pendiente = original.get(clave) !== valor;
                      const desviado = valor !== celda.plantilla;

                      return (
                        <td key={celda.role} className="px-3 py-2 text-center">
                          <Casilla
                            marcada={valor}
                            bloqueada={!fila.editable || !editable}
                            pendiente={pendiente}
                            desviado={desviado}
                            etiqueta={`${fila.permiso} para ${ETIQUETA_ROL[celda.role]}`}
                            onChange={() => alternar(celda.role, fila.permiso)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}

function Cabecera({ dominio, columnas }: { dominio: string; columnas: number }) {
  return (
    <tr>
      <th
        scope="colgroup"
        colSpan={columnas}
        className="px-3 pt-4 pb-1 text-left text-xs font-semibold uppercase opacity-60"
      >
        {ETIQUETA_DOMINIO[dominio] ?? dominio}
      </th>
    </tr>
  );
}

interface CasillaProps {
  marcada: boolean;
  bloqueada: boolean;
  /// Cambiada respecto a lo guardado: todavia no esta en vigor.
  pendiente: boolean;
  /// Distinta de lo que trae la plantilla del rol.
  desviado: boolean;
  etiqueta: string;
  onChange: () => void;
}

function Casilla({
  marcada,
  bloqueada,
  pendiente,
  desviado,
  etiqueta,
  onChange,
}: CasillaProps) {
  const estado = [
    desviado ? "fuera de la plantilla" : "según la plantilla",
    pendiente ? "sin guardar" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <label className="relative inline-flex items-center justify-center">
      <span className="sr-only">
        {etiqueta} ({estado})
      </span>
      <input
        type="checkbox"
        checked={marcada}
        disabled={bloqueada}
        onChange={onChange}
        className="size-4 disabled:opacity-40"
        style={{
          accentColor: pendiente
            ? "var(--color-alerta)"
            : "var(--color-marca-600)",
        }}
      />
      {/* El punto distingue «lo tiene porque le toca» de «alguien se lo
          concedio», que es justo lo que se viene a averiguar aqui. */}
      {desviado && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-1.5 size-1.5 rounded-full"
          style={{
            backgroundColor: pendiente
              ? "var(--color-alerta)"
              : "var(--color-marca-600)",
          }}
        />
      )}
    </label>
  );
}

interface Cambio {
  role: Role;
  permiso: string;
  concedido: boolean;
}

/**
 * Lo que va a cambiar, antes de que cambie.
 *
 * Se enumeran los cambios y no solo se cuentan: repartir permisos se hace de
 * tanto en tanto y a menudo tocando varias casillas seguidas, y a la tercera
 * ya no se recuerda si esa de ALMACENERO se marco a proposito.
 */
function BarraCambios({
  cambios,
  onDescartar,
}: {
  cambios: Cambio[];
  onDescartar: () => void;
}) {
  const { pending } = useFormStatus();
  const hay = cambios.length > 0;

  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
      style={{
        borderColor: hay ? "var(--color-alerta)" : "var(--borde)",
        backgroundColor: hay
          ? "color-mix(in oklab, var(--color-alerta) 10%, transparent)"
          : "var(--superficie)",
      }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {hay
            ? cambios.length === 1
              ? "1 cambio sin guardar"
              : `${cambios.length} cambios sin guardar`
            : "Sin cambios"}
        </p>

        {hay ? (
          <ul className="mt-1 space-y-0.5 text-sm opacity-80">
            {cambios.slice(0, 6).map((c) => (
              <li key={`${c.role}|${c.permiso}`}>
                {c.concedido ? "Se concede" : "Se quita"}{" "}
                <span className="font-medium">{c.permiso}</span> a{" "}
                {ETIQUETA_ROL[c.role]}
              </li>
            ))}
            {cambios.length > 6 && (
              <li className="opacity-70">y {cambios.length - 6} más</li>
            )}
          </ul>
        ) : (
          <p className="mt-1 text-sm opacity-70">
            Marca o desmarca casillas y aquí aparecerá lo que va a cambiar.
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        {hay && (
          <button
            type="button"
            onClick={onDescartar}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--borde)" }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Descartar
          </button>
        )}

        <button
          type="submit"
          disabled={!hay || pending}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {pending && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          {pending ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
