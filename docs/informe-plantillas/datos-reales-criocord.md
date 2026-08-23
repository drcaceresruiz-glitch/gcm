# Datos reales de CRIOCORD, tomados de los dos PDF de ejemplo

Fuente: "EJEMPLO INFORME 2.pdf" (corte 08/08/2026) y "EJEMPLO DE INFORME 1.pdf"
(corte 03/08/2026). Estas son las cifras que deben aparecer en las hojas, no
cifras inventadas.

## Cabecera
- Empresa: LARQUITECTURA STUDIO SAC — RUC N° 20601689988
- Obra: LABORATORIO CRIOCORD - LURIN
  (nombre largo: Laboratorio Instituto de Criopreservacion y Terapia Celular)
- Direccion: Carretera Panamericana Sur Km 29.5, Lima  (Lurin / Megacentro Lurin)
- Residente: ARQ. EDUARDO PEREZ CAP 32467
- Corte de Control: 08 de Agosto, 2026
- Proyecto (MS Project): "PROGRAMACION EP", 51 dias, sab 01/08/26 a lun 05/10/26

## Avance al corte 08/08
- REAL: 11%   PLANEADO: 11%   DESVIACION: +0.0%
(en el corte anterior, 03/08: REAL 3%, PLANEADO 2%, DESVIACION +1.0%)

## Capitulos al 08/08  (P = planeado, R = real)
| Capitulo | P | R |
|---|---|---|
| I. Gestion, Seguridad y Costos Indirectos | 100% | 100% |
| II. Trabajos Preliminares | 100% | 97% |
| III. Demoliciones y Desmontajes | 94% | 100% |
| IV. Movimiento de Tierra y Cimentaciones | 64% | 66% |
| V. Estructuras Metalicas y Losas | 0% | 0% |
| VI. ACI (Agua Contra Incendios) | 0% | 0% |
| VII. Instalaciones Sanitarias | 16% | 22% |
| VIII. Instalaciones Electricas y Comunicaciones | 0% | 2% |
| IX. DACI (Deteccion y Alarma) | 0% | 0% |
| X. HVAC | 0% | 0% |
| XI. Arquitectura y Acabados | 0% | 0% |
| XII. Cierre, Pruebas Integrales y Entrega | 0% | 0% |

El dashboard original muestra solo: II, III, IV, VI, VII, VIII.

## Alertas de atraso al 08/08
- "4.4 Solados para zapatas, acero corrugado y vaciado" — CRITICO — -2 dias
- "2.4 Trazo y Replanteo" — BAJO — -1 dia

## Partidas activas destacadas al 08/08
| ID | Descripcion | Fechas | % Plan | % Real |
|---|---|---|---|---|
| 25 | 3.3 Eliminacion de material excedente | 08/08 - 10/08 | 63% | 100% |
| 30 | 4.4 Solados para zapatas, acero corrugado y vaciado | 07/08 - 10/08 | 83% | 30% |
| 46 | 7.2 Nivelacion cama de arena, entubado y rellenado | 06/08 - 10/08 | 88% | 100% |
| 47 | 7.3 Conexiones de TRONCAL principal desague | 07/08 - 10/08 | 81% | 81% |
| 48 | 7.3.1 Conexiones de agua y desague general | 10/08 - 15/08 | 0% | 10% |

Regla de color observada: % Real en TERRACOTA cuando alcanza o supera al plan,
en NEGRO NEGRITA cuando va por debajo (el 30% de la fila 30 va en negro).

## Eje X de la curva S (original)
01/08, 03/08, 05/08, 08/08, 15/08, 30/08, 15/09, 30/09, 22/10

## Hitos clave del proyecto (del Gantt)
- 0.1 Inicio de Obra y Entrega del almacen A-12 MEGACENTRO LURIN — 01/08 — 100%
- 0.2 Fin de Trabajos Preliminares y Demoliciones — 10/08
- 0.3 Fin de Cimentaciones y Estructura Metalica — 28/08
- 0.4 Fin de Trabajos de proveedores Criocord (CO2 y demas instalaciones) — 16/09
- 0.5 Cierre de Tabiqueria Drywall — 19/09
- 0.6 Fin de Instalaciones Electromecanicas — 18/09
- 0.7 Fin de Acabados generales — 05/10
- 0.8 Comisionamiento y Pruebas Generales — 18/09
- 0.9 Recepcion Final de la Obra — 05/10

## Tareas reales para el Gantt (muestra fiel, con predecesoras reales)
- 16  2.0 CAPITULO II: TRABAJOS PRELIMINARES — 5 dias — lun 03/08/26 — vie 07/08/26 — P100 R97
- 17  2.1 Movilizacion y desmovilizacion — 1 dia — lun 03/08 — lun 03/08 — P100 R100
- 18  2.2 Instalaciones provisionales (Almacen, oficina) — 2 dias — lun 03/08 — mar 04/08 — P100 R100
- 19  2.3 Cerramientos y senalizacion de area de trabajo — 1 dia — mie 05/08 — mie 05/08 — pred 18 — P100 R100
- 20  2.4 Trazo y Replanteo de ejes y niveles — 2 dias — jue 06/08 — vie 07/08 — pred 19 — P100 R95
- 21  2.5 Habilitacion de redes electricas prov. e internet — 1 dia — lun 03/08 — lun 03/08 — P100 R90
- 22  3.0 CAPITULO III: DEMOLICIONES Y DESMONTAJES — 6 dias — lun 03/08 — lun 10/08 — P94 R100
- 25  3.3 Eliminacion de material excedente — 1 dia — sab 08/08 — lun 10/08 — pred 24FC+3 dias — P63 R100
- 26  4.0 CAPITULO IV: MOV. DE TIERRA Y CIMENTACIONES — 8.8 dias — lun 03/08 — jue 13/08 — P64 R66
- 29  4.3 Excavacion para zapatas (4.25 m3) — 1 dia — mar 04/08 — vie 07/08 — pred 28 — P100 R100
- 30  4.4 Solados para zapatas, acero corrugado y vaciado f'c 210 — 1 dia — vie 07/08 — lun 10/08 — pred 29 — P83 R30
- 31  4.5 Curado de concreto en zapatas — 3 dias — lun 10/08 — jue 13/08 — pred 30 — P0 R0
- 33  5.0 CAPITULO V: ESTRUCTURAS METALICAS Y LOSAS — 15 dias — lun 10/08 — vie 28/08 — P0 R0
- 44  7.0 CAPITULO VII: INSTALACIONES SANITARIAS — 35 dias — lun 03/08 — mar 15/09 — P16 R22
- 47  7.3 Conexiones de TRONCAL principal desague piso 1 — 2 dias — vie 07/08 — lun 10/08 — pred 46FC-2 dias — P81 R81
- 54  8.0 CAPITULO VIII: INST. ELECTRICAS Y COMUNICACIONES — 36 dias — jue 20/08 — lun 05/10 — P0 R2

## Bitacora — dias reales de la semana S1
- DIA LABORAL 0 — 31/07/2026 — Desmontaje de tabiqueria existente y falso techo /
  Desmontaje de gabinete ACI existente / Trazo y cortes de instalaciones sanitarias
  desague primer piso / Trazo y cortes de losa para zapatas zona de laboratorios
- DIA LABORAL 4 — 04/08/2026 — tendido y canalizacion de red electrica (conduit y
  cajas de paso) Zona 1 primer nivel / habilitacion de carpinteria metalica Zona 2
  en taller externo, llegada 10/08 / carpinteria metalica de refuerzo Zona 1
  segundo nivel, llegada 14/08 / eliminacion de desmonte de la contrata de drywall
  con segregacion y acopio de baldosas reutilizables / excavacion manual de zanjas
  de desague y ensacado de excedente / trazo y replanteo Zona 1 segundo nivel
- DIA LABORAL 8 — 08/08/2026 — eliminacion de desmonte y residuos liberando el
  primer nivel / llenado de 4 zapatas en la Zona de Laboratorios / colocacion de
  tuberias en la red de desague
- Rango de la semana S1: "31 de Julio al 08 de Agosto del 2026"
- Sello de las fotos: "OBRA CRIOCORD / Peru / Departamento de Lima /
  31 jul. 2026 11:59:21 a. m."

## Datos economicos (de la base real, via el asistente de GCM)
- Presupuesto total: S/ 745,553.36
- Comprometido: S/ 196,400.50 (26.34%)
- Saldo: S/ 549,152.86
- Partidas sobregiradas: 12
- Plazo: 01/08/2026 al 05/10/2026

## Contraste verificado para impresion sobre papel blanco
- Terracota de marca  #b2551f  4.99:1  (texto y relleno)
- Gris serie planeado #8f8f8a  3.25:1  (linea de grafico; el #9c9c97 original da 2.76 y no llega)
- CRITICO (texto)     #b23b28  5.92:1
- BAJO (texto)        #8f6210  5.35:1  (el amarillo #dd9c00 da 2.38, ilegible a 7.5px)
- BAJO (relleno)      #c78a06  2.97:1  (solo como barra, siempre con etiqueta al lado)
- Exito (texto)       #1f8440  4.74:1
