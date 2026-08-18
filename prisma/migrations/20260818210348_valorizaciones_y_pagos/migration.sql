-- AlterTable
ALTER TABLE `avisos` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE') NOT NULL;

-- AlterTable
ALTER TABLE `encargos_proveedor` ADD COLUMN `cadenciaDias` INTEGER NULL;

-- AlterTable
ALTER TABLE `envios_aviso` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE') NOT NULL;

-- CreateTable
CREATE TABLE `fechas_valorizacion` (
    `id` VARCHAR(191) NOT NULL,
    `encargoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(200) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `fechas_valorizacion_encargoId_fecha_idx`(`encargoId`, `fecha`),
    UNIQUE INDEX `fechas_valorizacion_encargoId_fecha_key`(`encargoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pagos_encargo` (
    `id` VARCHAR(191) NOT NULL,
    `encargoId` VARCHAR(191) NOT NULL,
    `valorizacionId` VARCHAR(191) NULL,
    `monto` DECIMAL(14, 2) NOT NULL,
    `fecha` DATE NOT NULL,
    `registradoPor` VARCHAR(150) NOT NULL,
    `nota` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pagos_encargo_encargoId_fecha_idx`(`encargoId`, `fecha`),
    INDEX `pagos_encargo_valorizacionId_idx`(`valorizacionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comprobantes_pago` (
    `id` VARCHAR(191) NOT NULL,
    `pagoId` VARCHAR(191) NOT NULL,
    `ruta` VARCHAR(255) NOT NULL,
    `nombreOriginal` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `subidoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `comprobantes_pago_pagoId_idx`(`pagoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fechas_valorizacion` ADD CONSTRAINT `fechas_valorizacion_encargoId_fkey` FOREIGN KEY (`encargoId`) REFERENCES `encargos_proveedor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_encargo` ADD CONSTRAINT `pagos_encargo_encargoId_fkey` FOREIGN KEY (`encargoId`) REFERENCES `encargos_proveedor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pagos_encargo` ADD CONSTRAINT `pagos_encargo_valorizacionId_fkey` FOREIGN KEY (`valorizacionId`) REFERENCES `valorizaciones_encargo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comprobantes_pago` ADD CONSTRAINT `comprobantes_pago_pagoId_fkey` FOREIGN KEY (`pagoId`) REFERENCES `pagos_encargo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
