-- DOS correlativos por valorizacion: uno de OBRA y uno de ENCARGO.
--
-- Decision del usuario (21/08/2026): el documento lo emite la obra, asi que el
-- numero de obra es EL numero del papel; el del encargo va al lado, para poder
-- leer "la 3.a de este contratista". El del contratista es POR ENCARGO y no
-- por persona: el mismo proveedor puede llevar dos frentes en la misma obra.
--
-- Escrita a mano porque ademas de anadir columnas RELLENA las valorizaciones
-- que ya existen. Sin backfill quedarian sin numero, y el requisito es que
-- todas lo tengan: una valorizacion vieja sin numero no se podria imprimir.
--
-- ORDEN DEL RELLENO: por `fecha` (el corte, que es lo que ordena la serie a
-- ojos de quien la lee), desempatando por `createdAt`, y por `id` al final.
-- El tercer desempate no es adorno: `fecha` es DATE —dos cortes del mismo dia
-- empatan siempre— y `createdAt` es DATETIME(3), que en un alta masiva o en
-- una restauracion de respaldo puede repetirse al milisegundo. Sin un criterio
-- total, ROW_NUMBER podria dar dos ordenes distintos en dos ejecuciones y la
-- unicidad rechazaria el UPDATE a medias.

-- 1. Las tres columnas, NULL de momento: el relleno viene justo despues y
--    hasta entonces ninguna fila las cumple.
ALTER TABLE `valorizaciones_encargo`
  ADD COLUMN `projectId` VARCHAR(191) NULL,
  ADD COLUMN `numeroObra` INT NULL,
  ADD COLUMN `numeroEncargo` INT NULL;

-- 2. La obra sale del encargo, que es quien la tiene. Esta columna es una
--    copia: se escribe una vez y no vuelve a moverse.
UPDATE `valorizaciones_encargo` v
JOIN `encargos_proveedor` e ON e.`id` = v.`encargoId`
SET v.`projectId` = e.`projectId`;

-- 3. La serie de la OBRA. ROW_NUMBER existe en MariaDB 10.2+ (produccion
--    corre 10.11) y en MySQL 8+; mismo recurso que el correlativo de obra.
UPDATE `valorizaciones_encargo` v
JOIN (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `projectId` ORDER BY `fecha`, `createdAt`, `id`
    ) AS n
  FROM `valorizaciones_encargo`
) t ON t.`id` = v.`id`
SET v.`numeroObra` = t.n;

-- 4. La serie del ENCARGO. Misma ordenacion, otra particion: las dos series
--    son independientes y la misma fila lleva un numero distinto en cada una.
UPDATE `valorizaciones_encargo` v
JOIN (
  SELECT
    `id`,
    ROW_NUMBER() OVER (
      PARTITION BY `encargoId` ORDER BY `fecha`, `createdAt`, `id`
    ) AS n
  FROM `valorizaciones_encargo`
) t ON t.`id` = v.`id`
SET v.`numeroEncargo` = t.n;

-- 5. Ya con todas rellenas, las columnas pasan a obligatorias. Si el paso 2
--    hubiera dejado alguna fila huerfana, este ALTER falla y la migracion se
--    para: es preferible a una valorizacion sin obra pasando por buena.
ALTER TABLE `valorizaciones_encargo`
  MODIFY `projectId` VARCHAR(191) NOT NULL,
  MODIFY `numeroObra` INT NOT NULL,
  MODIFY `numeroEncargo` INT NOT NULL;

-- 6. La clave foranea a la obra. CASCADE: la valorizacion ya moria con su
--    encargo y el encargo muere con la obra; con RESTRICT, borrar una obra
--    chocaria aqui y el borrado reversible dejaria de funcionar.
ALTER TABLE `valorizaciones_encargo`
  ADD CONSTRAINT `valorizaciones_encargo_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Y las dos unicidades, al final y ya sin duplicados. No son un adorno del
--    modelo: son lo que impide que dos altas simultaneas se lleven el mismo
--    numero. El servicio calcula el correlativo sobre el maximo actual dentro
--    de una transaccion; si dos leen el mismo maximo, esta es la que rechaza
--    a la segunda.
CREATE UNIQUE INDEX `valorizaciones_encargo_projectId_numeroObra_key`
  ON `valorizaciones_encargo`(`projectId`, `numeroObra`);

CREATE UNIQUE INDEX `valorizaciones_encargo_encargoId_numeroEncargo_key`
  ON `valorizaciones_encargo`(`encargoId`, `numeroEncargo`);
