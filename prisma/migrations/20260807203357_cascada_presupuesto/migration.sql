/*
  Warnings:

  - Added the required column `costoDirecto` to the `baselines` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fechaRevision` to the `baselines` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `baselines` ADD COLUMN `costoDirecto` DECIMAL(14, 2) NOT NULL,
    ADD COLUMN `descuentos` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `fechaRevision` DATE NOT NULL,
    ADD COLUMN `porcentajeGastosGenerales` DECIMAL(6, 4) NOT NULL DEFAULT 0,
    ADD COLUMN `porcentajeIgv` DECIMAL(6, 4) NOT NULL DEFAULT 0.18,
    ADD COLUMN `porcentajeUtilidad` DECIMAL(6, 4) NOT NULL DEFAULT 0,
    ADD COLUMN `tipoCambio` DECIMAL(8, 4) NULL;
