"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ListTree, LoaderCircle } from "lucide-react";

import { accionGenerarEdt } from "@/app/(dashboard)/obras/[id]/cronograma/acciones-manual";

/**
 * Traer la EDT del presupuesto al cronograma.
 *
 * El presupuesto YA es la estructura de desglose: el capitulo es la rama, la
 * partida es el paquete de trabajo y sus subpartidas son las tareas. Teclearla
 * otra vez aqui seria escribir dos veces lo mismo y garantizar que un dia
 * discrepen.
 */
export function GenerarEdt({ obraId }: { obraId: string }) {
  const router = useRouter();
  const [trabajando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ texto: string; malo: boolean } | null>(null);

  function pulsar() {
    setAviso(null);

    iniciar(async () => {
      const r = await accionGenerarEdt(obraId);

      if (!r.ok) {
        setAviso({ texto: r.error ?? "No se pudo generar.", malo: true });
        return;
      }

      setAviso({
        texto:
          `Listo: ${r.tareas} filas, de las cuales ${r.enlazadas} quedan enlazadas ` +
          `con su partida. Ahora pon las fechas en las tareas; los paquetes y los ` +
          `capítulos las heredan.`,
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
        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-marca)" }}
      >
        {trabajando ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ListTree className="size-4" aria-hidden="true" />
        )}
        Generar la EDT desde el presupuesto
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
