import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { estadoDelReloj, type EstadoReloj } from "@/lib/avisos";
import { parsearOperadores } from "@/lib/operador";
import { hayLlaveDeCifrado } from "@/lib/secreto";
import { shaDelPaquete } from "@/lib/version";

export interface EstadoSalud {
  baseDatosConectada: boolean;
  latenciaMs: number;
  /**
   * Hay un paquete subido que nadie ha aplicado.
   *
   * Quiere decir que **esta version NO es la ultima**: el despliegue llego al
   * servidor y sigue ahi esperando. Se mira porque es exactamente el fallo
   * que mas tiempo ha costado: la Action en verde, la web respondiendo 200 y
   * codigo viejo corriendo, sin nada que lo delatara. El 12 de agosto se
   * perdio una hora deduciendolo de fechas de archivos.
   *
   * Lo aplica `desplegar.sh` desde un cron cada minuto, asi que ver esto en
   * true durante mas de un par de minutos significa que el cron no existe o
   * esta fallando; en `tmp/despliegue.log` esta el porque.
   */
  desplieguePendiente: boolean;
  /**
   * Si el reloj de los avisos esta corriendo.
   *
   * Es la misma leccion que la de arriba, aplicada antes de que cueste la
   * hora: el cron hay que crearlo a mano en cPanel, y cuando no existe **nadie
   * se entera, por definicion** —lo que falla es justamente lo que avisaba—.
   * Los recordatorios simplemente no salen y la obra concluye que GCM no
   * avisa.
   *
   * `nunca` no es lo mismo que `parado`: recien desplegado significa que falta
   * crear la linea del cron, y el consejo que hay que dar es otro.
   */
  reloj: EstadoReloj;
  /**
   * SHA del PAQUETE que de verdad esta corriendo.
   *
   * Sale de un archivo `BUILD_SHA` que viaja DENTRO del `gcm.tar.gz`, asi que
   * solo cambia cuando el paquete se aplica de verdad. Es la unica cifra de
   * aqui que responde «que codigo esta vivo».
   *
   * null = el paquete es anterior a esta comprobacion, o se corre en local.
   */
  shaPaquete: string | null;
  /**
   * SHA que trae `app.js`, el punto de entrada de Passenger.
   *
   * NO es lo mismo, y confundirlos costo media hora el 2026-08-15. `app.js` se
   * sube por FTP **aparte** del paquete y se renombra en su sitio, asi que su
   * SHA cambia en cuanto la subida termina —aplique o no se aplique el
   * `gcm.tar.gz` despues—. Durante ese hueco, este campo ya dice la version
   * nueva mientras corre la vieja.
   *
   * Se expone precisamente para que ese hueco se pueda VER en vez de deducirlo.
   */
  shaArranque: string | null;
  /**
   * Cuantos correos hay en `GCM_OPERADORES`. El NUMERO, nunca los correos.
   *
   * Sin esto, una instalacion sin operadores y una con el correo mal tecleado
   * se ven EXACTAMENTE igual desde fuera y desde dentro: `/operador` devuelve
   * al panel en los dos casos, que es el comportamiento correcto —no se
   * confirma a un desconocido que esa pantalla existe— pero deja a quien
   * administra sin forma de saber si su despliegue quedo bien.
   *
   * Con el numero se distinguen los dos fallos: **0** = falta la variable en
   * el servidor; **mayor que 0 y aun asi no ves la pantalla** = tu correo no
   * es ninguno de los de la lista. Es la diferencia entre media hora y un
   * minuto, y es el mismo motivo por el que aqui ya salen `despliegue` y
   * `reloj`: un fallo de configuracion que no se ve no se arregla.
   *
   * Un numero no identifica a nadie ni ayuda a entrar: sin credenciales, saber
   * que hay dos operadores no acerca a nadie a ser uno.
   */
  operadores: number;
  /**
   * Si `CORREO_CLAVE_CIFRADO` esta puesta. El SI o NO, jamas la frase.
   *
   * Mismo motivo que `operadores`: sin ella se caen dos cosas **calladas**, y
   * de formas que no se parecen entre si. Guardar el buzon propio de una
   * constructora avisa en pantalla —lo ve solo quien este en esa pantalla— y
   * la lectura de respuestas de los contratistas **no falla: no hace nada**,
   * porque `buzonesPendientes` se va de vacio sin mirar ningun buzon. Un
   * modulo que no se queja y no funciona es el que mas tarda en descubrirse.
   *
   * Saber que hay llave no acerca a nadie a la llave: la frase no sale de
   * aqui, y sin ella lo cifrado sigue siendo ilegible.
   */
  cifradoConfigurado: boolean;
}

/**
 * Comprobacion de vida del sistema.
 *
 * Ejecuta una consulta real contra la base. Un chequeo que solo responde
 * "ok" sin consultar nada da luz verde aunque la conexion este rota, que es
 * justamente el fallo que interesa detectar tras un despliegue.
 */
export async function verificarSalud(): Promise<EstadoSalud> {
  const inicio = Date.now();
  const desplieguePendiente = hayPaqueteSinAplicar();
  const shaPaquete = shaDelPaquete();
  const shaArranque = process.env["BUILD_SHA"] ?? null;
  // Se cuenta con el MISMO parseador que decide quien es operador, no
  // partiendo la cadena aqui: dos formas de leer la lista acabarian
  // discrepando en los espacios o en los duplicados, y este numero existe
  // justamente para que nadie tenga que dudar de el.
  const operadores = parsearOperadores(env.GCM_OPERADORES).length;
  // Se pregunta al MISMO sitio que decide si se puede guardar un secreto, no
  // mirando la variable aqui: si algun dia la llave se derivara de otra cosa,
  // esta respuesta seguiria diciendo la verdad en vez de la verdad de ayer.
  const cifradoConfigurado = hayLlaveDeCifrado();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      baseDatosConectada: true,
      latenciaMs: Date.now() - inicio,
      desplieguePendiente,
      reloj: await estadoDelRelojDeAvisos(),
      shaPaquete,
      shaArranque,
      operadores,
      cifradoConfigurado,
    };
  } catch {
    return {
      baseDatosConectada: false,
      latenciaMs: Date.now() - inicio,
      desplieguePendiente,
      // Sin base no se puede saber, y decir "parado" seria una segunda alarma
      // por la misma causa. La de la base ya se esta dando.
      reloj: "nunca",
      shaPaquete,
      shaArranque,
      operadores,
      cifradoConfigurado,
    };
  }
}

/*
 * El SHA que viaja DENTRO del paquete se lee en `lib/version`, no aqui.
 *
 * Existe porque el 2026-08-15 `/api/health` decia la version nueva mientras
 * corria la vieja, y no habia forma de saberlo con un curl. La causa: el unico
 * SHA que se publicaba venia de `app.js`, que el FTP deja en su sitio ANTES de
 * que nadie aplique el `gcm.tar.gz`. El archivo `BUILD_SHA` se genera en el
 * workflow y va dentro del paquete, asi que llega al arbol vivo por el MISMO
 * camino que el codigo: si el codigo esta, esto esta.
 *
 * Se mudo a `lib/version` cuando el pie de pagina necesito la misma cifra.
 * Vive una sola vez a proposito: dos lecturas del mismo archivo son dos
 * sitios donde puede divergir el criterio de que hacer si falta.
 */

/**
 * Cuando corrio el reloj por ultima vez.
 *
 * Se lee `iniciadaAt` si no hay `terminadaAt`: una pasada en curso tambien es
 * senal de vida, y esperar a que termine daria "parado" durante los veinte
 * segundos que dura.
 */
async function estadoDelRelojDeAvisos(): Promise<EstadoReloj> {
  try {
    const fila = await prisma.relojTarea.findUnique({
      where: { clave: "avisos" },
      select: { terminadaAt: true, iniciadaAt: true },
    });
    return estadoDelReloj(fila?.terminadaAt ?? fila?.iniciadaAt ?? null, new Date());
  } catch {
    return "nunca";
  }
}

/**
 * Si queda un paquete de despliegue por aplicar.
 *
 * `gcm.tar.gz` es uno recien subido; `.desplegando` es uno que se empezo a
 * aplicar y se quedo a medias, que es peor y por eso cuenta igual.
 *
 * Se busca junto al proceso, que en el servidor es la raiz de la aplicacion.
 * En desarrollo no existe ninguno de los dos y esto sale siempre false, que
 * es lo correcto: en local no hay despliegue que aplicar.
 */
function hayPaqueteSinAplicar(): boolean {
  const raiz = process.cwd();

  return ["gcm.tar.gz", "gcm.tar.gz.desplegando"].some((nombre) =>
    existsSync(join(raiz, nombre)),
  );
}
