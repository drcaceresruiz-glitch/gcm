-- AlterTable
ALTER TABLE `companies` ADD COLUMN `proveedorIaActivoId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `agente_ia_proveedores` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `tipo` VARCHAR(40) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `urlBase` VARCHAR(300) NULL,
    `modelo` VARCHAR(100) NOT NULL,
    `apiKeyCifrada` TEXT NOT NULL,
    `verificadoAt` DATETIME(3) NULL,
    `ultimoError` VARCHAR(300) NULL,
    `ultimoErrorAt` DATETIME(3) NULL,
    `configuradoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `agente_ia_proveedores_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `companies` ADD CONSTRAINT `companies_proveedorIaActivoId_fkey` FOREIGN KEY (`proveedorIaActivoId`) REFERENCES `agente_ia_proveedores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agente_ia_proveedores` ADD CONSTRAINT `agente_ia_proveedores_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
