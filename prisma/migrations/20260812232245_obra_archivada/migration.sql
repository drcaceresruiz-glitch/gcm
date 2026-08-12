-- AlterTable
ALTER TABLE `projects` ADD COLUMN `archivadaEn` DATETIME(3) NULL,
    ADD COLUMN `respaldoOrigen` JSON NULL;

-- CreateTable
CREATE TABLE `respaldos_obra` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `nombreObra` VARCHAR(255) NOT NULL,
    `correlativo` VARCHAR(20) NULL,
    `formato` INTEGER NOT NULL,
    `hashDatos` VARCHAR(64) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `conteos` JSON NOT NULL,
    `conFotos` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `respaldos_obra_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `respaldos_obra_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `respaldos_obra` ADD CONSTRAINT `respaldos_obra_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
