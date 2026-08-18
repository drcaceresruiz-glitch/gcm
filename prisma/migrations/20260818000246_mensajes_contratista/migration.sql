-- CreateTable
CREATE TABLE `mensajes_contratista` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `proveedorId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NULL,
    `canal` ENUM('CORREO', 'SMS', 'WHATSAPP') NOT NULL,
    `destino` VARCHAR(150) NOT NULL,
    `asunto` VARCHAR(200) NULL,
    `cuerpo` TEXT NOT NULL,
    `adjuntos` JSON NULL,
    `respuestaA` VARCHAR(150) NULL,
    `enviado` BOOLEAN NOT NULL,
    `motivo` VARCHAR(60) NULL,
    `enviadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mensajes_contratista_proveedorId_createdAt_idx`(`proveedorId`, `createdAt`),
    INDEX `mensajes_contratista_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mensajes_contratista` ADD CONSTRAINT `mensajes_contratista_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
