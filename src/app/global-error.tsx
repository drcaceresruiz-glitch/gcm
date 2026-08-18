"use client";

/**
 * El ultimo recurso: falló el layout RAIZ.
 *
 * Sustituye al documento entero, y por eso lleva su propio `<html>` y
 * `<body>`. Es el unico sitio de la aplicacion donde eso es correcto.
 *
 * **SIN VARIABLES DE TEMA NI COMPONENTES DE LA CASA, a proposito.** El CSS de
 * GCM lo importa el layout raiz (`import "./globals.css"`), que es justo el
 * que ha reventado: dar por hecho que `var(--superficie)` existe aqui es
 * confiar en lo que acaba de fallar. Todo va en estilos en linea y en colores
 * literales, para que esta pantalla se vea aunque no quede nada en pie.
 *
 * Por lo mismo no usa `<Mascota>`: es un `next/image` y depende del pipeline
 * de la aplicacion.
 *
 * Si esto sale, no es una pantalla rota: es GCM sin arrancar. Lo unico
 * honesto que se puede ofrecer es el codigo del fallo y recargar.
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es-PE">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#f1f5f6",
          color: "#1b2733",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            border: "1px solid #d9e2e5",
            borderRadius: 12,
            padding: 28,
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontWeight: "bold",
              fontSize: 13,
              letterSpacing: 1,
              color: "#0f7186",
            }}
          >
            GCM
          </p>

          <h1 style={{ fontSize: 19, margin: "12px 0 8px" }}>
            No se pudo arrancar la aplicación
          </h1>

          <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5b6b74", margin: 0 }}>
            No es un problema de la pantalla que abriste, sino de GCM al
            cargarse. Tus datos no se han tocado.
          </p>

          {error.digest && (
            <p style={{ fontSize: 12, color: "#6b7a82", marginTop: 16 }}>
              Código del fallo:{" "}
              <code
                style={{
                  background: "#f1f5f6",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontFamily: "monospace",
                }}
              >
                {error.digest}
              </code>
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              background: "#0f7186",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
