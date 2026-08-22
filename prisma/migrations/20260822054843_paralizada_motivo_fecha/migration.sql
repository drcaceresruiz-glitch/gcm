-- AlterTable
ALTER TABLE `projects` ADD COLUMN `fechaEstimadaReanudacion` DATE NULL,
    ADD COLUMN `motivoParalizacion` VARCHAR(300) NULL,
    ADD COLUMN `paralizadaEn` DATETIME(3) NULL;
