-- CreateTable
CREATE TABLE `fotos_galeria` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `ruta` VARCHAR(255) NOT NULL,
    `nombreOriginal` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(100) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `titulo` VARCHAR(150) NULL,
    `descripcion` VARCHAR(500) NULL,
    `uid` INTEGER NULL,
    `visibleCliente` BOOLEAN NOT NULL DEFAULT false,
    `subidaPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `fotos_galeria_projectId_createdAt_idx`(`projectId`, `createdAt`),
    INDEX `fotos_galeria_projectId_uid_idx`(`projectId`, `uid`),
    INDEX `fotos_galeria_projectId_visibleCliente_idx`(`projectId`, `visibleCliente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `galerias_obra` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT false,
    `agrupacion` ENUM('SEMANA', 'MES') NOT NULL DEFAULT 'SEMANA',
    `portadaId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `galerias_obra_projectId_key`(`projectId`),
    UNIQUE INDEX `galerias_obra_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fotos_galeria` ADD CONSTRAINT `fotos_galeria_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `galerias_obra` ADD CONSTRAINT `galerias_obra_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `galerias_obra` ADD CONSTRAINT `galerias_obra_portadaId_fkey` FOREIGN KEY (`portadaId`) REFERENCES `fotos_galeria`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

