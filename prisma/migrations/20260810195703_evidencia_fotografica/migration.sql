-- CreateTable
CREATE TABLE `fotos_evidencia` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `restriccionId` VARCHAR(191) NULL,
    `compromisoId` VARCHAR(191) NULL,
    `ruta` VARCHAR(255) NOT NULL,
    `nombreOriginal` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `nota` VARCHAR(300) NULL,
    `purgadaAt` DATETIME(3) NULL,
    `subidaPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fotos_evidencia_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `fotos_evidencia_restriccionId_idx`(`restriccionId`),
    INDEX `fotos_evidencia_compromisoId_idx`(`compromisoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fotos_evidencia` ADD CONSTRAINT `fotos_evidencia_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fotos_evidencia` ADD CONSTRAINT `fotos_evidencia_restriccionId_fkey` FOREIGN KEY (`restriccionId`) REFERENCES `restricciones_tarea`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fotos_evidencia` ADD CONSTRAINT `fotos_evidencia_compromisoId_fkey` FOREIGN KEY (`compromisoId`) REFERENCES `compromisos_semanales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
