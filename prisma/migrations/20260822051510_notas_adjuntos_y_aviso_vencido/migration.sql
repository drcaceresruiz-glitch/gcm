-- AlterTable
ALTER TABLE `avisos` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE', 'RESPUESTA_CONTRATISTA', 'NOTA_VENCIDA') NOT NULL;

-- AlterTable
ALTER TABLE `envios_aviso` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE', 'RESPUESTA_CONTRATISTA', 'NOTA_VENCIDA') NOT NULL;

-- CreateTable
CREATE TABLE `adjuntos_nota` (
    `id` VARCHAR(191) NOT NULL,
    `notaId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `ruta` VARCHAR(255) NOT NULL,
    `nombreOriginal` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `subidaPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `adjuntos_nota_notaId_idx`(`notaId`),
    INDEX `adjuntos_nota_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `adjuntos_nota` ADD CONSTRAINT `adjuntos_nota_notaId_fkey` FOREIGN KEY (`notaId`) REFERENCES `notas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
