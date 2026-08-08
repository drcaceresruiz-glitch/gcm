/**
 * Ilustracion de un plano de obra.
 *
 * Es SVG en linea y no una fotografia a proposito: `public/` esta vacio y no
 * hay infraestructura de subida de archivos, pero ademas un vector no cuesta
 * ninguna peticion, se ve nitido en cualquier pantalla y —lo que importa
 * aqui— toma el color de la paleta activa, asi que cambia con ella.
 *
 * Decorativa: `aria-hidden`, porque no aporta nada que no diga el texto de al
 * lado, y `print:hidden`.
 */
export function IlustracionPlano() {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      aria-hidden="true"
      className="w-full print:hidden"
      style={{ color: "var(--color-marca-500)" }}
    >
      {/* Retícula del plano, muy tenue: es el papel milimetrado del fondo. */}
      <g stroke="currentColor" strokeWidth="0.5" opacity="0.18">
        {Array.from({ length: 11 }, (_, i) => (
          <line key={`v${i}`} x1={i * 24} y1="0" x2={i * 24} y2="160" />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 24} x2="240" y2={i * 24} />
        ))}
      </g>

      {/* Planta: muros exteriores y dos divisiones interiores. */}
      <g stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <rect x="42" y="38" width="156" height="90" rx="2" />
        <line x1="112" y1="38" x2="112" y2="88" />
        <line x1="112" y1="88" x2="198" y2="88" />
      </g>

      {/* Relleno de una estancia, para que la planta no sea solo contorno. */}
      <rect
        x="44"
        y="90"
        width="66"
        height="36"
        fill="currentColor"
        opacity="0.1"
      />

      {/* Hueco de puerta: el corte en el muro es lo que hace que se lea como
          un plano y no como una caja. */}
      <line
        x1="70"
        y1="128"
        x2="94"
        y2="128"
        stroke="var(--superficie)"
        strokeWidth="4"
      />
      <path
        d="M70 128 A 24 24 0 0 1 94 128"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.5"
      />

      {/* Cotas: dos lineas con sus topes, como en un plano acotado. */}
      <g stroke="currentColor" strokeWidth="1.2" opacity="0.55">
        <line x1="42" y1="26" x2="198" y2="26" />
        <line x1="42" y1="21" x2="42" y2="31" />
        <line x1="198" y1="21" x2="198" y2="31" />
        <line x1="212" y1="38" x2="212" y2="128" />
        <line x1="207" y1="38" x2="217" y2="38" />
        <line x1="207" y1="128" x2="217" y2="128" />
      </g>
    </svg>
  );
}
