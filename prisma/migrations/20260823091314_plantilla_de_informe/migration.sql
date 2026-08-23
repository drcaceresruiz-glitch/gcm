-- AlterTable
ALTER TABLE `companies` ADD COLUMN `plantillaInforme` VARCHAR(20) NULL,
    ADD COLUMN `seccionesInformeOff` VARCHAR(200) NULL;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `plantillaInforme` VARCHAR(20) NULL,
    ADD COLUMN `seccionesInformeOff` VARCHAR(200) NULL;
