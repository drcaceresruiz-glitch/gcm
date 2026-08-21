-- CreateTable
CREATE TABLE `notas` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `categoria` ENUM('FINANCIERO', 'LOGISTICA', 'OPERATIVO', 'LEGAL') NOT NULL,
    `titulo` VARCHAR(150) NOT NULL,
    `cuerpo` TEXT NOT NULL,
    `fechaRecordatorio` DATE NULL,
    `atendida` BOOLEAN NOT NULL DEFAULT false,
    `atendidaAt` DATETIME(3) NULL,
    `atendidaPor` VARCHAR(150) NULL,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `notas_projectId_atendida_fechaRecordatorio_idx`(`projectId`, `atendida`, `fechaRecordatorio`),
    INDEX `notas_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notas` ADD CONSTRAINT `notas_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
