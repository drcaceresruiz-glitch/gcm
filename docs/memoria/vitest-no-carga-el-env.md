---
name: vitest-no-carga-el-env
description: "Las pruebas de GCM reciben un .env de mentira; para tocar la base o descifrar hay que leer el .env a mano"
metadata:
  type: reference
---

`vitest.config.mts` **inyecta valores FALSOS** de entorno a propósito, para que
los módulos carguen sin conectarse a nada:

```
DATABASE_URL: "mysql://prueba:prueba@localhost:3306/prueba"
APP_SECRET:   "secreto-de-prueba-..."
```

Consecuencia al escribir una prueba que sí quiere tocar la base de desarrollo
—la técnica de [[e2e-golden-path-verificado]]—: **`process.env` no sirve**. Hay
que leer el `.env` a mano:

```ts
const NL = new RegExp("\r?\n");
const leer = (c: string) => {
  const l = readFileSync(".env", "utf8").split(NL).find((x) => x.startsWith(c + "="));
  return l ? l.slice(c.length + 1).trim().replace(/^"|"$/g, "") : undefined;
};
```

**Y no solo `DATABASE_URL`.** El 25 de agosto de 2026 esto me hizo dar por
corrupta una clave de API que estaba perfecta: sin `CORREO_CLAVE_CIFRADO` en
`process.env`, `lib/secreto.descifrar` devuelve `null` y **toda clave guardada
parece ilegible**. El servidor de desarrollo la lee sin problema. Si la prueba
va a descifrar algo, hay que meter también esa variable:

```ts
for (const c of ["CORREO_CLAVE_CIFRADO", "APP_SECRET"]) {
  const v = leer(c); if (v) process.env[c] = v;
}
```

Síntomas de que falta: «pool timeout: failed to retrieve a connection» (falta
`DATABASE_URL`) o «No se pudo leer la clave guardada» (falta
`CORREO_CLAVE_CIFRADO`). Ninguno de los dos dice cuál es la causa real.
