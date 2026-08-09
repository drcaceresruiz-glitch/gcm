-- AlterTable
ALTER TABLE `avances_tarea` ADD COLUMN `planSemanalId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `avances_tarea_planSemanalId_idx` ON `avances_tarea`(`planSemanalId`);

-- AddForeignKey
ALTER TABLE `avances_tarea` ADD CONSTRAINT `avances_tarea_planSemanalId_fkey` FOREIGN KEY (`planSemanalId`) REFERENCES `planes_semanales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
