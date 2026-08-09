-- CreateTable
CREATE TABLE `planes_semanales` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `numero` INTEGER NOT NULL,
    `fechaCorte` DATE NOT NULL,
    `estado` ENUM('ABIERTO', 'CERRADO') NOT NULL DEFAULT 'ABIERTO',
    `notas` TEXT NULL,
    `creadoPor` VARCHAR(150) NOT NULL,
    `cerradoPor` VARCHAR(150) NULL,
    `cerradoAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `planes_semanales_projectId_estado_idx`(`projectId`, `estado`),
    UNIQUE INDEX `planes_semanales_projectId_numero_key`(`projectId`, `numero`),
    UNIQUE INDEX `planes_semanales_projectId_fechaCorte_key`(`projectId`, `fechaCorte`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compromisos_semanales` (
    `id` VARCHAR(191) NOT NULL,
    `planSemanalId` VARCHAR(191) NOT NULL,
    `uid` INTEGER NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `metaPorcentaje` DECIMAL(5, 2) NULL,
    `cumplido` BOOLEAN NULL,
    `causa` ENUM('PRERREQUISITO', 'MATERIALES', 'MANO_OBRA', 'EQUIPOS', 'INFORMACION', 'CLIENTE_TERCEROS', 'CLIMA', 'REPROGRAMACION', 'OTRA') NULL,
    `notaCierre` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `compromisos_semanales_planSemanalId_idx`(`planSemanalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `planes_semanales` ADD CONSTRAINT `planes_semanales_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compromisos_semanales` ADD CONSTRAINT `compromisos_semanales_planSemanalId_fkey` FOREIGN KEY (`planSemanalId`) REFERENCES `planes_semanales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
