interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  ayuda?: string;
}

/**
 * Campo de formulario accesible.
 *
 * La etiqueta se asocia por `id` en lugar de envolver el input, para que los
 * lectores de pantalla la anuncien correctamente. `aria-describedby` enlaza
 * el texto de ayuda sin ensuciar el nombre accesible del campo.
 */
export function CampoTexto({ etiqueta, ayuda, id, ...props }: Props) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={idAyuda}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{
          borderColor: "var(--borde)",
          backgroundColor: "var(--fondo)",
        }}
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-xs opacity-60">
          {ayuda}
        </p>
      )}
    </div>
  );
}
