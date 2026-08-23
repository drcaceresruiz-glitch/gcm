# Como se ve HOY el informe real de LARQUITECTURA STUDIO (la verdad de referencia)

Tomado de "EJEMPLO INFORME 2.pdf" y "EJEMPLO DE INFORME 1.pdf". Todo lo que aqui
se describe DEBE seguir existiendo en la hoja rehecha, en su sitio y con su mismo
peso visual.

---

## HOJA 1 — DASHBOARD DE CONTROL (apaisada, 1123x794)

CABECERA
- Arriba izquierda: "LARQUITECTURA STUDIO SAC" ~8.5px, MAYUSCULAS, gris claro, tracking 0.12em.
- Debajo: "LABORATORIO CRIOCORD - LURIN" ~30px, peso LIGERO (300), gris muy oscuro.
  Titulo FINO, jamas negrita. GUION SIMPLE "-", no raya larga.
- Arriba derecha, dos lineas ~10px gris medio, cada una con icono de linea fina:
    "(calendario) Corte de Control: 08 de Agosto, 2026"
    "(persona) Residente: ARQ. EDUARDO PEREZ CAP 32467"
- Linea horizontal fina gris cruzando todo el ancho.

COLUMNA IZQUIERDA (~28%)
- Rotulo "AVANCE DE OBRA" ~9px MAYUSCULAS tracking 0.09em gris medio, con linea fina debajo.
- Donut: anillo de ~14px de grosor sobre aro gris MUY claro; arco terracota desde arriba
  en sentido horario. Centro: el porcentaje en TERRACOTA ~26px peso normal, y debajo
  "REAL" ~8px gris mayusculas.
- Bajo el donut, dos cifras separadas por linea vertical fina:
    izquierda "11%" (~15px gris oscuro) sobre "PLANEADO" (~8px gris mayusculas)
    derecha "+0.0%" (~15px TERRACOTA) sobre "DESVIACION"
- Rotulo "CONTROL DE CAPITULOS" con icono de capas al extremo derecho del rotulo.
- Lista de capitulos, separacion ~10px entre uno y otro:
    Texto: "Capitulo II: Trabajos Preliminares" ~8.5px NEGRITA gris oscuro a la izquierda;
    a la derecha "P: 100%" gris ~8px y luego "R: 97%" en TERRACOTA NEGRITA.
    Debajo, barra de ~3px de alto, fondo gris muy claro, rellena en terracota hasta el
    % REAL, y encima una MARCA VERTICAL NEGRA de 2px de ancho y ~9px de alto (sobresale
    arriba y abajo de la barra) en la posicion del % PLANEADO.
    Numeracion ROMANA. El original muestra: II, III, IV, VI, VII, VIII.

COLUMNA CENTRO (~45%)
- Rotulo "CURVA S - PROYECCION" (GUION SIMPLE) con linea debajo.
- Eje Y con 0/25/50/75/100 en gris ~8px; rejilla horizontal PUNTEADA gris muy claro
  (TODAS las lineas punteadas, incluida la del 0).
- Eje X: 01/08, 03/08, 05/08, 08/08, 15/08, 30/08, 15/09, 30/09, 22/10.
- Serie "Avance Planeado": linea PUNTEADA gris con punto circular gris en cada vertice,
  en S hasta 100 al final.
- Serie "Avance Real": linea SOLIDA terracota ~1.5px con puntos circulares terracota
  rellenos, que SOLO llega hasta la fecha de corte.
- En la fecha de corte: linea vertical gris fina de arriba abajo, y junto a ella un
  recuadro de anotacion (fondo blanco, borde fino, esquinas rectas) con tres lineas:
  la fecha, "Avance Planeado : N", "Avance Real : N".
- Leyenda centrada debajo ~8px: "···· Avance Planeado" (gris) y "— Avance Real" (terracota).
- Rotulo "PARTIDAS ACTIVAS DESTACADAS" con linea e icono de pulso al extremo derecho.
- Tabla con cabecera gris ~8.5px peso NORMAL (ni mayusculas ni negrita):
  "ID | Descripcion de Tarea | Fechas | % Plan | % Real".
  ID en gris claro; descripcion gris oscuro ~9px; fechas "08/08 - 10/08" en gris;
  "% Plan" y "% Real" alineados a la DERECHA.
  COLOR: "% Real" en TERRACOTA NEGRITA cuando alcanza o supera al plan, en NEGRO NEGRITA
  cuando va por debajo. Separador entre filas: linea gris muy fina.

COLUMNA DERECHA (~27%)
- Rotulo "ALERTAS DE ATRASO" en TERRACOTA (este si lleva color) con linea debajo e icono
  de informacion circular al extremo derecho.
- Tarjetas apiladas, fondo gris muy claro #f7f7f7, SIN borde, padding ~10px, esquinas
  rectas o apenas redondeadas:
    linea 1: descripcion de la partida ~8.5px gris oscuro (puede ocupar dos lineas)
    linea 2: severidad en MAYUSCULAS ~7.5px negrita a la izquierda ("CRITICO" terracota,
             "BAJO" amarillo-oliva) y el desfase a la derecha ("-2 dias") ~9px negrita.

PIE
- Linea horizontal fina, y debajo centrado ~8px MAYUSCULAS tracking amplio gris claro:
  "REPORTE GENERADO EL 08 DE AGOSTO, 2026 • DASHBOARD DE CONTROL DE OBRA"

---

## HOJA 2 — CRONOGRAMA TIPO MS PROJECT (apaisada, 1123x794)

- Esquina superior izquierda: logotipo de la empresa en recuadro pequeno.
- Esquina superior derecha, alineado a la derecha ~7px gris, varias lineas:
    "LABORATORIO INSTITUTO DE CRIOPRESERVACION Y TERAPIA CELULAR"
    "Carretera Panamericana Sur Km 29.5, Lima"      <- LITERAL, sin anadir "Lurin"
    "LARQUITECTURA STUDIO SAC  /  RUC N° 20601689988"
    "sab 08/08/26"
    "11%"
- Mitad izquierda (~48% del ancho): tabla con columnas, con SUS ROTULOS COMPLETOS:
    "Id | Modo de tarea | Nombre de tarea | Duracion | Comienzo | Fin | Predecesoras |
     % Planeado | % completado"
    Fila 1 (el proyecto) con fondo TERRACOTA y texto blanco negrita.
    Filas de CAPITULO en negrita con fondo beige/naranja muy claro.
    Tareas normales sobre blanco, con sangria en el nombre.
    Fechas "lun 03/08/26". Duracion con PUNTO decimal: "8.8 dias". Predecesoras
    "24FC+3 dias", "35FC-5 dias", "25CC".
- Mitad derecha: Gantt.
    Escala arriba: meses "jul '26 | ago '26 | sep '26 | oct '26" y debajo numeros de
    semana "12 19 26 02 09 16 23 30 06 13 20 27 04 11".
    Barras: resumen = barra negra gruesa con puntas triangulares; tarea = barra azul;
    tarea critica = barra roja; hito = ROMBO NEGRO (debe existir como fila dentro del
    Gantt, no solo en una banda aparte); progreso = linea NEGRA fina dentro de la barra.
    Etiquetas de fecha pequenas pegadas a los extremos de CADA barra ("03/08" izquierda,
    "05/08" derecha), incluidas las de resumen y capitulo.
- Pie: leyenda de MS Project con ~26 tipos de barra (Tarea, Division, Hito, Resumen,
  Resumen del proyecto, Agrupar por sintesis, Tarea resumida, Tarea critica resumida,
  Hito resumido, Progreso resumido, Tareas externas, Hito externo, Tarea inactiva,
  Hito inactivo, Resumen inactivo, Tarea manual, solo duracion, Informe de resumen
  manual, Resumen manual, solo el comienzo, solo fin, Fecha limite, Tarea critica,
  Progreso, Tareas en ejecucion, Tareas completadas).
- Abajo a la izquierda, en DOS LINEAS SEPARADAS:
    "Proyecto: PROGRAMACION EP"
    "Fecha: sab 08/08/26"

---

## HOJA 3 — PORTADA (vertical, 794x1123)

- La hoja esta CASI VACIA. Ese vacio es el diseno, no un descuido.
- El contenido vive en una banda centrada horizontalmente, un poco POR DEBAJO de la
  mitad vertical.
- Linea horizontal NEGRA GRUESA (~3px) de borde a borde del area de texto.
- Titulo en dos lineas centradas, Montserrat 200-300, ~48px, tracking MUY amplio
  (~0.35em), negro:
      "I N F O R M E"
      "D E   O B R A"
- Otra linea horizontal NEGRA GRUESA identica.
- Debajo, centrado, con aire:
      "OBRA" NEGRITA ~11px tracking amplio mayusculas
      "LABORATORIOS INSTITUTO DE" NEGRITA ~11px tracking amplio
      "CRIOPRESERVACION Y TERAPIA CELULAR" NEGRITA ~11px tracking amplio
      "Carretera Panamericana Sur Km 29.5, Lima" ~9px gris peso normal
- NADA MAS EN TODA LA HOJA. Sin color: solo negro y gris.

---

## HOJA 4 — BITACORA FOTOGRAFICA DIARIA (vertical, 794x1123)

- Linea horizontal NEGRA GRUESA (~2.5px) arriba, cruzando el ancho.
- Titulo "I N F O R M E" / "D E   O B R A" en dos lineas, Montserrat 200-300, ~34px,
  tracking ~0.3em, alineado a la DERECHA.
- Otra linea NEGRA GRUESA que NO llega al borde izquierdo: arranca ~11% desde la
  izquierda, dejando un hueco libre a su izquierda.
- En ese hueco, MONTADO A LA ALTURA de la regla (no debajo): la semana en Montserrat
  ligero ~64px gris claro #c8c8c8, p.ej. "S1".
- A la derecha del numero de semana:
    "OBRA LABORATORIOS INSTITUTO DE" / "CRIOPRESERVACION Y TERAPIA CELULAR" en SERIF
    ITALICA ~9px MAYUSCULAS tracking amplio gris oscuro (dos lineas).
    "DIA LABORAL 4  04/08/2026" en NEGRITA ~13px sans, TODO EN UNA SOLA VOZ (misma
    fuente, mismo peso, mismo tamano para el numero y la fecha).
    "Direccion : Carretera Panamericana Sur Km 29.5, Lima" ~10px gris oscuro.
    "Fecha : 31 de Julio al 08 de Agosto del 2026" ~10px gris oscuro.
- Galeria: 2 filas x 3 columnas, separacion ~8px IGUAL en horizontal y vertical,
  esquinas ~4px, relacion de aspecto 4:3, ocupando todo el ancho util. Las fotos son
  el ~60% de la hoja y deben seguir siendolo.
- Sobre cada foto, esquina INFERIOR IZQUIERDA, sello de geolocalizacion: recuadro
  semitransparente oscuro, texto blanco ~5px, cuatro lineas:
      "OBRA CRIOCORD" / "Peru" / "Departamento de Lima" / "31 jul. 2026 11:59:21 a. m."
- Rotulo "TRABAJO REALIZADO :" ~11px MAYUSCULAS tracking amplio gris oscuro, peso NORMAL.
- Lista con vinetas (•) ~9px, interlineado ~1.65, frases tecnicas en pasado impersonal.

---

## HOJA 5 — CONTROL ECONOMICO Y LAST PLANNER (apaisada, 1123x794)

Esta hoja NO existe en el informe actual: es una propuesta. Pero debe parecer del MISMO
documento: mismo blanco, mismo terracota, rotulos en MAYUSCULAS ~9px con linea fina
debajo, misma densidad, mismo pie centrado. Todo su contenido va marcado data-nuevo.
