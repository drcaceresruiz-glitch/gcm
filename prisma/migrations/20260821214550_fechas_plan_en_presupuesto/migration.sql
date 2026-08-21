-- AlterTable
ALTER TABLE `presupuesto_meta_items` ADD COLUMN `fechaFinPlan` DATE NULL,
    ADD COLUMN `fechaInicioPlan` DATE NULL;

-- AlterTable
ALTER TABLE `wbs_items` ADD COLUMN `fechaFinPlan` DATE NULL,
    ADD COLUMN `fechaInicioPlan` DATE NULL;
