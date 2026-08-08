-- Cronograma de obra importado de MS Project.
--
-- Solo CREA tablas: no toca ni una columna de las que ya existen, asi que es
-- segura de aplicar sobre datos vivos. Lo unico que hay que recordar es que el
-- codigo desplegado la necesita: hasta ejecutarla, el panel entero cae.
--
-- Cuatro tablas y un reparto: `cronogramas`, `tareas_cronograma` y
-- `dependencias_tarea` son la foto del PLAN que manda Project; `avances_tarea`
-- es lo que reporta la obra y lo posee GCM. Cada lado escribe lo que el otro
-- no toca, y por eso reimportar nunca obliga a decidir quien gana.

CREATE TABLE `cronogramas` (
  `id`             VARCHAR(191) NOT NULL,
  `projectId`      VARCHAR(191) NOT NULL,
  `version`        INTEGER      NOT NULL,
  `fechaCorte`     DATE         NOT NULL,
  `nombreProyecto` VARCHAR(255) NOT NULL,
  `minutosPorDia`  INTEGER      NOT NULL DEFAULT 480,
  `archivo`        VARCHAR(255) NOT NULL,
  `importadoAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `importadoPor`   VARCHAR(150) NOT NULL,

  UNIQUE INDEX `cronogramas_projectId_version_key`(`projectId`, `version`),
  INDEX `cronogramas_projectId_fechaCorte_idx`(`projectId`, `fechaCorte`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- `uid` es el <UID> de MS Project, lo unico estable entre semanas. El <ID> se
-- guarda como `fila` solo para ordenar y para componer las cadenas de
-- predecesoras del informe; nunca como clave, porque se renumera.
CREATE TABLE `tareas_cronograma` (
  `id`                 VARCHAR(191)  NOT NULL,
  `cronogramaId`       VARCHAR(191)  NOT NULL,
  `uid`                INTEGER       NOT NULL,
  `fila`               INTEGER       NOT NULL,
  `codigo`             VARCHAR(40)   NULL,
  `nombre`             VARCHAR(500)  NOT NULL,
  `nivel`              INTEGER       NOT NULL,
  `esResumen`          BOOLEAN       NOT NULL DEFAULT false,
  `esHito`             BOOLEAN       NOT NULL DEFAULT false,
  `esCritico`          BOOLEAN       NOT NULL DEFAULT false,
  `inicio`             DATE          NOT NULL,
  `fin`                DATE          NOT NULL,
  `duracionDias`       DECIMAL(8,2)  NOT NULL,
  `porcentajePlaneado` DECIMAL(5,2)  NOT NULL,
  `porcentajeArchivo`  DECIMAL(5,2)  NOT NULL,
  `holguraDias`        DECIMAL(8,2)  NOT NULL DEFAULT 0,
  `holguraInferida`    BOOLEAN       NOT NULL DEFAULT false,

  UNIQUE INDEX `tareas_cronograma_cronogramaId_uid_key`(`cronogramaId`, `uid`),
  INDEX `tareas_cronograma_cronogramaId_fila_idx`(`cronogramaId`, `fila`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Los enlaces se guardan por UID y no por clave foranea a la tarea: el
-- predecesor puede aparecer despues en el documento (16 de 76 enlaces en el
-- archivo real), asi que la resolucion es en dos pasadas.
CREATE TABLE `dependencias_tarea` (
  `id`             VARCHAR(191) NOT NULL,
  `cronogramaId`   VARCHAR(191) NOT NULL,
  `tareaUid`       INTEGER      NOT NULL,
  `predecesoraUid` INTEGER      NOT NULL,
  `tipo`           VARCHAR(2)   NOT NULL,
  `desfaseDias`    DECIMAL(8,2) NOT NULL DEFAULT 0,

  INDEX `dependencias_tarea_cronogramaId_tareaUid_idx`(`cronogramaId`, `tareaUid`),
  INDEX `dependencias_tarea_cronogramaId_predecesoraUid_idx`(`cronogramaId`, `predecesoraUid`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- El avance reportado desde obra. NO lleva clave foranea a `tareas_cronograma`
-- y es deliberado: las versiones del cronograma se sustituyen y el avance
-- tiene que sobrevivirlas. Se ancla en (projectId, uid), igual que
-- `baseline_items` duplica los datos en vez de referenciar a `wbs_items`.
--
-- Cada reporte es una fila nueva, nunca un UPDATE: de esa serie sale la curva
-- S, y quien reporto que algo iba al 60% y cuando es justo lo que hoy se
-- pierde al sobrescribir el porcentaje dentro de Project.
CREATE TABLE `avances_tarea` (
  `id`           VARCHAR(191) NOT NULL,
  `projectId`    VARCHAR(191) NOT NULL,
  `uid`          INTEGER      NOT NULL,
  `fecha`        DATE         NOT NULL,
  `porcentaje`   DECIMAL(5,2) NOT NULL,
  `nota`         TEXT         NULL,
  `reportadoPor` VARCHAR(150) NOT NULL,
  `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `avances_tarea_projectId_uid_idx`(`projectId`, `uid`),
  INDEX `avances_tarea_projectId_fecha_idx`(`projectId`, `fecha`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cascada en todas: borrar una obra se lleva su cronograma y su avance, y
-- borrar una version del cronograma se lleva sus tareas y sus enlaces. Nada de
-- esto es dato contractual que deba sobrevivir a su obra, al contrario que las
-- ordenes o la linea base.
ALTER TABLE `cronogramas`
  ADD CONSTRAINT `cronogramas_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `tareas_cronograma`
  ADD CONSTRAINT `tareas_cronograma_cronogramaId_fkey`
  FOREIGN KEY (`cronogramaId`) REFERENCES `cronogramas`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `dependencias_tarea`
  ADD CONSTRAINT `dependencias_tarea_cronogramaId_fkey`
  FOREIGN KEY (`cronogramaId`) REFERENCES `cronogramas`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `avances_tarea`
  ADD CONSTRAINT `avances_tarea_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
