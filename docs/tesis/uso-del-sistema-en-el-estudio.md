# Cómo se usa el sistema para el estudio

Es la misma explicación que ahora aparece **dentro de la aplicación**, en la
pantalla de *Investigación*, recogida aquí para poder leerla sin abrirla y para
que su asesor la tenga.

En la aplicación está repartida en dos sitios: lo que se decide antes de tener
obra vive en la pantalla de entrada, y lo que se hace con los archivos vive
dentro de cada obra, junto a los botones de descarga.

---

## 1. El diseño, en una pantalla

Se mide **una sola obra** a lo largo del tiempo: diez o doce semanas antes de
implantar el sistema, y otras tantas después. La **semana** es la unidad de
análisis, porque es el ciclo del Last Planner.

```
O₁ O₂ O₃ … O₁₀    X    O₁₁ O₁₂ … O₂₀
```

No hay grupo de control ni asignación al azar, y no es un descuido: una obra es
única e irrepetible, y no existe otra idéntica que pueda correr en paralelo. Lo
que sustituye al grupo de control es **la propia obra antes de la
intervención**, medida muchas veces.

Por eso no vale medir una sola vez antes y otra después: una obra atraviesa
fases distintas —tierras, estructuras, acabados— y dos promedios sueltos
confundirían el efecto del sistema con el cambio de fase.

---

## 2. De dónde salen los datos de antes

De gestionar esas semanas con **Last Planner en papel**: mismas reuniones,
mismos compromisos, misma medición del PPC, mismas causas — con formatos
impresos. El protocolo completo y los tres formatos están en el documento
*Protocolo de la fase previa*.

Si en la fase previa no hubiera planificación semanal, no habría compromisos que
medir y **el PPC no sería cero: sería inexistente**.

Al terminar, esas semanas se cargan en el sistema y se marcan como
**reconstruidas**, de modo que ambas fases salen de la misma exportación y del
mismo cálculo.

---

## 3. El orden de trabajo dentro de la aplicación

1. **Fijar el punto de interrupción**: la fecha de la primera semana gestionada
   con el sistema. Sin ella, todas las semanas salen `SIN_CLASIFICAR` y no hay
   dos fases que comparar.
2. **Marcar el origen de cada semana**: gestionada con la herramienta, o
   reconstruida a partir de registros en papel.
3. **Declarar la apertura de cada análisis de causa raíz** si la fecha real
   difiere de cuando se registró. De ahí sale la latencia de reacción.
4. **Descargar y analizar fuera.**

---

## 4. Lo que se anota desde la primera semana

| Qué | Dónde vive | Por qué desde el primer día |
|---|---|---|
| La causa de cada incumplimiento | Plan semanal | Se elige una sola: la que lo originó, no la última de la cadena |
| Las dos fechas de cada restricción | Lookahead | Sin la comprometida no hay nada que juzgar; sin la real, el ciclo no ha terminado |
| La fase constructiva de la semana | Campo *fase* del Lookahead | Permite contestar que la mejora no es del tipo de trabajo |

---

## 5. Lo que NO se puede cambiar a mitad

- **Las definiciones de las nueve causas.** Es lo más delicado del estudio: esa
  tabla es a la vez el eje de la comparación entre fases y el instrumento del
  índice Kappa. Si a mitad alguien clasifica distinto, las series dejan de ser
  comparables y **no hay forma de arreglarlo después**.
- **Quién clasifica.** Si cambia la persona, la comparación se contamina.
- **El día de la reunión.** La semana del Last Planner es de siete días;
  moverla parte las series.
- **Los códigos de causa del 1 al 9.** Un estudio que cite «causa 3» tiene que
  seguir apuntando a lo mismo dentro de dos años.

---

## 6. Cuántos datos hacen falta

| Para qué | Cuánto | Si no llega |
|---|---|---|
| Comparar las series | 8 semanas por fase mínimo; 10–12 es lo razonable | Por debajo de 8 no se separa el cambio del ruido |
| Regresión segmentada | Las mismas semanas, sin huecos | Una semana sin datos se declara; no se rellena a ojo |
| Capacidad del proceso (Cpk) | 25–30 restricciones con las dos fechas, por fase | Se declara como exploratorio en vez de como resultado |
| Cuestionario | Todo el equipo que usó el sistema | Se reporta el tamaño y se declara como limitación |

---

## 7. Cómo leer los archivos sin equivocarse

- **Una celda vacía no es un cero.** Significa que no hubo dato. En JASP y SPSS
  entra como valor perdido, que es lo correcto. Rellenarla con cero mete una
  semana perfecta que nunca existió.
- **La desviación estándar necesita dos observaciones.** Con una sola sale
  vacía. Es muestral —divide entre n−1—, igual que la calculan JASP y SPSS.
- **Las semanas se numeran por fecha de corte**, no por el número del plan: las
  reconstruidas se cargan después y recibirían números altos con fechas
  antiguas.
- **Las causas viajan con código y etiqueta**, para poder leer el archivo sin
  el diccionario delante.
- **Los proveedores van anonimizados** con un código estable (`P001`, `P002`…),
  el mismo en todos los archivos y en todas las descargas.
- **El diccionario de variables se genera con los datos**, así que no puede
  quedarse desfasado. Va como anexo de la tesis.

---

## 8. Lo que el sistema NO hace, y es a propósito

La exportación entrega **la observación individual sin tocar** y los agregados
por semana. Ni un contraste, ni un valor p, ni una conclusión.

No es una carencia. Usted es el mismo que desarrolló el sistema, y **un
resultado que sale de la misma aplicación que generó los datos no lo puede
verificar nadie**. Calculándolo fuera, con los datos crudos anexados, cualquiera
puede repetir el análisis y llegar a los mismos números — o a otros, y decirlo.

Es una de las cuatro medidas de control del conflicto de interés que declara el
capítulo de metodología, y conviene decirlo en la sustentación antes de que lo
pregunten.

---

## 9. La obra de ensayo

Trae veinte semanas **simuladas**, con defectos deliberados: semanas sin
observaciones, muestras insuficientes para calcular dispersión, registros
incompletos y distribuciones asimétricas. Un piloto limpio no verifica nada; lo
que hay que ver antes de la obra real es cómo queda el archivo cuando *falta*
algo.

Se declara en la tesis como **verificación funcional del instrumento**,
diciendo expresamente que los datos son simulados y que no constituyen
resultados del estudio.

Borrarla y volver a crearla da exactamente los mismos números: se genera de
forma determinista, para que dos personas puedan reproducir la verificación.
