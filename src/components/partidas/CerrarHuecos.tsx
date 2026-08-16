"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDownWideNarrow, LoaderCircle } from "lucide-react";

import { accionRenumerarPartidas } from "@/app/(dashboard)/obras/[id]/acciones";

/**
 * Cerrar los huecos que deja borrar.
 *
 * Borrar el capitulo 1 no renumera nada: quedan 2, 3, 4. Renumerar NO puede
 * ser un efecto secundario del borrado —el codigo es la llave con la que el
 * cronograma y las revisiones senalan a cada partida—, asi que se pide aparte
 * y con confirmacion.
 *
 * El servicio se niega solo si la obra tiene revision, congelada o en
 * borrador, y aborta si el costo directo cambiara. Aqui no se decide nada de
 * eso: se pregunta y se cuenta el resultado.
 */
export function CerrarHuecos({ obraId }: { obraId: string }) {
  const router = useRouter();
  const [trabajando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  function pulsar() {
    if (
      !confirm(
        "Se van a renumerar los capítulos y sus partidas para cerrar los huecos.\n\n" +
          "Los códigos cambian, y con ellos las referencias que ya hayas impreso o " +
          "enviado. Se comprueba que el costo directo no varíe.\n\n¿Seguimos?",
      )
    ) {
      return;
    }

    setAviso(null);

    iniciar(async () => {
      const r = await accionRenumerarPartidas(obraId);

      if (!r.ok) {
        setAviso({ texto: r.error ?? "No se pudo renumerar.", malo: true });
        return;
      }

      setAviso({
        texto:
          r.cambiadas === 0
            ? "No había huecos: la numeración ya estaba seguida."
            : `Listo: ${r.cambiadas} código(s) renumerado(s).`,
        malo: false,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={pulsar}
        disabled={trabajando}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--borde)" }}
      >
        {trabajando ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowDownWideNarrow className="size-4" aria-hidden="true" />
        )}
        Cerrar huecos de numeración
      </button>

      {aviso && (
        <p
          role={aviso.malo ? "alert" : "status"}
          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-pretty"
          style={{
            backgroundColor: `color-mix(in oklab, var(--color-${
              aviso.malo ? "peligro" : "exito"
            }) 15%, transparent)`,
          }}
        >
          {aviso.malo && (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
