import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta un servidor autocontenido. Es el unico modo viable para
  // desplegar sobre cPanel/Passenger y tambien facilita el paso a un VPS.
  output: "standalone",

  // La optimizacion de imagenes de Next depende de `sharp`, un binario
  // nativo que no es fiable en CloudLinux. Se desactiva a proposito.
  images: { unoptimized: true },

  // La compresion la hace Apache delante del proceso Node.
  compress: false,
  poweredByHeader: false,

  // Next genera AGENTS.md y CLAUDE.md automaticamente. Se desactiva: la
  // documentacion del proyecto la controlamos nosotros y no queremos que
  // una actualizacion del framework la sobrescriba.
  agentRules: false,

  experimental: {
    serverActions: {
      // El limite por defecto es 1 MB: un presupuesto de obra con cientos
      // de partidas lo supera. Los importadores rechazan antes, con un
      // mensaje claro, asi que este techo nunca se alcanza en silencio.
      //
      // Va por ENCIMA del mayor de esos limites, que son 8 MB en los Excel y
      // 20 MB en el .mpp del cronograma. Estuvo en 10 MB, por debajo de los
      // 20: un .mpp de 15 MB pasaba la validacion de la app y moria despues
      // contra el framework, con un error opaco en vez del mensaje que el
      // importador tenia preparado. Justo lo que este comentario decia evitar.
      bodySizeLimit: "24mb",
    },
  },

  async headers() {
    const seguras = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(self)",
      },
      // Fuerza HTTPS durante dos anos. En desarrollo (http) el navegador la
      // ignora, asi que no molesta; en produccion evita que una primera
      // peticion viaje en claro.
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      },
    ];

    // La CSP solo en produccion: en desarrollo, el hot-reload de Next abre un
    // WebSocket y evalua codigo que `connect-src 'self'` y la ausencia de
    // 'unsafe-eval' bloquearian, dejando la recarga en caliente inservible.
    //
    // `img-src` incluye `data:` a proposito: las fotos de perfil se guardan y
    // se muestran como data URL. `frame-ancestors 'none'` es el equivalente
    // moderno de X-Frame-Options: nadie puede embeber la app en un iframe, que
    // es como se montan los ataques de clickjacking.
    if (process.env.NODE_ENV === "production") {
      seguras.push({
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join("; "),
      });
    }

    return [{ source: "/:path*", headers: seguras }];
  },
};

export default nextConfig;
