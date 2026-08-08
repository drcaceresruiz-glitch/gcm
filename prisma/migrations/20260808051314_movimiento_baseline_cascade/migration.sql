-- DropForeignKey
ALTER TABLE `movimientos_presupuestales` DROP FOREIGN KEY `movimientos_presupuestales_baselineId_fkey`;

-- AddForeignKey
ALTER TABLE `movimientos_presupuestales` ADD CONSTRAINT `movimientos_presupuestales_baselineId_fkey` FOREIGN KEY (`baselineId`) REFERENCES `baselines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
