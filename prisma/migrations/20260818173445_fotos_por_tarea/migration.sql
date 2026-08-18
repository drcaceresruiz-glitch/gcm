-- AlterTable
ALTER TABLE `fotos_evidencia` ADD COLUMN `fecha` DATE NULL,
    ADD COLUMN `uid` INTEGER NULL;

-- CreateIndex
CREATE INDEX `fotos_evidencia_projectId_uid_idx` ON `fotos_evidencia`(`projectId`, `uid`);
