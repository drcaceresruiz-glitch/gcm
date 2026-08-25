import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, Download } from "lucide-react";

import { obtenerSesion } from "@/services/sesion.service";
import { preliminaresDeEmpresa } from "@/services/preliminares.service";
import { pasosDePuestaEnMarcha } from "@/lib/puesta-en-marcha";
import { Volver } from "@/components/ui/Volver";
import { EnlaceBoton } from "@/components/ui/EnlaceBoton";

export const metadata: Metadata = { title: "Puesta en marcha" };

/**
 * La guia del primer dia: los pasos, en orden, con sus plantillas.
 *
 * NO ES UNA PANTALLA DE BIENVENIDA, y la diferencia importa porque
 * `preliminares.service` ya descarto una con razon: «se visita una vez y luego
 * estorba». Esta no se autoabre, no bloquea nada y no se puede «terminar»: es
 * una REFERENCIA a la que se vuelve con el Excel a medio llenar. Por eso el
 * unico camino hasta aqui es el enlace del «Siguiente paso» del panel, y solo
 * mientras quede algo por montar.
 *
 * Lo que aporta sobre las marcas del menu —que ya dicen CUALES faltan— son las
 * tres cosas que de verdad atascan el primer dia: en que ORDEN van, QUE hay
 * que tener a mano antes de sentarse, y DONDE esta la plantilla.
 *
 * Se enseñan TODOS los pasos, tambien los ya dados y tambien los que quien
 * mira no puede dar. Es una guia: esconder los hechos rompe la cuenta de por
 * donde vas, y esconder los ajenos hace creer que la lista es mas corta de lo
 * que es —el residente que la lea tiene que poder ver que falta pedirle algo
 * a su administrador—.
 */
export default async function PuestaEnMarchaPage() {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");

  const preliminares = await preliminaresDeEmpresa(sesion);
  const pasos = pasosDePuestaEnMarcha(preliminares);
  const hechos = pasos.filter((p) => p.hecho).length;

  return (
    <div className="space-y-6">
      <div>
        <Volver href="/panel">Volver al panel</Volver>

        <h1 className="mt-3 text-xl font-semibold">Puesta en marcha</h1>
        <p className="mt-1 max-w-3xl text-sm opacity-70 text-pretty">
          Los pasos para dejar la constructora lista, en el orden en que
          conviene darlos. Cada uno dice qué hace falta tener a mano y, si se
          carga por Excel, de dónde se descarga la plantilla. No hay prisa: se
          puede dejar a medias y volver.
        </p>
        <p className="mt-2 text-sm font-medium">
          {hechos} de {pasos.length} pasos dados.
        </p>
      </div>

      <ol className="space-y-3">
        {pasos.map(({ paso, hecho }, i) => (
          <li
            key={paso.clave}
            className="rounded-xl border p-4"
            style={{
              borderColor: "var(--borde)",
              backgroundColor: "var(--superficie)",
              // Lo hecho se apaga en vez de desaparecer: sigue contando en la
              // secuencia, pero deja de competir por la atencion con lo que
              // falta.
              opacity: hecho ? 0.6 : 1,
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs"
                    style={{
                      backgroundColor: hecho
                        ? "var(--color-marca-600)"
                        : "color-mix(in oklab, var(--color-marca-500) 16%, transparent)",
                      color: hecho ? "white" : "var(--color-marca-600)",
                    }}
                  >
                    {hecho ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {/* El NOMBRE, no el titulo: este ultimo esta redactado en
                      falta («Falta el logo») y aqui se pintan tambien los
                      pasos ya dados. Ver la cabecera de `PasoPuestaEnMarcha`. */}
                  {paso.nombre}
                </p>

                <p className="mt-2 text-sm opacity-80 text-pretty">
                  {paso.consecuencia}
                </p>

                {/* Que necesitas ANTES de sentarte. Es lo que convierte la
                    guia en algo que se puede preparar, en vez de descubrir a
                    mitad de camino que falta un dato. */}
                <p className="mt-2 text-sm opacity-70 text-pretty">
                  <strong className="font-medium opacity-100">
                    Qué necesitas:
                  </strong>{" "}
                  {paso.queNecesitas}
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {paso.plantilla && (
                  <a
                    href={paso.plantilla.href}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    {paso.plantilla.titulo}
                  </a>
                )}
                <EnlaceBoton href={paso.camino} icono={ArrowRight}>
                  {paso.accion}
                </EnlaceBoton>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-sm opacity-70 text-pretty">
        Con esto la constructora ya produce: dentro de cada obra, el cronograma,
        el Lookahead y las órdenes tienen su propia guía, y el manual explica
        cada pieza con lo que sale mal.{" "}
        <Link
          href="/manual/empezar"
          className="font-medium"
          style={{ color: "var(--color-marca-600)" }}
        >
          Abrir el manual
        </Link>
      </p>
    </div>
  );
}
