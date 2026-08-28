import type { ReactNode } from "react";

/**
 * Las piezas de las guias de investigacion: un bloque plegable, una tabla y un
 * nombre de columna.
 *
 * Viven aparte porque las usan las DOS guias -la del estudio, en la pantalla
 * de entrada, y la del analisis, dentro de cada obra- y porque cambiar el
 * aspecto de una explicacion no deberia obligar a tocar el texto de la otra.
 */

export function Bloque({
  titulo,
  resumen,
  children,
}: {
  titulo: string;
  resumen: string;
  children: ReactNode;
}) {
  return (
    <details
      className="rounded-xl border"
      style={{ borderColor: "var(--borde)" }}
    >
      <summary className="cursor-pointer list-none p-4">
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-sm text-pretty opacity-70">
          {resumen}
        </span>
      </summary>
      <div className="space-y-3 border-t px-4 py-4 text-sm text-pretty"
        style={{ borderColor: "var(--borde)" }}
      >
        {children}
      </div>
    </details>
  );
}

export function Tabla({
  cabecera,
  filas,
}: {
  cabecera: readonly string[];
  filas: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: "var(--borde)" }}>
            {cabecera.map((c) => (
              <th key={c} className="py-2 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr
              key={i}
              className="border-b last:border-0 align-top"
              style={{ borderColor: "var(--borde)" }}
            >
              {f.map((celda, j) => (
                <td key={j} className="py-2 pr-4 opacity-80">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const Col = ({ children }: { children: ReactNode }) => (
  <code className="rounded px-1 py-0.5 text-xs" style={{ background: "var(--fondo-sutil, rgba(127,127,127,.12))" }}>
    {children}
  </code>
);
