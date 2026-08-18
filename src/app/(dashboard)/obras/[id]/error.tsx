"use client";

import { useParams } from "next/navigation";

import { PantallaError } from "@/components/ui/PantallaError";

/**
 * Frontera de error DENTRO de una obra.
 *
 * Es la mas util de las cuatro: al quedar por debajo del layout de la obra,
 * un fallo en el Lookahead o en el cronograma deja en pie la cabecera de la
 * obra y su lateral, asi que se puede saltar a otra seccion sin volver al
 * panel y sin perder de vista en que obra se estaba.
 *
 * Antes de esto, un servicio que reventaba se llevaba la pantalla entera por
 * delante —sin menu, sin obra, sin manera de volver que no fuera el boton de
 * atras del navegador—.
 */
export default function ErrorDeObra({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // El id sale de la ruta y no de una prop: una frontera de error no recibe
  // los params de la pagina que fallo.
  const params = useParams<{ id: string }>();

  return (
    <PantallaError
      error={error}
      reset={reset}
      volverA={`/obras/${params.id}`}
      volverTexto="Volver a la obra"
    />
  );
}
