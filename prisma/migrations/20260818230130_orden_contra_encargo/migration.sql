-- AlterTable
ALTER TABLE `ordenes_compra` ADD COLUMN `encargoId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ordenes_compra_encargoId_idx` ON `ordenes_compra`(`encargoId`);

-- AddForeignKey
ALTER TABLE `ordenes_compra` ADD CONSTRAINT `ordenes_compra_encargoId_fkey` FOREIGN KEY (`encargoId`) REFERENCES `encargos_proveedor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
