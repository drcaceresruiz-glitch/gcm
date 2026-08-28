# El presupuesto de referencia

Con este se comprueban el importador, la EDT y la cadena del contratista. **No
es de ninguna obra**: se construye en memoria desde
`scripts/generar-presupuesto-referencia.ts`, así que no hay ningún `.xlsx`
versionado.

Para mirarlo con Excel:

```
npx tsx scripts/generar-presupuesto-referencia.ts
```

Escribe `docs/presupuesto-referencia.xlsx`, que **no se versiona** (el
`.gitignore` excluye los binarios de `docs/`).

---

## Por qué existe

Las comprobaciones usaban el presupuesto de un cliente, y eso tenía dos
problemas.

**Uno práctico:** ese archivo no se versiona —es de un tercero y este
repositorio es público—, así que quien clonara el proyecto no podía ejecutar
nada.

**Y uno de fondo:** sus fórmulas están mal. Rangos que se quedan cortos, un
total que suma dos columnas, un capítulo sin fórmula. Eso lo hace un banco de
pruebas **útil** —los presupuestos reales vienen así— pero no puede ser el
**único**: un archivo defectuoso no dice si lo correcto entra bien.

Los dos se usan, cada uno para lo suyo. Este para lo que debe funcionar; el del
cliente, cuando hay que ver cómo se digiere un documento con errores.

---

## Qué trae, y por qué cada cosa

| Bloque | Lo que ejercita |
|---|---|
| **Capítulo 1** — obras provisionales | Un capítulo llano, sin contratista |
| **Capítulo 2** — eléctricas | Los tres porcentajes del contratista en el capítulo |
| **3.01.00** — primer piso | Un subcapítulo escrito **con ceros**, la forma peruana que confunde la profundidad |
| **3.02.00** — red de desagüe | Una **suma alzada** con su alcance colgando sin cifra |
| **3.03** — descuento comercial | Un importe **negativo**, que resta y no sustituye a nadie |
| **Capítulo 4** — acabados | **Dos contratistas**, cada uno en su subcapítulo |

---

## Las cifras, calculadas a mano

| | Suma de partidas | Ajuste del contratista | Costo |
|---|---|---|---|
| **1** Obras provisionales | 8.000,00 | — | **8.000,00** |
| **2** Instalaciones eléctricas | 20.000,00 | −5 % · +8 % · +10 % | **22.420,00** |
| **3** Instalaciones sanitarias | 9.500,00 | — | **9.500,00** |
| &nbsp;&nbsp;3.01.00 Primer piso | 5.000,00 | — | 5.000,00 |
| &nbsp;&nbsp;3.02.00 Red de desagüe *(suma alzada)* | 5.000,00 | — | 5.000,00 |
| &nbsp;&nbsp;3.03 Descuento comercial | −500,00 | — | −500,00 |
| **4** Acabados | 16.000,00 | dos contratistas | **17.550,00** |
| &nbsp;&nbsp;4.01.00 Pisos — contratista A | 10.000,00 | −10 % · +5 % · +10 % | 10.350,00 |
| &nbsp;&nbsp;4.02.00 Pintura — contratista B | 6.000,00 | +10 % · +10 % | 7.200,00 |
| | | | **57.470,00** |

**Comprobaciones que se apoyan en esto:**

- El costo directo guardado es **57.470,00**, y la suma de los cuatro capítulos
  raíz da lo mismo.
- `3.02.00` queda en **nivel 1** colgando del capítulo 3, conserva sus 5.000 y
  entra como suma alzada; sus dos líneas de alcance cuelgan de ella, sin
  importe, y **no bajan a la EDT**.
- La EDT sale con **20 tareas**, 13 con dinero, y el dinero de sus hojas es
  exactamente el costo directo.
