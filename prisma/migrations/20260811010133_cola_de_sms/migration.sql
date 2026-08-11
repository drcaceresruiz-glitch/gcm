-- CreateTable
CREATE TABLE `mensajes_sms` (
    `id` VARCHAR(191) NOT NULL,
    `numero` VARCHAR(20) NOT NULL,
    `texto` VARCHAR(320) NOT NULL,
    `tomadoAt` DATETIME(3) NULL,
    `enviadoAt` DATETIME(3) NULL,
    `entregas` INTEGER NOT NULL DEFAULT 0,
    `expiraAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mensajes_sms_enviadoAt_expiraAt_idx`(`enviadoAt`, `expiraAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
