---
name: esconder-algo-no-lo-caza-la-bateria
description: "Un cambio que consiste en NO ensenar algo pasa typecheck, lint, pruebas y build estando mal; hay que recorrer las pantallas"
metadata:
  type: feedback
---

El 24 de agosto de 2026 llevé la regla de «obra cerrada» a las veintidós
pantallas de GCM: esconder los botones que el servidor iba a rechazar. Typecheck,
lint, 3028 pruebas y build en verde. Lo di por hecho.

Al recorrerlo en pantalla salieron **cinco fallos**, y ninguno lo cazaba nada de
eso:

- Los botones de las PÁGINAS no estaban cubiertos, solo los de los componentes.
- Diez guardas habían caído dentro del subcomponente equivocado, porque mi
  patrón de «el último hook» no reconocía los hooks con genéricos
  (`useActionState<Estado, FormData>(`) y se iba al siguiente que encontraba,
  ya dentro de otro componente del mismo archivo.
- Una pantalla se quedó muda: su estado vacío dependía de un PERMISO, y el
  permiso sigue puesto en una obra cerrada.
- En galería escondí de más: solo una de las nueve funciones del servicio tenía
  guarda, así que quité botones que sí funcionaban.
- Otra pantalla se quedó con una barra de filtros huérfana, acotando una lista
  que ya no estaba.

**Why:** las pruebas comprueban que lo que se dibuja es correcto; no comprueban
lo que YA NO se dibuja, ni que lo que queda siga teniendo sentido sin ello.
Esconder algo cambia el contexto de todo lo que estaba a su alrededor —un
formulario que se va deja su cabecera colgando, un estado vacío que dependía de
otra condición deja de aparecer— y eso solo se ve mirando.

**How to apply:** cuando el cambio sea «dejar de mostrar X», recorrer las
pantallas afectadas antes de darlo por terminado, y mirar no solo que X no
está sino que lo que queda alrededor se sostiene solo. Y si el cambio se aplicó
con un script sobre muchos archivos, AUDITAR dónde cayó cada inserción: un
patrón que acierta en veinte archivos falla en diez sin avisar. Ver
[[clic-por-referencia-no-llega-a-react]] para el error simétrico —dar por roto
lo que funciona— y [[powershell-corrompe-la-codificacion]], que es la otra cosa
que la batería verde no caza.

**Y un detector que no vale para esto:** buscar la guarda (`motivoSiObraCerrada`)
dentro del cuerpo de cada función exportada da falsos negativos. Media docena de
servicios de GCM la llaman a través de un ayudante compartido
(`contextoEditable`, `borradorEditable`, `puertaDeEscritura`). Hay que seguir
una llamada de profundidad o se concluye que no guardan servicios que sí lo
hacen.
