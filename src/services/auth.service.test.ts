import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Los dos limites del acceso, que defienden cosas distintas.
 *
 * El de la CUENTA lleva desde el principio y para lo suyo funciona: cinco
 * fallos y quince minutos fuera. Lo que no hacia era caducar —solo se ponia a
 * cero al acertar—, y de ahi salia el peor comportamiento del sistema: una
 * cuenta que llegara a cinco quedaba a merced de cualquiera para siempre,
 * porque cada fallo suelto posterior volvia a bloquearla otro cuarto de hora.
 * Con el correo del administrador de una constructora, que es adivinable, eso
 * basta para dejarlo fuera de su propio sistema indefinidamente.
 *
 * El de la CONEXION es nuevo y ataca el otro flanco: contar por cuenta no ve
 * al que prueba una clave comun contra mil cuentas distintas, porque no se
 * acerca al umbral de ninguna.
 *
 * Aqui no hay base de datos: se dobla Prisma y se comprueba QUE se le pide.
 */

interface Llamada {
  metodo: string;
  args: unknown;
}

const llamadas: Llamada[] = [];

type UsuarioEnBase = {
  id: string;
  companyId: string;
  passwordHash: string;
  estado: string;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
  dosFactoresActivo: boolean;
  canal2FA: string | null;
  celular: string | null;
  celularVerificadoAt: Date | null;
  nombres: string;
  email: string;
  company: { activa: boolean };
};

let usuarioEnBase: UsuarioEnBase | null = null;
let claveCorrecta = false;
let fallosDeLaIp = 0;

vi.mock("@/lib/prisma", () => {
  const apuntar = (metodo: string, valor: () => unknown) => (args?: unknown) => {
    llamadas.push({ metodo, args });
    return Promise.resolve(valor());
  };

  return {
    prisma: {
      user: {
        findUnique: apuntar("user.findUnique", () => usuarioEnBase),
        update: apuntar("user.update", () => ({})),
      },
      auditLog: {
        count: apuntar("auditLog.count", () => fallosDeLaIp),
        create: apuntar("auditLog.create", () => ({})),
      },
    },
  };
});

vi.mock("@/lib/password", () => ({
  verifyPassword: () => Promise.resolve(claveCorrecta),
  hashPassword: () => Promise.resolve("hash"),
}));

vi.mock("@/services/sesion.service", () => ({
  crearSesion: () => Promise.resolve(),
  cerrarTodasLasSesiones: () => Promise.resolve(),
}));

vi.mock("@/services/dosFactores.service", () => ({
  crearDesafio: () => Promise.resolve(),
}));

const { iniciarSesion } = await import("@/services/auth.service");

function usuario(parcial: Partial<UsuarioEnBase> = {}): UsuarioEnBase {
  return {
    id: "u1",
    companyId: "empresa-1",
    passwordHash: "scrypt$16384$8$1$AAAA$AAAA",
    estado: "ACTIVO",
    mustChangePassword: false,
    failedLoginCount: 0,
    lockedUntil: null,
    dosFactoresActivo: false,
    canal2FA: null,
    celular: null,
    celularVerificadoAt: null,
    nombres: "Ana",
    email: "ana@ejemplo.pe",
    company: { activa: true },
    ...parcial,
  };
}

/** Los datos del `user.update`, que es donde se ve el castigo aplicado. */
function datosDelUpdate(): Record<string, unknown> {
  const llamada = llamadas.find((l) => l.metodo === "user.update");
  if (!llamada) throw new Error("No se actualizo el usuario");
  return (llamada.args as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  llamadas.length = 0;
  usuarioEnBase = usuario();
  claveCorrecta = false;
  fallosDeLaIp = 0;
});

describe("limite por conexion", () => {
  it("corta ANTES de mirar la cuenta cuando la IP se paso", async () => {
    fallosDeLaIp = 20;

    const r = await iniciarSesion("ana@ejemplo.pe", "loquesea", {
      ip: "203.0.113.7",
    });

    expect(r.ok).toBe(false);

    // Lo que hace util esto contra el rociado: ni siquiera se busca al
    // usuario. Si la comprobacion viviera despues, cada intento seguiria
    // costando una consulta y, peor, seguiria sumando fallos a la cuenta
    // atacada.
    expect(llamadas.some((l) => l.metodo === "user.findUnique")).toBe(false);
  });

  it("habla de la conexion, no de las credenciales", async () => {
    fallosDeLaIp = 25;

    const r = await iniciarSesion("ana@ejemplo.pe", "x", { ip: "203.0.113.7" });

    // No delata ninguna cuenta —no dice si el correo existe— pero tampoco
    // deja creer a quien se equivoco que su clave dejo de valer.
    if (r.ok) throw new Error("deberia haber fallado");
    expect(r.error).toContain("conexion");
    expect(r.error).not.toContain("Correo o contrasena");
  });

  it("cuenta solo los fallos recientes de ESA ip", async () => {
    fallosDeLaIp = 0;
    await iniciarSesion("ana@ejemplo.pe", "x", { ip: "203.0.113.7" });

    const conteo = llamadas.find((l) => l.metodo === "auditLog.count");
    const donde = (conteo?.args as { where: Record<string, unknown> }).where;

    expect(donde["accion"]).toBe("LOGIN_FAILED");
    expect(donde["ip"]).toBe("203.0.113.7");
    expect(donde["createdAt"]).toHaveProperty("gt");
  });

  it("por debajo del limite deja seguir", async () => {
    fallosDeLaIp = 19;

    await iniciarSesion("ana@ejemplo.pe", "x", { ip: "203.0.113.7" });

    expect(llamadas.some((l) => l.metodo === "user.findUnique")).toBe(true);
  });

  it("sin IP no comprueba nada, en vez de cerrarle la puerta a todos", async () => {
    await iniciarSesion("ana@ejemplo.pe", "x", {});

    // Falta de cabecera = no se puede atribuir. Cortar aqui convertiria un
    // proxy mal configurado en una caida de acceso general.
    expect(llamadas.some((l) => l.metodo === "auditLog.count")).toBe(false);
    expect(llamadas.some((l) => l.metodo === "user.findUnique")).toBe(true);
  });
});

describe("el bloqueo de cuenta caduca", () => {
  it("tras cumplir el bloqueo se vuelve a empezar de cero", async () => {
    // Cinco fallos y un bloqueo que ya vencio: el castigo esta cumplido.
    usuarioEnBase = usuario({
      failedLoginCount: 5,
      lockedUntil: new Date(Date.now() - 60_000),
    });

    await iniciarSesion("ana@ejemplo.pe", "mala", { ip: "203.0.113.7" });

    // ESTA es la regresion que se vigila. Antes salia 6, y con 6 >= 5 la
    // cuenta quedaba bloqueada otros quince minutos por UN solo fallo: quien
    // supiera el correo la mantenia fuera para siempre.
    expect(datosDelUpdate()["failedLoginCount"]).toBe(1);
    expect(datosDelUpdate()["lockedUntil"]).toBeNull();
  });

  it("pero el quinto fallo seguido si bloquea", async () => {
    usuarioEnBase = usuario({ failedLoginCount: 4, lockedUntil: null });

    await iniciarSesion("ana@ejemplo.pe", "mala", { ip: "203.0.113.7" });

    expect(datosDelUpdate()["failedLoginCount"]).toBe(5);
    expect(datosDelUpdate()["lockedUntil"]).toBeInstanceOf(Date);
  });

  it("con el bloqueo vivo no se comprueba la clave siquiera", async () => {
    usuarioEnBase = usuario({
      failedLoginCount: 5,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    const r = await iniciarSesion("ana@ejemplo.pe", "mala", {
      ip: "203.0.113.7",
    });

    if (r.ok) throw new Error("deberia haber fallado");
    expect(r.error).toContain("bloqueada");
    expect(llamadas.some((l) => l.metodo === "user.update")).toBe(false);
  });

  it("acertar borra el contador", async () => {
    claveCorrecta = true;
    usuarioEnBase = usuario({ failedLoginCount: 3 });

    await iniciarSesion("ana@ejemplo.pe", "buena", { ip: "203.0.113.7" });

    expect(datosDelUpdate()["failedLoginCount"]).toBe(0);
    expect(datosDelUpdate()["lockedUntil"]).toBeNull();
  });
});
