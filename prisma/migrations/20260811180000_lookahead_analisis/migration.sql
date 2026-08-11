/*
  Las restricciones del Lookahead se ELIGEN, ya no se siembran.

  Hasta ahora "Sincronizar ventana" creaba las 7 restricciones a toda tarea,
  incluidos los hitos de duracion cero. El efecto era que "cero restricciones"
  y "nadie la ha mirado" eran la misma fila, y de esa confusion venia que el
  porcentaje de confiabilidad midiera la falta de analisis en vez de la obra.

  Esta migracion:
    1. Anade `analizadaAt`/`analizadaPor`, que es lo que distingue "revisada y
       no le aplica ninguna" de "sin analizar".
    2. Retira la siembra que nadie llego a tocar. Solo lo que esta EN BLANCO
       (sin resolver, sin fotos, sin detalle y sin documento) y solo de tareas
       donde nadie resolvio nada. Todo lo demas se conserva intacto.
    3. Marca como analizadas las tareas que si tienen trabajo encima.
    4. Recalcula el semaforo con la regla nueva, respetando BLOQUEADO, que es
       una marca manual.
    5. Impide que un flujo aparezca dos veces en la misma tarea.

  El orden importa: el indice unico va al final, cuando la tabla ya esta
  limpia, y el borrado va antes del backfill porque el backfill se apoya en
  que solo sobrevivan las restricciones que alguien trabajo.
*/

-- 0. Red de seguridad: duplicados (lookaheadTaskId, tipo) antes del unico.
--    No deberia haber ninguno —el unico creador sembraba los 7 tipos de
--    golpe—, pero si los hubiera el CREATE UNIQUE INDEX fallaria y dejaria la
--    migracion a medias. Gana la resuelta; a igualdad, la mas antigua.
DELETE r FROM `restricciones_tarea` r
JOIN `restricciones_tarea` m
  ON  m.`lookaheadTaskId` = r.`lookaheadTaskId`
  AND m.`tipo` = r.`tipo`
  AND ( m.`resuelta` > r.`resuelta`
     OR ( m.`resuelta` = r.`resuelta`
          AND ( m.`createdAt` < r.`createdAt`
             OR ( m.`createdAt` = r.`createdAt` AND m.`id` < r.`id` ) ) ) );

-- 1. Columnas nuevas. Van antes de cualquier backfill.
ALTER TABLE `lookahead_tareas` ADD COLUMN `analizadaAt` DATETIME(3) NULL,
    ADD COLUMN `analizadaPor` VARCHAR(150) NULL;

-- 2. Retirar la siembra intacta.
--    La tabla temporal no es estilo: MySQL prohibe subconsultar la tabla
--    objetivo de un DELETE, y hace falta saber que tareas tienen ALGO resuelto
--    antes de tocar ninguna de sus filas.
CREATE TEMPORARY TABLE `_lk_trabajadas` AS
  SELECT DISTINCT `lookaheadTaskId` FROM `restricciones_tarea` WHERE `resuelta` = 1;

DELETE r FROM `restricciones_tarea` r
LEFT JOIN `_lk_trabajadas` t ON t.`lookaheadTaskId` = r.`lookaheadTaskId`
LEFT JOIN `fotos_evidencia` f ON f.`restriccionId` = r.`id`
WHERE t.`lookaheadTaskId` IS NULL
  AND f.`id` IS NULL
  AND r.`resuelta` = 0
  AND (r.`detalle` IS NULL OR TRIM(r.`detalle`) = '')
  AND r.`requiereDoc` = 0
  AND r.`documentoId` IS NULL;

DROP TEMPORARY TABLE `_lk_trabajadas`;

-- 3. Backfill. Tras el paso 2, toda restriccion que sobrevive prueba que
--    alguien trabajo esa tarea. Se usa la fecha real del primer levantamiento
--    cuando la hay; si no, la de creacion de la tarea.
UPDATE `lookahead_tareas` t
JOIN ( SELECT `lookaheadTaskId`, MIN(`resueltaAt`) AS primera
       FROM `restricciones_tarea` WHERE `resuelta` = 1
       GROUP BY `lookaheadTaskId` ) x
  ON x.`lookaheadTaskId` = t.`id`
SET t.`analizadaAt`  = COALESCE(x.primera, t.`createdAt`),
    t.`analizadaPor` = 'Analisis anterior';

UPDATE `lookahead_tareas` t
JOIN ( SELECT DISTINCT `lookaheadTaskId` FROM `restricciones_tarea` ) x
  ON x.`lookaheadTaskId` = t.`id`
SET t.`analizadaAt`  = COALESCE(t.`analizadaAt`, t.`createdAt`),
    t.`analizadaPor` = COALESCE(t.`analizadaPor`, 'Analisis anterior');

-- 4. El semaforo guardado, con la regla nueva: LISTO solo si esta analizada y
--    no le queda ninguna pendiente.
UPDATE `lookahead_tareas` t
LEFT JOIN ( SELECT `lookaheadTaskId`, SUM(`resuelta` = 0) AS pendientes
            FROM `restricciones_tarea` GROUP BY `lookaheadTaskId` ) r
  ON r.`lookaheadTaskId` = t.`id`
SET t.`estado` = CASE
      WHEN t.`analizadaAt` IS NULL THEN 'PENDIENTE'
      WHEN COALESCE(r.pendientes, 0) = 0 THEN 'LISTO'
      ELSE 'PENDIENTE' END
WHERE t.`estado` <> 'BLOQUEADO';

-- 5. CreateIndex
CREATE UNIQUE INDEX `restricciones_tarea_lookaheadTaskId_tipo_key` ON `restricciones_tarea`(`lookaheadTaskId`, `tipo`);
