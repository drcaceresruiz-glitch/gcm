# Revisión crítica del planteamiento

Lectura del 28 de agosto de 2026, hecha **buscando por dónde puede atacarla un
jurado**. No propone cambiar el título, las preguntas, los objetivos ni las
hipótesis: todo lo que sigue se resuelve en el capítulo de metodología y en el
análisis.

---

## Lo que ya está sólido

Conviene saber qué no hay que tocar, para no gastar esfuerzo ahí.

- **El diseño encaja con el objeto.** Una obra es única e irrepetible; no hay
  grupo de control posible. Las series cronológicas interrumpidas son la
  respuesta correcta, y está bien argumentado por qué no un preexperimento de
  una sola medición antes y después.
- **La declaración de conflicto de interés.** Es el punto que más se ataca en
  una tesis donde el investigador desarrolló la herramienta, y está cubierto
  con cuatro medidas concretas —registro automático, indicadores tomados de la
  literatura, plan de análisis fijado antes de recolectar, y datos crudos
  anexados—. Esto es más de lo que presenta la mayoría.
- **No pedir inferencia al cuestionario.** Con un equipo de cinco a quince
  personas, declararlo descriptivo es lo correcto y le quita al jurado un
  argumento fácil.
- **La fase previa en papel.** Mantiene el método constante y deja variar solo
  el soporte, que es lo que el título afirma medir.

---

## Los tres puntos por donde puede atacarla

### 1. El análisis no está a la altura del diseño *(el más importante)*

**El problema.** El diseño declarado es de series cronológicas interrumpidas,
pero el análisis previsto —t de Welch o U de Mann-Whitney entre dos grupos—
es el de un diseño de dos grupos independientes. Esa prueba compara **dos
promedios** y, al hacerlo, tira a la basura justo lo que hace valiosa una
serie: el orden de las semanas.

Dicho de otro modo: un jurado puede preguntar *«si tenía usted veinte
observaciones ordenadas en el tiempo, ¿por qué las analizó como si fueran dos
montones desordenados?»*.

**Por qué importa de verdad.** La fase previa ya introduce el ritual del Last
Planner. Un equipo que empieza a planificar mejora **por el solo hecho de
practicar**, y esa mejora sigue creciendo durante la fase posterior. Si el PPC
venía subiendo antes de instalar el sistema, una comparación de promedios
atribuye a la aplicación una pendiente que ya existía. Esa objeción —se llama
**maduración**— es la que hunde este tipo de estudios.

**La solución, que no cambia nada de lo planteado.** Añadir al análisis una
**regresión segmentada**, que es el método estándar de las series
interrumpidas. Se construyen tres predictores por semana:

| Predictor | Qué vale |
|---|---|
| **Tiempo** | 1, 2, 3 … hasta la última semana |
| **Intervención** | 0 en la fase previa, 1 en la posterior |
| **Tiempo tras la intervención** | 0 antes; 1, 2, 3 … contando desde la primera semana con el sistema |

Y se lee el resultado así:

- El coeficiente de **Tiempo** es la tendencia que ya traía la obra **sin** el
  sistema. Si sale positivo y significativo, ahí está la maduración, medida.
- El de **Intervención** es el **salto inmediato** al implantar el sistema.
- El de **Tiempo tras la intervención** es el **cambio de pendiente**: si el
  sistema además aceleró la mejora.

Eso responde a la objeción con un número en vez de con un argumento, y
**refuerza H1 en lugar de sustituirla**: la prueba de contraste de medias se
mantiene, y la regresión se añade como análisis complementario.

**Se puede hacer en JASP** con *Regression → Linear Regression*: la variable
dependiente es el PPC semanal y los tres de arriba son los predictores. No
hace falta otro software.

### 2. Las semanas seguidas no son observaciones independientes

**El problema.** La t de Student y la U de Mann-Whitney suponen que cada
observación es independiente de las demás. En una serie temporal eso no se
cumple: la semana 8 se parece a la 7 porque es la misma obra, el mismo equipo
y casi el mismo frente de trabajo. Se llama **autocorrelación**, y cuando
existe, el valor p sale más pequeño de lo que corresponde — es decir, **hace
parecer significativo lo que quizá no lo es**.

**La solución.** Comprobarlo y declararlo. El estadístico **Durbin-Watson**
sale en la misma regresión de JASP marcando la casilla correspondiente; entre
1,5 y 2,5 se acepta que no hay autocorrelación problemática. Si sale fuera de
ese rango, se declara como limitación y se interpretan los resultados con esa
cautela.

Un jurado que sepa de series temporales va a preguntar por esto. Tener el
Durbin-Watson calculado y comentado, aunque salga bien, demuestra que lo
consideró.

### 3. La fase constructiva puede estar haciendo el trabajo

**El problema.** El propio capítulo de metodología dice que una obra atraviesa
fases de naturaleza distinta —tierras, estructuras, acabados— con
incertidumbres propias. Lo dice para justificar el diseño, pero luego **no lo
controla**. Si la fase previa coincide con estructuras y la posterior con
acabados, la mejora observada puede ser del tipo de trabajo y no del sistema.

**La solución, que es solo de registro.** Anotar en qué fase constructiva está
cada semana y llevarlo a la exportación como una columna más. Con eso puede
hacer dos cosas: describir la composición de cada fase del estudio —y así el
lector ve que no hay un salto brutal—, o incluirla como covariable si hiciera
falta.

**Es una decisión que hay que tomar ANTES de empezar**, porque después ya no
se puede reconstruir con honestidad.

---

## Un punto teórico que conviene blindar

**H3 predice que el HHI aumenta**, es decir, que las causas de fallo se
**concentran** tras implantar el sistema. Es una predicción arriesgada, y es
justo el tipo de cosa por la que preguntan.

El razonamiento que la sostiene: al registrar y analizar las causas, la obra
elimina las que puede controlar —falta de prerrequisitos, materiales no
pedidos a tiempo— y quedan las que no controla —clima, decisiones del
cliente—. Menos categorías activas significa mayor concentración. Por eso H3
predice a la vez que **sube el HHI** y que **baja la proporción de causas
evitables**: las dos mitades cuentan la misma historia y se sostienen la una a
la otra.

**Escríbalo en el marco teórico antes de que se lo pregunten.** Si el HHI baja
en lugar de subir, la lectura no es que el estudio falló: es que la obra
diversificó sus modos de fallo, y eso también se interpreta. Pero conviene
haberlo pensado antes de ver el resultado, no después.

---

## Riesgos prácticos, no metodológicos

1. **Cpk necesita entre 25 y 30 restricciones con ciclo completo por fase.**
   Si la obra no llega a ese número, ese indicador se cae. Cuéntelas al final
   de la fase previa: si no llegan, todavía está a tiempo de declarar el Cpk
   como análisis exploratorio en lugar de como resultado.
2. **Diez semanas de fase previa son diez semanas reales.** El calendario de
   la tesis tiene que contarlas.
3. **La clasificación de causas depende de una persona.** Si el residente que
   clasifica cambia a mitad del estudio, la comparación entre fases se
   contamina. Es la razón del Kappa de Cohen, y conviene aplicarlo con
   incumplimientos de **ambas** fases.

---

## Lo que yo haría en este orden

1. Añadir al apartado de métodos de análisis la **regresión segmentada** y el
   **Durbin-Watson**. Es media página y responde a la objeción más seria.
2. Decidir cómo se va a registrar la **fase constructiva** de cada semana,
   antes de empezar la fase previa.
3. Redactar el **fundamento teórico de H3** en el marco teórico.
4. Empezar la fase previa en papel.
