-- CreateTable
CREATE TABLE `proveedores` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `razonSocial` VARCHAR(200) NOT NULL,
    `ruc` VARCHAR(11) NOT NULL,
    `contactoNombre` VARCHAR(150) NULL,
    `contactoTelefono` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `cuentaBancaria` VARCHAR(40) NULL,
    `cci` VARCHAR(40) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `proveedores_companyId_idx`(`companyId`),
    UNIQUE INDEX `proveedores_companyId_ruc_key`(`companyId`, `ruc`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordenes_compra` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `proveedorId` VARCHAR(191) NOT NULL,
    `numero` VARCHAR(30) NOT NULL,
    `tipo` ENUM('COMPRA', 'SERVICIO') NOT NULL,
    `estado` ENUM('BORRADOR', 'APROBADA', 'ANULADA') NOT NULL DEFAULT 'BORRADOR',
    `fecha` DATE NOT NULL,
    `referencia` VARCHAR(60) NULL,
    `descripcion` VARCHAR(255) NOT NULL,
    `formaPago` TEXT NULL,
    `observaciones` TEXT NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL,
    `descuentoComercial` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `neto` DECIMAL(14, 2) NOT NULL,
    `igv` DECIMAL(14, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `aprobadaAt` DATETIME(3) NULL,
    `aprobadaPor` VARCHAR(150) NULL,
    `anuladaAt` DATETIME(3) NULL,
    `anuladaPor` VARCHAR(150) NULL,
    `motivoAnulado` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ordenes_compra_projectId_estado_idx`(`projectId`, `estado`),
    INDEX `ordenes_compra_proveedorId_idx`(`proveedorId`),
    UNIQUE INDEX `ordenes_compra_companyId_numero_key`(`companyId`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orden_lineas` (
    `id` VARCHAR(191) NOT NULL,
    `ordenId` VARCHAR(191) NOT NULL,
    `orden` INTEGER NOT NULL,
    `nivel` INTEGER NOT NULL DEFAULT 0,
    `esAgrupador` BOOLEAN NOT NULL DEFAULT false,
    `cantidad` DECIMAL(14, 4) NULL,
    `unidad` VARCHAR(20) NULL,
    `descripcion` TEXT NOT NULL,
    `precioUnitario` DECIMAL(14, 4) NULL,
    `importe` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `orden_lineas_ordenId_idx`(`ordenId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orden_imputaciones` (
    `id` VARCHAR(191) NOT NULL,
    `ordenId` VARCHAR(191) NOT NULL,
    `wbsItemId` VARCHAR(191) NOT NULL,
    `importe` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `orden_imputaciones_wbsItemId_idx`(`wbsItemId`),
    UNIQUE INDEX `orden_imputaciones_ordenId_wbsItemId_key`(`ordenId`, `wbsItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `proveedores` ADD CONSTRAINT `proveedores_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordenes_compra` ADD CONSTRAINT `ordenes_compra_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordenes_compra` ADD CONSTRAINT `ordenes_compra_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordenes_compra` ADD CONSTRAINT `ordenes_compra_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orden_lineas` ADD CONSTRAINT `orden_lineas_ordenId_fkey` FOREIGN KEY (`ordenId`) REFERENCES `ordenes_compra`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orden_imputaciones` ADD CONSTRAINT `orden_imputaciones_ordenId_fkey` FOREIGN KEY (`ordenId`) REFERENCES `ordenes_compra`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orden_imputaciones` ADD CONSTRAINT `orden_imputaciones_wbsItemId_fkey` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
