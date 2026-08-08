-- Solicitudes de cambio de datos de perfil (nombres, apellidos, cargo, doc).
-- Solo ANADE una tabla: no toca datos existentes, asi que es segura de aplicar.
-- `usuarioPendienteId` es unico y nullable a proposito: vale el userId mientras
-- la solicitud esta PENDIENTE y NULL al resolverse, de modo que MySQL admita
-- varias resueltas por usuario pero solo una viva. Es la regla "una pendiente
-- por usuario" cerrada en la base, no en la interfaz.

-- CreateTable
CREATE TABLE `solicitudes_cambio_perfil` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nombres` VARCHAR(100) NULL,
    `apellidos` VARCHAR(100) NULL,
    `cargo` VARCHAR(100) NULL,
    `tipoDoc` VARCHAR(10) NULL,
    `numDoc` VARCHAR(20) NULL,
    `motivo` TEXT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `resueltaAt` DATETIME(3) NULL,
    `resueltaPor` VARCHAR(150) NULL,
    `motivoRechazo` TEXT NULL,
    `usuarioPendienteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `solicitudes_cambio_perfil_usuarioPendienteId_key`(`usuarioPendienteId`),
    INDEX `solicitudes_cambio_perfil_companyId_estado_idx`(`companyId`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `solicitudes_cambio_perfil` ADD CONSTRAINT `solicitudes_cambio_perfil_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_cambio_perfil` ADD CONSTRAINT `solicitudes_cambio_perfil_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
