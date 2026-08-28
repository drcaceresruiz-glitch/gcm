# La regresión segmentada, explicada y con el ejemplo resuelto

Es el análisis que convierte sus veinte semanas en una serie cronológica de
verdad, en lugar de en dos montones de números. **No sustituye a ninguna de las
pruebas que ya tenía**: se suma a ellas.

---

## 1. Qué pregunta responde, y por qué la otra no basta

La t de Welch responde: *«¿el promedio de después es mayor que el de antes?»*.

La regresión segmentada responde algo que la anterior no puede: **«¿ya venía
subiendo?»**.

Importa porque durante la fase previa el equipo ya practica el ritual semanal
del Last Planner en papel, y **un equipo que practica mejora aunque nadie le
instale nada**. Si el PPC ya traía pendiente de subida, comparar promedios le
atribuye a su aplicación una mejora que ya estaba ocurriendo.

Es la objeción que un jurado formado plantea así: *«¿cómo distingue usted el
efecto de su sistema del simple hecho de que llevaban diez semanas
practicando?»*. Con esta regresión se contesta con un número.

---

## 2. Las tres columnas

Ya salen calculadas en el archivo `dataset_consolidado`. No hay que construirlas
a mano.

| Columna | Qué vale | Qué mide |
|---|---|---|
| `semana_indice` | 1, 2, 3 … 20 | La **tendencia que la obra ya traía** |
| `intervencion` | 0 en las semanas previas, 1 desde la implantación | El **salto** el día que entra el sistema |
| `tiempo_post` | 0 antes; 1, 2, 3 … desde la primera semana con sistema | El **cambio de pendiente** posterior |

> **Por qué salen calculadas.** `tiempo_post` cuenta desde la primera semana
> **posterior**, no desde el principio de la serie. Desplazarla una posición
> cambia el resultado sin que nada avise, y es el error más común al hacerlo a
> mano.

---

## 3. Cómo se corre en JASP

1. Abra `dataset_consolidado.csv`.
2. Menú **Regression → Linear Regression**.
3. En **Dependent Variable** ponga `ppc_pct`.
4. En **Covariates** ponga las tres: `semana_indice`, `intervencion` y
   `tiempo_post`.
5. Despliegue **Statistics** y marque **Durbin-Watson** (está bajo *Residuals*).

Nada más. Es la regresión lineal de siempre; lo que la convierte en un análisis
de series interrumpidas son las tres columnas, no una opción escondida.

**Para las demás variables** repita cambiando solo la dependiente:
`tasa_liberacion_oportuna_pct`, `retraso_media_dias`, `retraso_desv_dias`,
`hhi_causas`.

---

## 4. Cómo se lee el resultado

Esto es lo que sale con los datos de la prueba piloto. **Úselo para comprobar
que lo está haciendo bien**: si sus números coinciden con estos al abrir el
archivo del piloto, el procedimiento es correcto.

| Predictor | Coeficiente | t | Qué significa |
|---|---|---|---|
| (constante) | 57,44 | 18,77 | El PPC de partida |
| `semana_indice` | 0,04 | 0,09 | **La tendencia previa** |
| `intervencion` | 14,96 | 3,71 | **El salto** |
| `tiempo_post` | 1,37 | 1,97 | **El cambio de pendiente** |

R² = 0,897 · Durbin-Watson = 2,60

**Traducido a palabras**, y esta es la frase que va en el capítulo de
resultados:

> Antes de implantar el sistema, el PPC **no mostraba tendencia de mejora**
> (0,04 puntos por semana; t = 0,09, no significativo). Al implantarlo se
> produjo un **salto inmediato de casi 15 puntos** (t = 3,71), y a partir de
> ahí el indicador siguió creciendo **1,37 puntos por semana** (t = 1,97).

Fíjese en lo que hace el primer renglón: **demuestra que no venía subiendo**.
Eso es exactamente lo que la comparación de promedios no podía demostrar, y es
el renglón que cierra la objeción.

### Si la tendencia previa sale significativa

No es un desastre y no invalida nada. Significa que la obra ya venía
mejorando, y entonces **el efecto de su sistema es el salto y el cambio de
pendiente, no la diferencia bruta de promedios**. Se reporta así, y es más
honesto que ignorarlo. La regresión ya se lo separó.

---

## 5. El Durbin-Watson

Sale en la misma tabla. Sirve para una sola cosa: comprobar si las semanas se
parecen demasiado a su vecina —lo que se llama autocorrelación—, porque cuando
eso ocurre **el valor p sale más pequeño de lo que corresponde** y las cosas
parecen más significativas de lo que son.

| Valor | Lectura |
|---|---|
| Entre 1,5 y 2,5 | Sin problema. Se reporta y se sigue |
| Menor que 1,5 | Autocorrelación positiva: hay que declararla como limitación |
| Mayor que 2,5 | Autocorrelación negativa: se declara igual |

En el piloto sale **2,60**, algo por encima del rango. Es un dato simulado, así
que no significa nada por sí mismo, pero sirve de ejemplo de lo que hay que
hacer: **decirlo**. Una limitación declarada resta mucho menos que una que
descubre el jurado.

---

## 6. Qué párrafo se añade al capítulo de metodología

En el apartado de métodos de análisis, después del contraste de hipótesis:

> Adicionalmente, y en correspondencia con el diseño de series cronológicas
> interrumpidas, se estimó un **modelo de regresión segmentada** (Wagner,
> Soumerai, Zhang y Ross-Degnan, 2002) sobre la serie semanal, con tres
> predictores: el tiempo transcurrido, una variable dicotómica de intervención
> y el tiempo transcurrido desde la intervención. Este modelo permite estimar
> por separado la tendencia preexistente, el cambio de nivel y el cambio de
> pendiente asociados a la implementación, distinguiendo el efecto de la
> intervención de la maduración propia del equipo. Se verificó la
> independencia de los residuos mediante el estadístico de Durbin-Watson.

**Referencia para la bibliografía:**

> Wagner, A. K., Soumerai, S. B., Zhang, F., & Ross-Degnan, D. (2002).
> Segmented regression analysis of interrupted time series studies in
> medication use research. *Journal of Clinical Pharmacy and Therapeutics,
> 27*(4), 299–309.

Es el artículo que estandarizó el método. Nació en farmacoepidemiología y hoy
se usa en cualquier campo con series interrumpidas; citarlo le da respaldo a la
decisión.
