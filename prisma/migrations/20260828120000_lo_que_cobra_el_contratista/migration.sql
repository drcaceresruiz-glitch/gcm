-- Lo que cobra el contratista de cada bloque, y el precio del que se partio.
--
-- Los tres porcentajes van en la fila que AGRUPA -capitulo, o subcapitulo
-- cuando un capitulo lo cubren varios contratistas- y `parcial_cotizado` en
-- cada partida ajustada: sin el, cambiar un porcentaje no se puede recalcular,
-- porque el reparto no es reversible al centimo (la ultima partida del bloque
-- absorbe el resto del redondeo).
--
-- Todo NULL: un presupuesto sin contratista subcontratado no lleva ninguno, y
-- es el caso mas comun.

ALTER TABLE `wbs_items`
  ADD COLUMN `parcialCotizado` DECIMAL(14, 2) NULL,
  ADD COLUMN `porcentajeDescuentoContratista` DECIMAL(6, 3) NULL,
  ADD COLUMN `porcentajeGastosGeneralesContratista` DECIMAL(6, 3) NULL,
  ADD COLUMN `porcentajeUtilidadContratista` DECIMAL(6, 3) NULL;

ALTER TABLE `presupuesto_meta_items`
  ADD COLUMN `parcialCotizado` DECIMAL(14, 2) NULL,
  ADD COLUMN `porcentajeDescuentoContratista` DECIMAL(6, 3) NULL,
  ADD COLUMN `porcentajeGastosGeneralesContratista` DECIMAL(6, 3) NULL,
  ADD COLUMN `porcentajeUtilidadContratista` DECIMAL(6, 3) NULL;
