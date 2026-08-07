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
      // de partidas lo supera. El importador rechaza por encima de 8 MB con
      // un mensaje claro, asi que este techo nunca se alcanza en silencio.
      bodySizeLimit: "10mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
