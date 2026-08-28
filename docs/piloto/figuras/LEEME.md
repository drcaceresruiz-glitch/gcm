# Figuras del capítulo de resultados

Generadas con los datos del **piloto simulado**. Sirven de plantilla: cuando
tenga los datos reales, se regeneran igual y solo cambian los valores.

**No son resultados del estudio.** Los datos son sintéticos.

## Las cinco

| Archivo | Responde a | Herramienta con datos reales |
|---|---|---|
| `figura-1-serie-ppc.svg` | H1 — confiabilidad de la planificación | Excel o JASP |
| `figura-2-desviacion-semanal.svg` | H2 — reducción de la variabilidad | Excel |
| `figura-3-cajas-retraso.svg` | H2 — dispersión y valores atípicos | JASP (*Descriptives → Boxplot*) |
| `figura-4-causas.svg` | H3 — cambio en la composición de causas | Excel |
| `figura-5-histogramas.svg` | Justifica el uso de pruebas no paramétricas | JASP (*Descriptives → Histogram*) |

## Pies de figura

**Figura 1.** Serie cronológica del Porcentaje de Plan Completado a lo largo de
las veinte semanas de observación. La línea discontinua vertical señala la
implementación del sistema. Las líneas discontinuas inclinadas representan la
tendencia ajustada por mínimos cuadrados dentro de cada fase, permitiendo
distinguir el cambio de nivel del cambio de pendiente.

**Figura 2.** Desviación estándar semanal del retraso de liberación de
restricciones. Las semanas con menos de dos observaciones se señalan como
*n<2*, al no ser calculable la dispersión.

**Figura 3.** Distribución del retraso de liberación por fase. La caja
representa el recorrido intercuartílico, la línea central la mediana y los
puntos los valores atípicos, correspondientes a restricciones cuyo
levantamiento se prolongó de forma excepcional.

**Figura 4.** Composición porcentual de las causas de no cumplimiento por fase,
agrupadas en controlables por la obra y externas.

**Figura 5.** Distribución de frecuencias del retraso de liberación por fase.
La línea discontinua indica el límite superior de especificación (2 días). La
asimetría positiva observada motivó el empleo de pruebas no paramétricas y del
método de percentiles para el cálculo de la capacidad del proceso.

## Cómo insertarlas en Word

Son SVG: Word 2016 y posteriores los inserta directamente (*Insertar →
Imágenes*) y mantienen la nitidez al imprimir. Si su versión no los admite,
ábralas en el navegador y guárdelas como PNG.

## Criterio de diseño

Blanco y negro con un gris de apoyo, sin colores: una tesis se imprime a una
tinta y un gráfico que depende del color se vuelve ilegible. La fase previa va
en gris y con marcador hueco; la posterior en negro y macizo.
