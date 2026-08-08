-- Correlativo de obra: un numero que asigna el SISTEMA, ascendente por empresa
-- ("OB-000001"), distinto del codigo que pone la persona. Sirve para buscar y
-- para auditoria, y no se recicla al borrar una obra.
--
-- Escrita a mano porque ademas de anadir columnas rellena las obras ya
-- existentes (backfill): sin eso quedarian sin correlativo y el requisito era
-- que TODAS lo tengan.

-- 1. El contador por empresa. Empieza en 1; el backfill lo ajusta despues.
ALTER TABLE `companies`
  ADD COLUMN `siguienteCorrelativoObra` INT NOT NULL DEFAULT 1;

-- 2. La columna en la obra. Nullable: las existentes se rellenan a continuacion
--    y las nuevas lo traeran siempre desde el servicio.
ALTER TABLE `projects`
  ADD COLUMN `correlativo` VARCHAR(20) NULL;

-- 3. Backfill: numerar las obras de cada empresa por antiguedad. ROW_NUMBER
--    existe en MariaDB 10.2+ y en MySQL 8+.
UPDATE `projects` p
JOIN (
  SELECT
    id,
    CONCAT(
      'OB-',
      LPAD(ROW_NUMBER() OVER (PARTITION BY `companyId` ORDER BY `createdAt`, `id`), 6, '0')
    ) AS corr
  FROM `projects`
) t ON t.id = p.id
SET p.`correlativo` = t.corr;

-- 4. Dejar el contador de cada empresa en el siguiente numero libre.
UPDATE `companies` c
JOIN (
  SELECT `companyId`, COUNT(*) AS n FROM `projects` GROUP BY `companyId`
) t ON t.`companyId` = c.id
SET c.`siguienteCorrelativoObra` = t.n + 1;

-- 5. Unicidad por empresa. Va al final, ya sin duplicados. MySQL admite varios
--    NULL en una columna unica, pero tras el backfill no deberia quedar ninguno.
CREATE UNIQUE INDEX `projects_companyId_correlativo_key`
  ON `projects`(`companyId`, `correlativo`);
