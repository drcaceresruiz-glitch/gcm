"use client";

import { createContext, useContext } from "react";
import { Lock } from "lucide-react";
import { motivoNoAdmiteCambios, type ObraParaEscribir } from "@/lib/obras";

/**
 * Si en esta obra se puede escribir, para las pantallas de dentro.
 *
 * NACE DE UN FALLO CONCRETO, visto el 24 de agosto de 2026 recorriendo una
 * obra ya cerrada: `/proveedores` seguia ofreciendo «Valorizar», «Cerrar» y
 * «Anular», y `/valorizaciones` ofrecia «Registrar pago». Los servicios los
 * rechazaban -eso funciona-, pero es justo lo que el codigo de esa misma
 * tarjeta condena tres lineas mas arriba hablando del boton Anular: «un boton
 * que siempre falla invita a probar».
 *
 * La causa era que el criterio existia solo en el servidor. `obraAdmiteCambios`
 * dice en su propio comentario que se declara en logica pura «para que el mismo
 * criterio valga en la pantalla y en el servidor», y en la pantalla NO lo usaba
 * nadie: once servicios y cero componentes.
 *
 * Esto es la mitad que faltaba. El layout de la obra resuelve el estado una
 * vez -sin una consulta de mas: los dos campos que hacian falta viajan ya en
 * `obtenerObra`- y cualquier componente de dentro lo lee sin volver a
 * preguntar.
 *
 * **La comprobacion que MANDA sigue siendo la del servidor.** Esto no es una
 * defensa: es cortesia. Un componente que se olvide de usarlo ensena un boton
 * de mas, no abre un agujero.
 */
const Contexto = createContext<ObraParaEscribir | null>(null);

export function ProveedorEscritura({
  obra,
  children,
}: {
  obra: ObraParaEscribir;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={obra}>{children}</Contexto.Provider>;
}

/**
 * Por que no se puede escribir aqui, o `null` si si se puede.
 *
 * Devuelve el MOTIVO y no un booleano por lo mismo que la version del
 * servidor: los tres casos -cerrada, archivada, empresa congelada- se
 * explican distinto y quien se topa con ellos necesita saber en cual esta.
 *
 * Las `opciones` se pasan tal cual a `motivoNoAdmiteCambios`, y son las
 * MISMAS que usa la escritura correspondiente en el servidor. Importa
 * acertarlas: una obra PARALIZADA admite seguir cerrando lo que ya estaba en
 * curso aunque no admita abrir trabajo nuevo, asi que un componente que
 * esconda con el default restrictivo lo que el servidor si dejaria pasar
 * estaria quitando una funcion que existe. Ante la duda, mirar que pasa el
 * servicio que hay al otro lado del boton.
 *
 * Fuera del layout de la obra devuelve `null` -se puede escribir-: un
 * componente reutilizado en una pantalla sin obra no debe quedarse mudo.
 */
export function useMotivoSinEscritura(
  opciones: { permiteEnParalizada?: boolean } = {},
): string | null {
  const obra = useContext(Contexto);
  if (!obra) return null;
  return motivoNoAdmiteCambios(obra, opciones);
}

/**
 * El cartel que sustituye a los botones escondidos.
 *
 * Se ensena EN LUGAR de los controles, no ademas: esconderlos sin decir nada
 * deja a quien busca el boton pensando que se ha perdido, y es la queja que
 * origino todo esto pero al reves.
 */
export function SinEscritura({ motivo }: { motivo: string }) {
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs"
      style={{ borderColor: "var(--borde)", opacity: 0.75 }}
    >
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {motivo}
    </p>
  );
}

/**
 * El cartel, UNA vez por pantalla, puesto donde se lea antes de buscar.
 *
 * Los controles escondidos no llevan cartel cada uno: en una lista de quince
 * encargos serian quince veces la misma frase. Va este arriba y los controles
 * simplemente no se ofrecen.
 *
 * Es un componente aparte y no un `if` en cada pagina porque las paginas son
 * de servidor y el estado vive en un contexto de cliente.
 */
export function AvisoSinEscritura({
  opciones = {},
}: {
  /// Las mismas que usa la escritura de esta pantalla en el servidor.
  opciones?: { permiteEnParalizada?: boolean };
}) {
  const motivo = useMotivoSinEscritura(opciones);
  if (!motivo) return null;
  return <SinEscritura motivo={motivo} />;
}

/**
 * Envoltorio para esconder un control desde una pagina de SERVIDOR.
 *
 * Las paginas de la obra son de servidor y el estado vive en un contexto de
 * cliente, asi que no pueden preguntar con el hook. Esto les deja envolver el
 * boton y ya: `<SiSePuedeEscribir><Link…>Nuevo encargo</Link></SiSePuedeEscribir>`.
 *
 * Cuesta un componente de cliente vacio en el arbol y ahorra una consulta por
 * pantalla, que es el intercambio bueno: el dato ya esta resuelto arriba.
 */
export function SiSePuedeEscribir({
  opciones = {},
  children,
}: {
  /// Las mismas que usa la escritura de este boton en el servidor.
  opciones?: { permiteEnParalizada?: boolean };
  children: React.ReactNode;
}) {
  const motivo = useMotivoSinEscritura(opciones);
  if (motivo) return null;
  return <>{children}</>;
}
