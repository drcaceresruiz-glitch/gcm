-- La meta ya puede existir sin un presupuesto contractual aprobado.
--
-- POR QUE: el contractual pasa a GENERARSE desde el presupuesto real. Con la
-- regla anterior no se podia empezar: para crear la meta hacia falta un
-- contractual aprobado, y para tener contractual hace falta la meta. Era
-- pescadilla que se muerde la cola.
--
-- NULL significa algo, y por eso no se usa un cero: esta meta no se fijo
-- contra ningun contractual porque nacio antes que el. Un cero se leeria como
-- "la version cero", que no existe, y `desfaseDeMeta` compararia contra una
-- referencia inventada.
--
-- SEGURA POR CONSTRUCCION: se pasa de NOT NULL a NULL, que es una restriccion
-- MAS DEBIL. Toda fila existente ya tiene una version y la conserva; ninguna
-- puede violar la regla nueva, asi que la migracion no puede fallar por datos
-- y no hay backfill.
--
-- LO QUE NO ARREGLA NINGUNA MIGRACION: quien lea `baselineVersion` tiene que
-- contemplar el nulo. Son `MetaResumen` en meta.service y el aviso de desfase
-- de PanelBolsa.

ALTER TABLE `presupuestos_meta`
  MODIFY COLUMN `baselineVersion` INT NULL;
