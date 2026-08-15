-- CreateTable
CREATE TABLE `presupuestos_meta` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `modo` ENUM('PARTIDA', 'CAPITULO', 'FRENTE') NOT NULL,
    `fechaMeta` DATE NOT NULL,
    `notas` TEXT NULL,
    `costoDirecto` DECIMAL(14, 2) NOT NULL,
    `gastosGenerales` DECIMAL(14, 2) NOT NULL,
    `costoTotal` DECIMAL(14, 2) NOT NULL,
    `mesesPlazo` DECIMAL(5, 2) NOT NULL,
    `baselineVersion` INTEGER NOT NULL,
    `movimientosAlFijar` INTEGER NOT NULL DEFAULT 0,
    `aprobadaAt` DATETIME(3) NULL,
    `aprobadaPor` VARCHAR(150) NULL,
    `creadaPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `presupuestos_meta_projectId_idx`(`projectId`),
    UNIQUE INDEX `presupuestos_meta_projectId_version_key`(`projectId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `presupuesto_meta_items` (
    `id` VARCHAR(191) NOT NULL,
    `presupuestoMetaId` VARCHAR(191) NOT NULL,
    `codigoRef` VARCHAR(32) NULL,
    `descripcion` VARCHAR(500) NOT NULL,
    `tipo` ENUM('CAPITULO', 'PARTIDA') NOT NULL,
    `nivel` INTEGER NOT NULL DEFAULT 0,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `unidad` VARCHAR(20) NULL,
    `metrado` DECIMAL(14, 4) NULL,
    `precioUnitario` DECIMAL(14, 4) NULL,
    `parcial` DECIMAL(14, 2) NULL,

    INDEX `presupuesto_meta_items_presupuestoMetaId_orden_idx`(`presupuestoMetaId`, `orden`),
    INDEX `presupuesto_meta_items_presupuestoMetaId_codigoRef_idx`(`presupuestoMetaId`, `codigoRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `meta_item_partidas` (
    `id` VARCHAR(191) NOT NULL,
    `metaItemId` VARCHAR(191) NOT NULL,
    `wbsItemId` VARCHAR(191) NOT NULL,
    `fraccion` DECIMAL(6, 3) NOT NULL DEFAULT 100,

    INDEX `meta_item_partidas_wbsItemId_idx`(`wbsItemId`),
    UNIQUE INDEX `meta_item_partidas_metaItemId_wbsItemId_key`(`metaItemId`, `wbsItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gastos_generales_meta` (
    `id` VARCHAR(191) NOT NULL,
    `presupuestoMetaId` VARCHAR(191) NOT NULL,
    `concepto` VARCHAR(200) NOT NULL,
    `tipo` ENUM('FIJO', 'VARIABLE') NOT NULL,
    `montoMensual` DECIMAL(14, 2) NULL,
    `meses` DECIMAL(5, 2) NULL,
    `montoTotal` DECIMAL(14, 2) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,

    INDEX `gastos_generales_meta_presupuestoMetaId_orden_idx`(`presupuestoMetaId`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `presupuestos_meta` ADD CONSTRAINT `presupuestos_meta_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `presupuesto_meta_items` ADD CONSTRAINT `presupuesto_meta_items_presupuestoMetaId_fkey` FOREIGN KEY (`presupuestoMetaId`) REFERENCES `presupuestos_meta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta_item_partidas` ADD CONSTRAINT `meta_item_partidas_metaItemId_fkey` FOREIGN KEY (`metaItemId`) REFERENCES `presupuesto_meta_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `meta_item_partidas` ADD CONSTRAINT `meta_item_partidas_wbsItemId_fkey` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos_generales_meta` ADD CONSTRAINT `gastos_generales_meta_presupuestoMetaId_fkey` FOREIGN KEY (`presupuestoMetaId`) REFERENCES `presupuestos_meta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
