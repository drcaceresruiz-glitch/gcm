-- CreateTable
CREATE TABLE `proveedor_partidas` (
    `id` VARCHAR(191) NOT NULL,
    `proveedorId` VARCHAR(191) NOT NULL,
    `wbsItemId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `proveedor_partidas_wbsItemId_idx`(`wbsItemId`),
    UNIQUE INDEX `proveedor_partidas_proveedorId_wbsItemId_key`(`proveedorId`, `wbsItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `proveedor_partidas` ADD CONSTRAINT `proveedor_partidas_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proveedor_partidas` ADD CONSTRAINT `proveedor_partidas_wbsItemId_fkey` FOREIGN KEY (`wbsItemId`) REFERENCES `wbs_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
