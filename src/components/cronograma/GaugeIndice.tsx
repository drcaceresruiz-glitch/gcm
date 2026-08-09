import { semaforoIndice, COLOR_SEMAFORO } from "@/lib/tablero";

/**
 * Un indicador —SPI o CPI— como aguja semaforica.
 *
 * El anillo se llena en proporcion al indice (0..2, con el 1.00 justo en la
 * mitad) y se tine segun el semaforo: verde por delante, ambar rozando, rojo
 * por detras. La marca del 1.00 esta pintada aparte porque es la referencia:
 * un SPI se lee "cuanto me separo de 1", no un valor absoluto.
 *
 * Null cuando el indice no existe —sin plan no hay SPI, sin costo no hay CPI—:
 * un gauge inventado seria peor que la ausencia.
 */
export function GaugeIndice({
  indice,
  etiqueta,
  descripcion,
}: {
  indice: number | null;
  etiqueta: string;
  descripcion: string;
}) {
  const radio = 42;
  const circ = 2 * Math.PI * radio;
  const semaforo = semaforoIndice(indice);
  const color = semaforo ? COLOR_SEMAFORO[semaforo] : "var(--borde)";

  // El indice se acota a [0, 2] para el anillo; el 1.00 cae en la mitad.
  const fraccion = indice === null ? 0 : Math.min(2, Math.max(0, indice)) / 2;
  const pintado = fraccion * circ;

  return (
    <div
      className="elevacion-1 flex flex-col items-center rounded-xl border p-4"
      style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
    >
      <svg viewBox="0 0 120 120" className="h-28 w-28" role="img"
        aria-label={`${etiqueta} ${indice === null ? "no disponible" : indice.toFixed(2)}`}>
        <circle
          cx={60} cy={60} r={radio} fill="none"
          stroke="var(--borde)" strokeWidth={11}
        />
        {indice !== null && (
          <circle
            cx={60} cy={60} r={radio} fill="none"
            stroke={color} strokeWidth={11} strokeLinecap="round"
            strokeDasharray={`${pintado} ${circ - pintado}`}
            transform="rotate(-90 60 60)"
          />
        )}
        {/* La marca del 1.00 cae donde el anillo lleva la mitad: media vuelta
            (180) desde arriba, o sea abajo del todo. El relleno arranca arriba
            y crece en sentido horario, asi que fraccion 0.5 termina a las 6 en
            punto —no a las 3—. */}
        <line
          x1={60} y1={11} x2={60} y2={20}
          stroke="var(--texto)" strokeWidth={2} opacity={0.5}
          transform="rotate(180 60 60)"
        />
        <text
          x={60} y={58} textAnchor="middle" fontSize={22} fontWeight={600}
          fill={color}
        >
          {indice === null ? "—" : indice.toFixed(2)}
        </text>
        <text
          x={60} y={74} textAnchor="middle" fontSize={11}
          fill="currentColor" opacity={0.6} letterSpacing={1}
        >
          {etiqueta}
        </text>
      </svg>
      <p className="mt-1 text-center text-xs opacity-60">{descripcion}</p>
    </div>
  );
}
