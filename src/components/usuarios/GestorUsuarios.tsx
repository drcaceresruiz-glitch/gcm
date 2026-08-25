"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  accionCrearUsuario,
  accionEditarUsuario,
  accionCambiarEstado,
  accionResetearClave,
  accionEliminarUsuario,
  accionDesactivarDosFactores,
  type EstadoUsuarios,
} from "@/app/(dashboard)/empresa/usuarios/acciones";
import type { UsuarioLista } from "@/services/usuarios.service";
import { ETIQUETA_ROL, DESCRIPCION_ROL, correoValido } from "@/lib/usuarios";
import { TIPOS_DOC, ETIQUETA_TIPO_DOC, validarDocumento } from "@/lib/perfil";
import { ROLES } from "@/lib/rbac";
import { Chip } from "@/components/ui/Chip";
import { Tarjeta, SeccionTarjeta } from "@/components/ui/Tarjeta";
import { CampoTexto } from "@/components/auth/CampoTexto";
import {
  ChecklistRequisitos,
  todosCumplidos,
  type Requisito,
} from "@/components/ui/ChecklistRequisitos";
import type { Role } from "@/generated/prisma/enums";

/**
 * Gestion de usuarios: alta, edicion, activar/desactivar y resetear clave.
 *
 * La clave temporal —al crear o resetear— se muestra UNA vez en un recuadro
 * destacado con boton de copiar: no hay correo configurado todavia, asi que el
 * admin la comunica a mano. Cuando exista el envio, ademas saldra por correo.
 */
/**
 * QUE PUEDE HACER QUIEN MIRA, y no solo si puede mirar.
 *
 * La pantalla entraba con `usuario:leer` y luego pintaba TODOS los botones:
 * «Nuevo usuario», «Editar», «Resetear clave», «Desactivar» y «Eliminar»,
 * sobre cada persona de la empresa y sin comprobar nada mas. Un residente
 * -que tiene `usuario:leer` y ninguno de los otros cuatro- veia el boton de
 * resetearle la clave al administrador.
 *
 * El servidor los rechazaba, asi que no habia escalada; pero es justo lo que
 * el resto del codigo condena: un boton que siempre falla invita a probar, y
 * este ademas asusta. Visto el 25 de agosto de 2026 recorriendo la aplicacion
 * con una sesion de residente de verdad.
 */
export interface PuedeConUsuarios {
  crear: boolean;
  editar: boolean;
  desactivar: boolean;
  resetearClave: boolean;
}

export function GestorUsuarios({
  usuarios,
  puede,
}: {
  usuarios: UsuarioLista[];
  puede: PuedeConUsuarios;
}) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {puede.crear && (
        <button
          type="button"
          onClick={() => setCreando((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--color-marca-600)" }}
        >
          {creando ? <X className="size-4" /> : <Plus className="size-4" />}
          {creando ? "Cerrar" : "Nuevo usuario"}
        </button>
        )}
      </div>

      {creando && puede.crear && <PanelAlta alCerrar={() => setCreando(false)} />}

      <ul className="space-y-3">
        {usuarios.map((u) => (
          <FilaUsuario key={u.id} usuario={u} puede={puede} />
        ))}
      </ul>
    </div>
  );
}

// --- Alta -------------------------------------------------------------------

function PanelAlta({ alCerrar }: { alCerrar: () => void }) {
  const [estado, accion] = useActionState<EstadoUsuarios, FormData>(
    accionCrearUsuario,
    {},
  );

  // Los campos siguen sueltos (defaultValue); para el semaforo basta con
  // escuchar los cambios a nivel de formulario y releer sus valores. Asi no
  // hay que controlar cada input ni tocar los selects compartidos.
  const [vals, setVals] = useState({
    nombres: "",
    apellidos: "",
    email: "",
    tipoDoc: "DNI",
    numDoc: "",
  });

  function alCambiar(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    setVals({
      nombres: String(fd.get("nombres") ?? ""),
      apellidos: String(fd.get("apellidos") ?? ""),
      email: String(fd.get("email") ?? ""),
      tipoDoc: String(fd.get("tipoDoc") ?? "DNI"),
      numDoc: String(fd.get("numDoc") ?? ""),
    });
  }

  // Los mismos criterios que valida el servidor, campo a campo.
  const requisitos: Requisito[] = [
    { etiqueta: "Nombres", cumplido: vals.nombres.trim().length > 0 },
    { etiqueta: "Apellidos", cumplido: vals.apellidos.trim().length > 0 },
    { etiqueta: "Correo válido", cumplido: correoValido(vals.email) },
    {
      etiqueta: "Documento válido para su tipo",
      cumplido: validarDocumento(vals.tipoDoc, vals.numDoc).ok,
    },
  ];
  const listo = todosCumplidos(requisitos);

  // Creado con exito: se muestra la clave y se oculta el formulario, para que
  // el foco quede en apuntar la clave y no en volver a rellenar campos.
  if (estado.ok && estado.claveTemporal) {
    return (
      <Tarjeta>
        <div className="p-5">
          <BannerClave estado={estado} />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={alCerrar}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--color-marca-600)" }}
            >
              Listo
            </button>
          </div>
        </div>
      </Tarjeta>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
      <form action={accion} onChange={alCambiar}>
        <Tarjeta>
          <SeccionTarjeta
            titulo="Nuevo usuario"
            nota="Nace con una clave temporal que deberá cambiar en su primer acceso. El rol trae sus permisos ya configurados."
            primera
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto id="nombres" name="nombres" etiqueta="Nombres" required maxLength={100} />
              <CampoTexto id="apellidos" name="apellidos" etiqueta="Apellidos" required maxLength={100} />
            </div>

            <CampoTexto
              id="email"
              name="email"
              type="email"
              etiqueta="Correo"
              ayuda="Será su usuario de acceso. Después solo lo puede cambiar un administrador, desde aquí mismo."
              required
              maxLength={150}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectorTipoDoc actual="DNI" />
              <CampoTexto id="numDoc" name="numDoc" etiqueta="Número de documento" required maxLength={20} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto id="cargo" name="cargo" etiqueta="Cargo" ayuda="Opcional." maxLength={100} />
              <CampoTexto id="celular" name="celular" type="tel" etiqueta="Celular" ayuda="Opcional." maxLength={30} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* La colegiatura la pide el PAPEL: un presupuesto o un informe
                  firmados por el residente la llevan debajo del nombre. */}
              <CampoTexto
                id="colegiatura"
                name="colegiatura"
                etiqueta="Colegiatura (CAP, CIP)"
                ayuda="Opcional. Sale en los documentos que firma."
                maxLength={30}
              />
            </div>

            <SelectorRol actual="CONSULTOR" />
          </SeccionTarjeta>

          {estado.error && <BannerError mensaje={estado.error} />}

          <div className="mt-6 flex gap-2 border-t pt-5" style={{ borderColor: "var(--borde)" }}>
            <BotonEnviar icono={<UserPlus className="size-4" />} bloqueado={!listo}>
              Crear usuario
            </BotonEnviar>
            <button
              type="button"
              onClick={alCerrar}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ borderColor: "var(--borde)" }}
            >
              Cancelar
            </button>
          </div>
        </Tarjeta>
      </form>

      <div className="lg:sticky lg:top-24">
        <ChecklistRequisitos requisitos={requisitos} titulo="Para crear el usuario" />
      </div>
    </div>
  );
}

// --- Fila de usuario --------------------------------------------------------

function FilaUsuario({
  usuario,
  puede,
}: {
  usuario: UsuarioLista;
  puede: PuedeConUsuarios;
}) {
  const [editando, setEditando] = useState(false);
  const inactivo = usuario.estado !== "ACTIVO";

  return (
    <li>
      <Tarjeta>
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">
                  {usuario.nombres} {usuario.apellidos}
                </h2>
                <Chip tono={usuario.role === "ADMIN" ? "curso" : "neutro"}>
                  {ETIQUETA_ROL[usuario.role as Role] ?? usuario.role}
                </Chip>
                {inactivo && <Chip tono="peligro">Inactivo</Chip>}
                {usuario.esYo && <Chip tono="neutro">Tú</Chip>}
              </div>
              <p className="mt-1 text-xs opacity-70">{usuario.email}</p>
              <p className="mt-0.5 text-xs opacity-60">
                {usuario.tipoDoc} {usuario.numDoc}
                {usuario.cargo && ` · ${usuario.cargo}`}
                {usuario.celular && ` · ${usuario.celular}`}
              </p>
            </div>

            {/* Cada control con SU permiso, no con el de entrar a la
                pantalla. Ver la cabecera de `PuedeConUsuarios`. */}
            {!editando && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {puede.editar && (
                  <button
                    type="button"
                    onClick={() => setEditando(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: "var(--borde)" }}
                  >
                    <Pencil className="size-3.5" /> Editar
                  </button>
                )}
                {/* El reseteo es para OTROS: genera clave temporal y cierra
                    sesiones. Para la propia clave esta "Cambiar clave". */}
                {puede.resetearClave && !usuario.esYo && <FormReset usuario={usuario} />}
                {/* Rescate: solo si la tiene encendida y no es uno mismo. La
                  propia se apaga desde "Mi perfil". Va con `editar`, que es lo
                  que exige `desactivarDosFactoresUsuario`. */}
                {puede.editar && !usuario.esYo && usuario.dosFactoresActivo && (
                  <FormDosFactores usuario={usuario} />
                )}
                {/* Nadie se desactiva a si mismo: no se ofrece el boton. */}
                {puede.desactivar && !usuario.esYo && (
                  <FormEstado usuario={usuario} inactivo={inactivo} />
                )}
                {/* Eliminar: nunca al administrador principal ni a uno mismo.
                    Va con `desactivar`, que es lo que exige el servicio. */}
                {puede.desactivar && !usuario.esYo && !usuario.esPrincipal && (
                  <FormEliminar usuario={usuario} />
                )}
              </div>
            )}
          </div>

          {editando && (
            <FormEdicion usuario={usuario} alCerrar={() => setEditando(false)} />
          )}
        </div>
      </Tarjeta>
    </li>
  );
}

function FormEdicion({
  usuario,
  alCerrar,
}: {
  usuario: UsuarioLista;
  alCerrar: () => void;
}) {
  const [estado, accion] = useActionState<EstadoUsuarios, FormData>(
    accionEditarUsuario,
    {},
  );

  return (
    <form action={accion} className="mt-4 border-t pt-4" style={{ borderColor: "var(--borde)" }}>
      <input type="hidden" name="id" value={usuario.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTexto id={`n-${usuario.id}`} name="nombres" etiqueta="Nombres" defaultValue={usuario.nombres} required maxLength={100} />
        <CampoTexto id={`a-${usuario.id}`} name="apellidos" etiqueta="Apellidos" defaultValue={usuario.apellidos} required maxLength={100} />
      </div>

      {/* El correo se edita AQUI y no en «Mi perfil»: es el identificador de
          acceso, y quien perdio el buzon no puede entrar a cambiarlo. Por eso
          lo cambia un administrador, no cada uno. */}
      <div className="mt-4">
        <CampoTexto
          id={`e-${usuario.id}`}
          name="email"
          type="email"
          etiqueta="Correo"
          ayuda="Es su usuario de acceso. Si lo cambias, se cerrarán sus sesiones y tendrá que entrar con el nuevo."
          defaultValue={usuario.email}
          required
          maxLength={150}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SelectorTipoDoc actual={usuario.tipoDoc} id={`td-${usuario.id}`} />
        <CampoTexto id={`nd-${usuario.id}`} name="numDoc" etiqueta="Número de documento" defaultValue={usuario.numDoc} required maxLength={20} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <CampoTexto id={`c-${usuario.id}`} name="cargo" etiqueta="Cargo" defaultValue={usuario.cargo ?? ""} maxLength={100} />
        <CampoTexto
          id={`col-${usuario.id}`}
          name="colegiatura"
          etiqueta="Colegiatura (CAP, CIP)"
          ayuda="Sale en los documentos que firma."
          defaultValue={usuario.colegiatura ?? ""}
          maxLength={30}
        />
        <CampoTexto id={`cel-${usuario.id}`} name="celular" type="tel" etiqueta="Celular" defaultValue={usuario.celular ?? ""} maxLength={30} />
      </div>

      <div className="mt-4">
        <SelectorRol
          actual={usuario.role as Role}
          id={`r-${usuario.id}`}
          // El propio usuario no puede cambiar su rol: se bloquea el selector.
          bloqueado={usuario.esYo}
        />
        {usuario.esYo && (
          <p className="mt-1 text-xs opacity-60">
            No puedes cambiar tu propio rol. Pídeselo a otro administrador.
          </p>
        )}
      </div>

      {estado.error && <BannerError mensaje={estado.error} />}
      {estado.ok && <BannerOk mensaje={estado.ok} />}

      <div className="mt-5 flex gap-2 border-t pt-4" style={{ borderColor: "var(--borde)" }}>
        <BotonEnviar>Guardar cambios</BotonEnviar>
        <button
          type="button"
          onClick={alCerrar}
          className="rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          Cerrar
        </button>
      </div>
    </form>
  );
}

function FormReset({ usuario }: { usuario: UsuarioLista }) {
  const [estado, accion] = useActionState<EstadoUsuarios, FormData>(
    accionResetearClave,
    {},
  );

  if (estado.ok && estado.claveTemporal) {
    return (
      <div className="w-full">
        <BannerClave estado={estado} />
      </div>
    );
  }

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={usuario.id} />
      <input type="hidden" name="email" value={usuario.email} />
      <BotonMini icono={<KeyRound className="size-3.5" />} confirmar="¿Resetear la clave de este usuario? Se cerrarán sus sesiones.">
        Resetear clave
      </BotonMini>
    </form>
  );
}

/**
 * Solo aparece cuando ese usuario tiene la verificacion encendida, y solo
 * apaga. Encenderla es cosa de cada uno desde su perfil: hacerselo a otro
 * empezaria a mandarle codigos a un buzon que quiza no controla.
 */
function FormDosFactores({ usuario }: { usuario: UsuarioLista }) {
  const [estado, accion] = useActionState<EstadoUsuarios, FormData>(
    accionDesactivarDosFactores,
    {},
  );

  if (estado.error) {
    return (
      <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
        {estado.error}
      </span>
    );
  }

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={usuario.id} />
      <BotonMini
        icono={<ShieldOff className="size-3.5" />}
        confirmar={`¿Apagar la verificación en dos pasos de ${usuario.nombres} ${usuario.apellidos}? Hazlo solo si perdió el acceso a su correo: volverá a entrar con la clave sola.`}
      >
        Apagar 2FA
      </BotonMini>
    </form>
  );
}

function FormEliminar({ usuario }: { usuario: UsuarioLista }) {
  const [estado, accion] = useActionState<EstadoUsuarios, FormData>(
    accionEliminarUsuario,
    {},
  );

  // Si falla (p. ej. era el ultimo admin), se muestra el motivo en linea.
  if (estado.error) {
    return (
      <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
        {estado.error}
      </span>
    );
  }

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={usuario.id} />
      <BotonMini
        icono={<Trash2 className="size-3.5" />}
        peligro
        confirmar={`¿Eliminar a ${usuario.nombres} ${usuario.apellidos} de forma definitiva? Esta acción no se puede deshacer. Lo que haya firmado se conserva.`}
      >
        Eliminar
      </BotonMini>
    </form>
  );
}

function FormEstado({ usuario, inactivo }: { usuario: UsuarioLista; inactivo: boolean }) {
  const [estado, accion] = useActionState<EstadoUsuarios, FormData>(
    accionCambiarEstado,
    {},
  );

  return (
    <form action={accion}>
      <input type="hidden" name="id" value={usuario.id} />
      <input type="hidden" name="activar" value={inactivo ? "1" : "0"} />
      {estado.error ? (
        <span className="text-xs" style={{ color: "var(--color-peligro)" }}>
          {estado.error}
        </span>
      ) : (
        <BotonMini
          icono={inactivo ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          confirmar={
            inactivo
              ? undefined
              : "¿Desactivar este usuario? No podrá iniciar sesión y se cerrarán las suyas."
          }
        >
          {inactivo ? "Activar" : "Desactivar"}
        </BotonMini>
      )}
    </form>
  );
}

// --- Selectores -------------------------------------------------------------

function SelectorTipoDoc({ actual, id = "tipoDoc" }: { actual: string; id?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        Tipo de documento
      </label>
      <select
        id={id}
        name="tipoDoc"
        defaultValue={actual}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        {!TIPOS_DOC.includes(actual as (typeof TIPOS_DOC)[number]) && (
          <option value={actual}>{actual}</option>
        )}
        {TIPOS_DOC.map((t) => (
          <option key={t} value={t}>
            {ETIQUETA_TIPO_DOC[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

function SelectorRol({
  actual,
  id = "role",
  bloqueado = false,
}: {
  actual: Role;
  id?: string;
  bloqueado?: boolean;
}) {
  const [role, setRole] = useState<Role>(actual);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        Rol
      </label>
      <select
        id={id}
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        disabled={bloqueado}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-60"
        style={{ borderColor: "var(--borde)", backgroundColor: "var(--fondo)" }}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ETIQUETA_ROL[r]}
          </option>
        ))}
      </select>
      {/* El rol trae sus permisos ya configurados: se explica cual es cada
          uno para que la eleccion no sea a ciegas. */}
      <p className="text-xs opacity-60">{DESCRIPCION_ROL[role]}</p>
    </div>
  );
}

// --- Banners y botones ------------------------------------------------------

function BannerClave({ estado }: { estado: EstadoUsuarios }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-exito)",
        backgroundColor: "color-mix(in oklab, var(--color-exito) 12%, transparent)",
      }}
    >
      <p className="text-sm font-medium">{estado.ok}</p>
      <p className="mt-1 text-xs opacity-70">
        {estado.correoEnviado
          ? `Se envió por correo a ${estado.usuarioClave}. Si quieres, también puedes comunicársela: no volverá a mostrarse.`
          : `Anota o copia esta clave temporal y comunícala a ${estado.usuarioClave} (el correo no está configurado). No volverá a mostrarse.`}
        {" "}La deberá cambiar en su primer acceso.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code
          className="flex-1 rounded-lg border px-3 py-2 font-mono text-sm tracking-wider"
          style={{ borderColor: "var(--borde)", backgroundColor: "var(--superficie)" }}
        >
          {estado.claveTemporal}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(estado.claveTemporal ?? "");
            setCopiado(true);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--borde)" }}
        >
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function BannerError({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-peligro) 15%, transparent)" }}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}

function BannerOk({ mensaje }: { mensaje: string }) {
  return (
    <p
      role="status"
      className="mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
      style={{ backgroundColor: "color-mix(in oklab, var(--color-exito) 15%, transparent)" }}
    >
      <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{mensaje}</span>
    </p>
  );
}

function BotonEnviar({
  children,
  icono,
  bloqueado = false,
}: {
  children: React.ReactNode;
  icono?: React.ReactNode;
  /// El alta lo bloquea hasta que el semaforo de requisitos este completo. La
  /// edicion no lo pasa, asi que por defecto no bloquea.
  bloqueado?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || bloqueado}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      style={{ backgroundColor: "var(--color-marca-600)" }}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : icono}
      {children}
    </button>
  );
}

/**
 * Boton de accion de fila. Si lleva `confirmar`, pide confirmacion antes de
 * enviar: desactivar y resetear tienen consecuencias (cierran sesiones) y no
 * deben dispararse por un clic accidental.
 */
function BotonMini({
  children,
  icono,
  confirmar,
  peligro = false,
}: {
  children: React.ReactNode;
  icono?: React.ReactNode;
  confirmar?: string;
  /// Los destructivos (eliminar) se tinen de rojo para que no se pulsen por
  /// inercia junto a los demas.
  peligro?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-60"
      style={{
        borderColor: peligro ? "var(--color-peligro)" : "var(--borde)",
        color: peligro ? "var(--color-peligro)" : undefined,
      }}
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : icono}
      {children}
    </button>
  );
}
