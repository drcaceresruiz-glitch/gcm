-- AlterTable
ALTER TABLE `proveedores` ADD COLUMN `banco` VARCHAR(80) NULL,
    ADD COLUMN `monedaCuenta` ENUM('PEN', 'USD') NULL,
    ADD COLUMN `tipoCuenta` ENUM('AHORROS', 'CORRIENTE') NULL;

-- CreateTable
CREATE TABLE `formas_pago_plantillas` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `texto` TEXT NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `formas_pago_plantillas_companyId_idx`(`companyId`),
    UNIQUE INDEX `formas_pago_plantillas_companyId_nombre_key`(`companyId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `formas_pago_plantillas` ADD CONSTRAINT `formas_pago_plantillas_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
