"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Eye, LoaderCircle } from "lucide-react";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import {
  accionCambiarVistaPreviaRoles,
  type EstadoVistaPreviaRoles,
} from "@/app/(dashboard)/acciones";

function Boton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
      style={{ borderColor: "var(--borde)" }}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Mensaje({ estado }: { estado: EstadoVistaPreviaRoles }) {
  if (!estado.error && !estado.ok) return null;
  const malo = Boolean(estado.error);
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: `color-mix(in oklab, ${
          malo ? "var(--color-peligro)" : "var(--color-marca-500)"
        } 14%, transparent)`,
      }}
    >
      {malo ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span className="text-pretty">{estado.error ?? estado.ok}</span>
    </p>
  );
}

/**
 * El interruptor de la vista previa de roles: quien puede usarla, y que se
 * rompe si se apaga.
 *
 * Apagado por defecto en toda empresa nueva. No es una casilla de "modo
 * avanzado" sin mas: es lo que le deja a UNA cuenta ADMIN ver la app como
 * la verian los demas roles sin tener que dar de alta una cuenta por cada
 * uno, y por eso vale la pena explicar para que sirve, no solo que hace.
 */
export function VistaPreviaRoles({ activa }: { activa: boolean }) {
  const [estado, cambiar] = useActionState(accionCambiarVistaPreviaRoles, {});

  return (
    <Tarjeta>
      <SeccionTarjeta
        primera
        titulo="Vista previa de roles"
        nota="Deja que una cuenta Administrador vea GCM como lo veria otro rol, sin salir de su cuenta ni dar de alta una nueva."
      >
        <p className="flex items-start gap-2 text-sm opacity-70">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-pretty">
            {activa
              ? "Encendida: cualquier cuenta Administrador puede elegir \"Ver como\" desde el menu de su cuenta, arriba a la derecha."
              : "Apagada: nadie puede previsualizar otro rol. Es lo habitual con un equipo ya formado, donde cada quien entra con su propio usuario."}
          </span>
        </p>

        <p className="mt-2 text-sm text-pretty opacity-70">
          Util para empezar con un equipo chico —la misma persona puede ser
          administrador y gerente sin dos cuentas— y para que el
          administrador compruebe que cada rol ve lo que debe antes de dar
          de alta a nadie. La vista previa nunca ensena mas de lo que la
          cuenta real ya alcanza: recorta, nunca amplia.
        </p>

        <form action={cambiar} className="mt-4">
          <input type="hidden" name="activar" value={activa ? "0" : "1"} />
          <Boton>{activa ? "Apagar" : "Encender"}</Boton>
        </form>

        <Mensaje estado={estado} />
      </SeccionTarjeta>
    </Tarjeta>
  );
}
