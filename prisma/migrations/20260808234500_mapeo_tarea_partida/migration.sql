-- Que partidas del presupuesto cubre cada tarea del cronograma.
--
-- Solo crea una tabla; no toca nada existente. Nace vacia: hoy no hay ningun
-- mapeo y el avance sigue sin ponderar hasta que alguien empiece a confirmar
-- correspondencias. Eso es lo correcto, porque la alternativa —rellenarla
-- automaticamente por codigo— se midio contra los archivos reales de CRIOCORD
-- y sale mal: de 56 coincidencias de codigo, 36 apuntan a otra partida. El
-- capitulo 5 del cronograma va desplazado una posicion respecto al del
-- presupuesto, y su "5.5" habria caido sobre un descuento comercial.
--
-- El enlace es por CODIGO de partida y no por su identificador: reimportar el
-- presupuesto borra las filas de `wbs_items` y las recrea con ids nuevos, asi
-- que una clave foranea dejaria el mapeo roto cada vez que se corrige el
-- Excel. Por eso tampoco hay FK hacia `wbs_items` aqui.

CREATE TABLE `mapeo_tarea_partida` (
  `id`            VARCHAR(191) NOT NULL,
  `projectId`     VARCHAR(191) NOT NULL,
  `uid`           INTEGER      NOT NULL,
  `codigoPartida` VARCHAR(32)  NOT NULL,
  `confirmadoPor` VARCHAR(150) NOT NULL,
  `confirmadoAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `nota`          TEXT         NULL,

  UNIQUE INDEX `mapeo_tarea_partida_projectId_uid_codigoPartida_key`(`projectId`, `uid`, `codigoPartida`),
  INDEX `mapeo_tarea_partida_projectId_uid_idx`(`projectId`, `uid`),
  INDEX `mapeo_tarea_partida_projectId_codigoPartida_idx`(`projectId`, `codigoPartida`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `mapeo_tarea_partida`
  ADD CONSTRAINT `mapeo_tarea_partida_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
