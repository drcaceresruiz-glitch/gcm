-- CreateTable
CREATE TABLE `encargos_proveedor` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `proveedorId` VARCHAR(191) NOT NULL,
    `numero` INTEGER NOT NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `montoContratado` DECIMAL(14, 2) NOT NULL,
    `tipoImpuesto` ENUM('IGV', 'RENTA', 'NINGUNO') NOT NULL DEFAULT 'IGV',
    `estado` ENUM('VIGENTE', 'CERRADO', 'ANULADO') NOT NULL DEFAULT 'VIGENTE',
    `fechaInicio` DATE NULL,
    `fechaFin` DATE NULL,
    `notas` TEXT NULL,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `encargos_proveedor_projectId_estado_idx`(`projectId`, `estado`),
    INDEX `encargos_proveedor_proveedorId_idx`(`proveedorId`),
    UNIQUE INDEX `encargos_proveedor_projectId_numero_key`(`projectId`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `encargo_partidas` (
    `id` VARCHAR(191) NOT NULL,
    `encargoId` VARCHAR(191) NOT NULL,
    `wbsItemId` VARCHAR(191) NOT NULL,
    `fraccion` DECIMAL(6, 3) NOT NULL DEFAULT 100,

    INDEX `encargo_partidas_wbsItemId_idx`(`wbsItemId`),
    UNIQUE INDEX `encargo_partidas_encargoId_wbsItemId_key`(`encargoId`, `wbsItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valorizaciones_encargo` (
    `id` VARCHAR(191) NOT NULL,
    `encargoId` VARCHAR(191) NOT NULL,
    `fecha` DATE NOT NULL,
    `porcentaje` DECIMAL(6, 3) NOT NULL,
    `nota` TEXT NULL,
    `registradoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `valorizaciones_encargo_encargoId_fecha_idx`(`encargoId`, `fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `encargos_proveedor` ADD CONSTRAINT `encargos_proveedor_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encargos_proveedor` ADD CONSTRAINT `encargos_proveedor_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encargo_partidas` ADD CONSTRAINT `encargo_partidas_encargoId_fkey` FOREIGN KEY (`encargoId`) REFERENCES `encargos_proveedor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encargo_partidas` ADD CONSTRAINT `encargo_partidas_wbsItemId_fkey` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `valorizaciones_encargo` ADD CONSTRAINT `valorizaciones_encargo_encargoId_fkey` FOREIGN KEY (`encargoId`) REFERENCES `encargos_proveedor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
