-- CreateTable
CREATE TABLE `conversaciones_agente` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversaciones_agente_companyId_userId_createdAt_idx`(`companyId`, `userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mensajes_agente` (
    `id` VARCHAR(191) NOT NULL,
    `conversacionId` VARCHAR(191) NOT NULL,
    `rol` ENUM('USUARIO', 'ASISTENTE') NOT NULL,
    `contenido` TEXT NOT NULL,
    `herramientas` JSON NULL,
    `iniciadoAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `terminadoAt` DATETIME(3) NULL,
    `error` VARCHAR(500) NULL,

    INDEX `mensajes_agente_conversacionId_iniciadoAt_idx`(`conversacionId`, `iniciadoAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversaciones_agente` ADD CONSTRAINT `conversaciones_agente_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mensajes_agente` ADD CONSTRAINT `mensajes_agente_conversacionId_fkey` FOREIGN KEY (`conversacionId`) REFERENCES `conversaciones_agente`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
