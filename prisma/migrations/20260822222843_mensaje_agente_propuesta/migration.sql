-- AlterTable
ALTER TABLE `mensajes_agente` ADD COLUMN `propuesta` JSON NULL,
    ADD COLUMN `propuestaResueltaAt` DATETIME(3) NULL,
    ADD COLUMN `propuestaResultado` VARCHAR(500) NULL;
