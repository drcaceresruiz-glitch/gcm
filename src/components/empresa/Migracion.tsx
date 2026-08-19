"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  Lock,
  Unlock,
  Upload,
} from "lucide-react";

import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { haceCuanto } from "@/utils/fechas";
import {
  accionCongelar,
  accionDescongelar,
  type EstadoMigracionUi,
} from "@/app/(dashboard)/empresa/migracion/acciones";
import { MINIMO_FRASE } from "@/lib/respaldo-migracion";

/**
 * Llevarse la constructora entera a otra instalacion.
 *
 * SON DOS PASOS Y SE ENSENAN COMO DOS, no como un boton que hace magia: hasta
 * que la empresa no esta congelada, exportar no puede dar un archivo
 * coherente. Ensenar el boton de descarga siempre y que fallara con un texto
 * seria pedirle al usuario que descubra el orden probando.
 *
 * LA FRASE ES EL PUNTO DELICADO y por eso se dice tres veces con distintas
 * palabras: GCM no la guarda, no la puede recuperar, y sin ella el archivo no
 * vale en destino. Es la unica parte de este flujo que no tiene vuelta atras.
 */

function Boton({
  children,
  variante = "principal",
}: {
  children: React.ReactNode;
  variante?: "principal" | "suave";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
      style={
        variante === "principal"
          ? { backgroundColor: "var(--color-marca-600)", color: "white" }
          : { border: "1px solid var(--borde)" }
      }
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Mensaje({ estado }: { estado: EstadoMigracionUi }) {
  if (!estado.error && !estado.ok) return null;

  const malo = Boolean(estado.error);
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: `color-mix(in oklab, ${
          malo ? "var(--color-peligro)" : "var(--color-marca-500)"
        } 10%, transparent)`,
      }}
    >
      {malo ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span>{estado.error ?? estado.ok}</span>
    </p>
  );
}

export function Migracion({
  enMigracion,
  desde,
  destino,
}: {
  enMigracion: boolean;
  desde: Date | null;
  /// Si esta empresa puede RECIBIR una constructora, y por que no.
  destino: { vacia: boolean; motivo: string | null };
}) {
  const [congelar, hacerCongelar] = useActionState(accionCongelar, {});
  const [descongelar, hacerDescongelar] = useActionState(
    accionDescongelar,
    {},
  );

  return (
    <div className="space-y-6">
      <Tarjeta>
        <SeccionTarjeta
          titulo="Paso 1 · Congelar la empresa"
          nota="Mientras dure, nadie de tu constructora puede registrar nada: ni avances, ni órdenes, ni pagos, ni usuarios nuevos. Sí pueden entrar y mirar."
          primera
        >
          {enMigracion ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm">
                <Lock className="size-4 shrink-0" aria-hidden />
                <span>
                  Congelada{" "}
                  {desde ? <strong>{haceCuanto(desde)}</strong> : null}.
                </span>
              </p>

              {/* La fecha, y no solo el estado: un congelado que alguien dejo
                  puesto ayer se ve igual que uno de hace un minuto si no se
                  dice desde cuando, y solo uno de los dos es normal. */}
              <p className="text-sm opacity-70">
                Tu equipo no puede trabajar mientras esté así. Descongélala en
                cuanto tengas el archivo descargado y comprobado.
              </p>

              <form action={hacerDescongelar}>
                <Boton variante="suave">
                  <Unlock className="size-4" aria-hidden />
                  Descongelar y volver al trabajo
                </Boton>
              </form>
              <Mensaje estado={descongelar} />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm opacity-70">
                Hazlo cuando nadie esté trabajando: al final de la jornada o un
                domingo. Si lo haces a media mañana, paras la obra.
              </p>

              <form action={hacerCongelar}>
                <Boton>
                  <Lock className="size-4" aria-hidden />
                  Congelar la empresa
                </Boton>
              </form>
              <Mensaje estado={congelar} />
            </div>
          )}
        </SeccionTarjeta>
      </Tarjeta>

      <Tarjeta>
        <SeccionTarjeta
          titulo="Paso 2 · Descargar el archivo"
          nota="Un solo .zip con tu constructora entera: tu gente, tus contratistas, tus obras con presupuesto, cronograma, avances, pagos y fotos."
          primera
        >
          {!enMigracion ? (
            <p className="text-sm opacity-70">
              Primero congela la empresa. Mientras sus obras siguen cambiando,
              el archivo saldría con las partidas de un momento y los pagos de
              otro, y eso no se nota hasta que ya estás en la instalación
              nueva.
            </p>
          ) : (
            /**
             * Formulario HTML normal, sin `useActionState`: la respuesta es el
             * zip. Una accion de servidor devolveria el archivo por el payload
             * de React, donde no caben cientos de MB.
             */
            <form
              method="post"
              action="/empresa/migracion/exportar"
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="frase"
                  className="block text-sm font-medium"
                >
                  Frase que protege el archivo
                </label>
                <input
                  id="frase"
                  name="frase"
                  type="text"
                  required
                  minLength={MINIMO_FRASE}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="una frase que recuerdes, de al menos 12 letras"
                  className="mt-1 w-full max-w-md rounded-lg px-3 py-2 text-sm"
                  style={{ border: "1px solid var(--borde)" }}
                />
                {/* En claro y no como campo de contrasena, a proposito: hay
                    que teclearla igual en la otra instalacion, y un campo con
                    puntitos hace que se escriba mal sin poder comprobarlo. */}
                <p className="mt-2 max-w-md text-sm opacity-70">
                  Quien reciba el archivo tendrá que teclear esta misma frase
                  para abrirlo. Dísela por teléfono o en persona, no dentro del
                  mismo correo que lleva el archivo.
                </p>
              </div>

              <p
                className="max-w-md rounded-lg px-3 py-2 text-sm"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, var(--color-peligro) 10%, transparent)",
                }}
              >
                <strong>GCM no guarda esta frase.</strong> No podemos
                recuperarla ni verla. Si se pierde, el archivo ya no se puede
                dar por bueno en destino y habrá que exportar otra vez.
              </p>

              <Boton>
                <Download className="size-4" aria-hidden />
                Descargar el archivo
              </Boton>
            </form>
          )}
        </SeccionTarjeta>
      </Tarjeta>

      <Tarjeta>
        <SeccionTarjeta
          titulo="Traer una constructora de otra instalación"
          nota="El otro sentido: meter aquí el archivo que salió de otra instalación de GCM."
          primera
        >
          {!destino.vacia ? (
            /* El motivo sale del MISMO servicio que rechazaria la
               importacion: si la pantalla dijera una cosa y el servicio otra,
               la gente probaria a importar para averiguar cual manda. */
            <p className="max-w-md text-sm opacity-70">
              {destino.motivo ??
                "Esta empresa no puede recibir una migración ahora mismo."}
            </p>
          ) : (
            <form
              method="post"
              action="/empresa/migracion/importar"
              encType="multipart/form-data"
              className="space-y-4"
            >
              <div>
                <label htmlFor="archivo" className="block text-sm font-medium">
                  El archivo .zip
                </label>
                <input
                  id="archivo"
                  name="archivo"
                  type="file"
                  accept=".zip"
                  required
                  className="mt-1 w-full max-w-md text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="frase-importar"
                  className="block text-sm font-medium"
                >
                  La frase que te dieron con él
                </label>
                <input
                  id="frase-importar"
                  name="frase"
                  type="text"
                  required
                  minLength={MINIMO_FRASE}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 w-full max-w-md rounded-lg px-3 py-2 text-sm"
                  style={{ border: "1px solid var(--borde)" }}
                />
                <p className="mt-2 max-w-md text-sm opacity-70">
                  Sin la frase exacta el archivo no se puede dar por bueno. No
                  la tenemos nosotros: la eligió quien exportó.
                </p>
              </div>

              <p className="max-w-md text-sm opacity-70">
                Esto puede tardar varios minutos si la constructora trae muchas
                obras y fotos. No cierres la pestaña.
              </p>

              <Boton>
                <Upload className="size-4" aria-hidden />
                Traer la constructora
              </Boton>
            </form>
          )}
        </SeccionTarjeta>
      </Tarjeta>
    </div>
  );
}
