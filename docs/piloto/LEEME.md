# Prueba piloto del estudio — datos simulados

Estos seis archivos salen de una obra de ensayo de **veinte semanas**: diez
antes de implantar GCM y diez después. **Ningún dato es real**: sirven para
verificar que el análisis estadístico funciona antes de tener una obra
midiendo de verdad.

La obra se genera desde la propia aplicación —*Obra → Investigación → Datos
crudos → Obra de ensayo*— y es **determinista**: se regenera siempre igual, así
que un resultado de este ensayo se puede reproducir y discutir.

## Qué hay en cada archivo

| Archivo | Fila | Para qué |
|---|---|---|
| `dataset_consolidado.csv` | una semana | La serie temporal. Es el archivo principal |
| `dataset_compromisos.csv` | un compromiso | PPC y causas de no cumplimiento |
| `dataset_restricciones.csv` | una restricción | Capacidad del proceso y ANOVA |
| `dataset_tareas.csv` | una tarea | Desviación de plazo contra la línea base |
| `dataset_aprendizaje.csv` | un análisis de causa raíz | TRC, LRO y TCAC |
| `diccionario_variables.csv` | una variable | Qué significa cada columna. Anexo metodológico |

## Qué debería encontrar al analizarlos

- **PPC**: sube de ~58 % a ~81 %, con una semana mala dentro del periodo bueno.
- **Retraso de liberación**: media de 4,89 a 1,25 días.
- **Desviación estándar semanal del retraso**: baja de forma sostenida.
- **HHI**: sube de ~0,18 a ~0,45. Va al revés de lo que parece: al resolverse
  lo evitable, los fallos se concentran en lo externo.
- **Los retrasos tienen asimetría positiva**: Anderson-Darling debería rechazar
  normalidad y obligar a la transformación de Box-Cox antes de calcular Cp/Cpk.

## Lo que este piloto quiere enseñar

Los datos **no son perfectos a propósito**. Traen los casos que van a aparecer
en la obra real y que conviene resolver ahora:

- Una semana **sin ninguna restricción**: media y desviación salen vacías, no
  cero.
- Otra con **una sola**: hay media, no hay desviación.
- **Restricciones sin resolver** y **tareas sin terminar**: columnas vacías.
- En aprendizaje, un análisis que **funcionó** (TRC 0 %), otro que **empeoró**
  (TRC 123 %) y uno **sin cerrar**.

## Formato

UTF-8 sin BOM, separador coma, punto decimal, fechas ISO. Los valores perdidos
son **celdas vacías**, nunca ceros. Las dicotómicas van como 0/1.

En SPSS: *Archivo → Abrir → Datos*, tipo CSV, marcando que la primera fila trae
los nombres de las variables. En JASP se abren directamente; conviene revisar
que `causa_cod` y `cumplimiento` queden como nominales y no como escala.
