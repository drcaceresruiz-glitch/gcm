-- AlterTable
ALTER TABLE `companies` ADD COLUMN `cargoRepresentante` VARCHAR(100) NULL,
    ADD COLUMN `observacionesOrden` TEXT NULL,
    ADD COLUMN `representanteLegal` VARCHAR(150) NULL;
