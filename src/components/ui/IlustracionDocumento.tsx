/**
 * Ilustracion del documento que recibe el proveedor.
 *
 * Acompana a los datos de la empresa, y su razon de ser es que ahi se toca
 * algo que **sale impreso a un tercero**: la hoja con su membrete y su firma
 * dice eso mejor que un parrafo.
 *
 * SVG en linea, sin peticion ni archivo, y toma el color de la paleta.
 */
export function IlustracionDocumento() {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      aria-hidden="true"
      className="w-full print:hidden"
      style={{ color: "var(--color-marca-500)" }}
    >
      {/* La hoja. */}
      <rect
        x="52"
        y="14"
        width="136"
        height="132"
        rx="3"
        fill="var(--superficie)"
        stroke="currentColor"
        strokeWidth="2"
      />

      {/* Membrete: el bloque solido es la razon social y el recuadro de la
          derecha, el numero de la orden. */}
      <rect x="66" y="28" width="58" height="7" rx="2" fill="currentColor" />
      <rect
        x="66"
        y="40"
        width="40"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.4"
      />
      <rect
        x="136"
        y="26"
        width="38"
        height="22"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.7"
      />

      <line
        x1="66"
        y1="58"
        x2="174"
        y2="58"
        stroke="currentColor"
        strokeWidth="1.5"
      />

      {/* Tabla de lineas de la orden. */}
      <g opacity="0.3">
        {[68, 80, 92, 104].map((y) => (
          <rect key={y} x="66" y={y} width="108" height="5" rx="2" fill="currentColor" />
        ))}
      </g>

      {/* Total, marcado. */}
      <rect x="126" y="116" width="48" height="8" rx="2" fill="currentColor" />

      {/* La firma: es lo que falta si no hay representante legal. */}
      <path
        d="M70 136 C 78 128, 84 142, 92 134 S 104 128, 112 136"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.75"
      />
      <line
        x1="66"
        y1="141"
        x2="118"
        y2="141"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.45"
      />
    </svg>
  );
}
