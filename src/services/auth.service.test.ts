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
  company: { activa: boolean; razonSocial: string };
};

let usuarioEnBase: UsuarioEnBase | null = null;
let claveCorrecta = false;
let fallosDeLaIp = 0;

/**
 * VARIAS cuentas con el mismo correo, para el camino nuevo.
 *
 * Cuando esta puesta manda sobre `usuarioEnBase`. Y con ella se usa
 * `hashesQueCasan` en vez de `claveCorrecta`: lo que se prueba es justamente
 * que la clave decide CUAL de las cuentas, asi que no puede valer para todas
 * por igual.
 */
let cuentasEnBase: UsuarioEnBase[] | null = null;
let hashesQueCasan: string[] | null = null;

vi.mock("@/lib/prisma", () => {
  const apuntar = (metodo: string, valor: () => unknown) => (args?: unknown) => {
    llamadas.push({ metodo, args });
    return Promise.resolve(valor());
  };

  return {
    prisma: {
      user: {
        // El login busca CANDIDATOS desde que el correo puede repetirse entre
        // constructoras. Con una cuenta —el caso de estas pruebas— la lista
        // trae una, o ninguna si no hay usuario.
        findMany: apuntar(
          "user.findMany",
          () => cuentasEnBase ?? (usuarioEnBase ? [usuarioEnBase] : []),
        ),
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
  // Con `hashesQueCasan` la clave acierta solo contra esos hashes, que es lo
  // que permite probar «casa una de las dos cuentas».
  verifyPassword: (_clave: string, hash: string) =>
    Promise.resolve(
      hashesQueCasan ? hashesQueCasan.includes(hash) : claveCorrecta,
    ),
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
    company: { activa: true, razonSocial: "Constructora A" },
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
  cuentasEnBase = null;
  hashesQueCasan = null;
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
    expect(llamadas.some((l) => l.metodo === "user.findMany")).toBe(false);
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

    expect(llamadas.some((l) => l.metodo === "user.findMany")).toBe(true);
  });

  it("sin IP no comprueba nada, en vez de cerrarle la puerta a todos", async () => {
    await iniciarSesion("ana@ejemplo.pe", "x", {});

    // Falta de cabecera = no se puede atribuir. Cortar aqui convertiria un
    // proxy mal configurado en una caida de acceso general.
    expect(llamadas.some((l) => l.metodo === "auditLog.count")).toBe(false);
    expect(llamadas.some((l) => l.metodo === "user.findMany")).toBe(true);
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

/**
 * ---------------------------------------------------------------------------
 * EL MISMO CORREO EN VARIAS CONSTRUCTORAS (20/08/2026).
 *
 * Desde que el correo es unico POR EMPRESA, el login ya no puede resolverlo a
 * un usuario mirando la tabla. Recoge candidatos y deja que decida la CLAVE.
 *
 * Lo que se fija aqui es que esa decision no afloje nada de lo de arriba: que
 * la clave siga siendo lo unico que abre, que una cuenta ajena no se cuele por
 * mandar su `companyId`, y que fallar cueste en todas.
 * ---------------------------------------------------------------------------
 */
describe("un correo con cuenta en dos constructoras", () => {
  const EN_A = "hash-de-la-A";
  const EN_B = "hash-de-la-B";

  function dosCuentas() {
    cuentasEnBase = [
      usuario({
        id: "u-a",
        companyId: "empresa-a",
        passwordHash: EN_A,
        company: { activa: true, razonSocial: "Constructora A" },
      }),
      usuario({
        id: "u-b",
        companyId: "empresa-b",
        passwordHash: EN_B,
        company: { activa: true, razonSocial: "Constructora B" },
      }),
    ];
  }

  it("con claves distintas, entra en la que casa y no pregunta nada", async () => {
    dosCuentas();
    hashesQueCasan = [EN_B];

    const r = await iniciarSesion("ana@ejemplo.pe", "la-de-la-B");

    expect(r).toEqual({ ok: true, mustChangePassword: false });
  });

  /**
   * La misma clave en las dos: es el UNICO caso en que el acceso pregunta.
   * No se abre sesion ni se guarda nada a medias.
   */
  it("con la misma clave en las dos, pregunta en cual entrar", async () => {
    dosCuentas();
    hashesQueCasan = [EN_A, EN_B];

    const r = await iniciarSesion("ana@ejemplo.pe", "la-misma");

    expect(r).toEqual({
      ok: true,
      elegirEmpresa: [
        { companyId: "empresa-a", razonSocial: "Constructora A" },
        { companyId: "empresa-b", razonSocial: "Constructora B" },
      ],
    });
  });

  it("y al elegir una, la busqueda va acotada a esa empresa", async () => {
    dosCuentas();
    hashesQueCasan = [EN_A, EN_B];

    await iniciarSesion("ana@ejemplo.pe", "la-misma", {}, "empresa-b");

    const consulta = llamadas.find((l) => l.metodo === "user.findMany");
    expect((consulta?.args as { where: unknown }).where).toEqual({
      email: "ana@ejemplo.pe",
      companyId: "empresa-b",
    });
  });

  /**
   * LA EMPRESA ELEGIDA NO ES UNA CREDENCIAL. Llega de la peticion, asi que
   * mandar la de otra constructora no puede abrir nada: la clave se vuelve a
   * comprobar contra las cuentas de ESA empresa, y si no casa ninguna, no
   * entra nadie.
   */
  it("mandar una empresa ajena no abre nada", async () => {
    cuentasEnBase = [];
    hashesQueCasan = [EN_A];

    const r = await iniciarSesion("ana@ejemplo.pe", "la-de-la-A", {}, "empresa-de-otro");

    expect(r).toEqual({ ok: false, error: "Correo o contrasena incorrectos." });
  });

  it("si no casa ninguna, el fallo se anota en TODAS", async () => {
    dosCuentas();
    hashesQueCasan = [];

    const r = await iniciarSesion("ana@ejemplo.pe", "ninguna");

    expect(r.ok).toBe(false);

    const castigadas = llamadas
      .filter((l) => l.metodo === "user.update")
      .map((l) => (l.args as { where: { id: string } }).where.id);

    expect(castigadas).toEqual(["u-a", "u-b"]);
  });

  /**
   * Una cuenta desactivada no entra ni compite, y no se dice que lo esta: con
   * varias cuentas, decirlo seria contar donde tiene cuenta alguien.
   */
  it("una cuenta desactivada no gana aunque su clave case", async () => {
    cuentasEnBase = [
      usuario({ id: "u-a", companyId: "empresa-a", passwordHash: EN_A, estado: "INACTIVO" }),
      usuario({
        id: "u-b",
        companyId: "empresa-b",
        passwordHash: EN_B,
        company: { activa: true, razonSocial: "Constructora B" },
      }),
    ];
    hashesQueCasan = [EN_A];

    const r = await iniciarSesion("ana@ejemplo.pe", "la-de-la-A");

    expect(r).toEqual({ ok: false, error: "Correo o contrasena incorrectos." });
  });

  it("y una bloqueada tampoco, aunque la otra siga abierta", async () => {
    cuentasEnBase = [
      usuario({
        id: "u-a",
        companyId: "empresa-a",
        passwordHash: EN_A,
        lockedUntil: new Date(Date.now() + 60_000),
      }),
      usuario({
        id: "u-b",
        companyId: "empresa-b",
        passwordHash: EN_B,
        company: { activa: true, razonSocial: "Constructora B" },
      }),
    ];
    hashesQueCasan = [EN_A, EN_B];

    const r = await iniciarSesion("ana@ejemplo.pe", "la-misma");

    // Solo la B queda en pie, asi que entra directo y no pregunta.
    expect(r).toEqual({ ok: true, mustChangePassword: false });
  });
});
