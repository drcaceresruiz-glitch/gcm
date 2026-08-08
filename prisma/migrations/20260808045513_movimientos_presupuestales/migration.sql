-- AlterTable
ALTER TABLE `wbs_items` ADD COLUMN `origenMovimientoId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `movimientos_presupuestales` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `baselineId` VARCHAR(191) NOT NULL,
    `numero` INTEGER NOT NULL,
    `tipo` ENUM('RECONVERSION', 'ADICIONAL', 'DEDUCTIVO') NOT NULL,
    `estado` ENUM('BORRADOR', 'APROBADO') NOT NULL DEFAULT 'BORRADOR',
    `fecha` DATE NOT NULL,
    `concepto` VARCHAR(300) NOT NULL,
    `motivo` TEXT NOT NULL,
    `referencia` VARCHAR(120) NULL,
    `totalEntradas` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalSalidas` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `importeNeto` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `aprobadoAt` DATETIME(3) NULL,
    `aprobadoPor` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `movimientos_presupuestales_projectId_estado_idx`(`projectId`, `estado`),
    INDEX `movimientos_presupuestales_baselineId_estado_idx`(`baselineId`, `estado`),
    UNIQUE INDEX `movimientos_presupuestales_projectId_numero_key`(`projectId`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimiento_lineas` (
    `id` VARCHAR(191) NOT NULL,
    `movimientoId` VARCHAR(191) NOT NULL,
    `wbsItemId` VARCHAR(191) NULL,
    `codigoPartida` VARCHAR(32) NULL,
    `importe` DECIMAL(14, 2) NOT NULL,
    `modalidad` ENUM('PRECIOS_UNITARIOS', 'SUMA_ALZADA', 'ALCANCE') NULL,
    `justificacion` VARCHAR(300) NULL,
    `nuevoCodigo` VARCHAR(32) NULL,
    `nuevaDescripcion` VARCHAR(500) NULL,
    `nuevaUnidad` VARCHAR(20) NULL,
    `nuevoMetrado` DECIMAL(14, 4) NULL,
    `nuevoPrecio` DECIMAL(14, 4) NULL,
    `nuevoParentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimiento_lineas_movimientoId_idx`(`movimientoId`),
    INDEX `movimiento_lineas_wbsItemId_idx`(`wbsItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `wbs_items_origenMovimientoId_idx` ON `wbs_items`(`origenMovimientoId`);

-- AddForeignKey
ALTER TABLE `wbs_items` ADD CONSTRAINT `wbs_items_origenMovimientoId_fkey` FOREIGN KEY (`origenMovimientoId`) REFERENCES `movimientos_presupuestales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_presupuestales` ADD CONSTRAINT `movimientos_presupuestales_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_presupuestales` ADD CONSTRAINT `movimientos_presupuestales_baselineId_fkey` FOREIGN KEY (`baselineId`) REFERENCES `baselines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimiento_lineas` ADD CONSTRAINT `movimiento_lineas_movimientoId_fkey` FOREIGN KEY (`movimientoId`) REFERENCES `movimientos_presupuestales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimiento_lineas` ADD CONSTRAINT `movimiento_lineas_wbsItemId_fkey` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
