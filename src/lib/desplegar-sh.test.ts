import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * El guion del despliegue, probado de verdad contra un servidor de mentira.
 *
 * VIVE EN `src/` AUNQUE NO PRUEBE CODIGO DE `src/`, y es a proposito: vitest
 * solo recoge `src/**\/*.test.ts`, asi que un banco de pruebas colgado en
 * cualquier otro sitio no lo correria ni el gancho de pre-push ni el CI. Y
 * `scripts/desplegar.sh` es, con diferencia, el archivo del repositorio cuyo
 * fallo sale mas caro: se ejecuta sin nadie delante, en el servidor de
 * produccion, cada minuto.
 *
 * El trabajo lo hace `scripts/probar-desplegar.sh`, que monta una raiz falsa
 * con su paquete, corre el guion entero y comprueba que quedo. Aqui solo se
 * enchufa a la bateria: la logica en bash y la comprobacion en bash, que es
 * donde se puede leer al lado de lo que prueba.
 *
 * Comprobado que el banco DISTINGUE: contra la version anterior del guion caen
 * cuatro comprobaciones -las tres del rescate y la de saltarse Prisma-, y las
 * demas siguen pasando.
 */

function hayBash(): boolean {
  try {
    execFileSync("bash", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("scripts/desplegar.sh", () => {
  it.runIf(hayBash())(
    "pasa su banco de pruebas: rescata un paquete olvidado y no arranca Prisma de balde",
    () => {
      // `execFileSync` lanza si el banco sale con codigo distinto de cero, que
      // es justo lo que hace cuando alguna comprobacion falla. La salida entera
      // viaja en el error, asi que se ve QUE caso cayo.
      const salida = execFileSync(
        "bash",
        ["scripts/probar-desplegar.sh", "scripts/desplegar.sh"],
        { encoding: "utf8" },
      );

      expect(salida).toContain("TODO OK");
    },
    60_000,
  );
});
