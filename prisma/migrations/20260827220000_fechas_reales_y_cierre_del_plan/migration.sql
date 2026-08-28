-- Cuando arranco y cuando termino DE VERDAD cada tarea, y cuando se cerro cada
-- compromiso.
--
-- Sale de una necesidad concreta: medir la varianza entre lo planificado y lo
-- ejecutado. Hasta hoy el sistema guardaba las fechas del plan y una serie de
-- reportes de avance en porcentaje, pero NINGUNA fecha real de inicio ni de
-- termino. Se podian deducir —el primer reporte por encima de cero, el que
-- llega al cien— y esa deduccion arrastra CUANDO alguien abrio la aplicacion,
-- no solo cuando ocurrio el trabajo: la dispersion medida saldria de dos
-- procesos sumados, el de la obra y el del habito de reporte.
--
-- POR QUE UNA TABLA APARTE Y NO DOS COLUMNAS EN `tareas_cronograma`, que es
-- donde parece que van: esa tabla es la foto de UNA VERSION del cronograma, y
-- cada reprogramacion importa una version nueva con tareas nuevas. Las fechas
-- reales guardadas alli desaparecerian en la primera replanificacion, justo
-- cuando mas interesa medir la desviacion. Esta cuelga de la OBRA y del `uid`,
-- igual que `avances_tarea`, porque el `uid` es lo unico estable entre
-- versiones.
--
-- Las fechas son NULL y tienen que serlo: una tarea que no ha empezado no
-- tiene fecha de inicio, y obligar a poner una obligaria a inventarsela.

CREATE TABLE `ejecucion_tareas` (
  `id`           VARCHAR(191) NOT NULL,
  `projectId`    VARCHAR(191) NOT NULL,
  `uid`          INTEGER      NOT NULL,
  `inicioReal`   DATE         NULL,
  `finReal`      DATE         NULL,
  `origenInicio` ENUM('DECLARADA', 'DERIVADA') NULL,
  `origenFin`    ENUM('DECLARADA', 'DERIVADA') NULL,
  `declaradoPor` VARCHAR(150) NULL,
  `declaradoAt`  DATETIME(3)  NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`    DATETIME(3)  NOT NULL,

  UNIQUE INDEX `ejecucion_tareas_projectId_uid_key` (`projectId`, `uid`),
  INDEX `ejecucion_tareas_projectId_idx` (`projectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ejecucion_tareas`
  ADD CONSTRAINT `ejecucion_tareas_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- `cumplido` dice QUE paso con el compromiso; esto dice CUANDO se supo. Sin
-- esta fecha no se puede medir cuanto tarda un equipo en cerrar su plan
-- despues de que la semana termina.
ALTER TABLE `compromisos_semanales`
  ADD COLUMN `cumplidoAt` DATETIME(3) NULL;
