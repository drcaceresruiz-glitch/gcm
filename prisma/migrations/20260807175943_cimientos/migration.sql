-- CreateTable
CREATE TABLE `companies` (
    `id` VARCHAR(191) NOT NULL,
    `razonSocial` VARCHAR(200) NOT NULL,
    `ruc` VARCHAR(11) NOT NULL,
    `direccion` VARCHAR(255) NULL,
    `telefono` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `companies_ruc_key`(`ruc`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nombres` VARCHAR(100) NOT NULL,
    `apellidos` VARCHAR(100) NOT NULL,
    `tipoDoc` VARCHAR(10) NOT NULL,
    `numDoc` VARCHAR(20) NOT NULL,
    `cargo` VARCHAR(100) NULL,
    `celular` VARCHAR(30) NULL,
    `email` VARCHAR(150) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'RESIDENTE', 'ADMIN_OBRA', 'ALMACENERO', 'CONSULTOR') NOT NULL,
    `estado` ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_companyId_estado_idx`(`companyId`, `estado`),
    UNIQUE INDEX `users_companyId_numDoc_key`(`companyId`, `numDoc`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_tokenHash_key`(`tokenHash`),
    INDEX `sessions_userId_idx`(`userId`),
    INDEX `sessions_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_tokenHash_key`(`tokenHash`),
    INDEX `password_reset_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nombreObra` VARCHAR(255) NOT NULL,
    `codigoObra` VARCHAR(40) NULL,
    `ubicacion` VARCHAR(255) NULL,
    `cliente` VARCHAR(200) NULL,
    `descripcion` TEXT NULL,
    `fechaInicio` DATE NOT NULL,
    `fechaFinProgramada` DATE NOT NULL,
    `estado` ENUM('PLANIFICACION', 'EN_EJECUCION', 'PARALIZADA', 'CERRADA') NOT NULL DEFAULT 'PLANIFICACION',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_companyId_estado_idx`(`companyId`, `estado`),
    UNIQUE INDEX `projects_companyId_codigoObra_key`(`companyId`, `codigoObra`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_memberships` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'RESIDENTE', 'ADMIN_OBRA', 'ALMACENERO', 'CONSULTOR') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `project_memberships_projectId_idx`(`projectId`),
    UNIQUE INDEX `project_memberships_userId_projectId_key`(`userId`, `projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wbs_items` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `codigoPartida` VARCHAR(32) NOT NULL,
    `tipo` ENUM('CAPITULO', 'PARTIDA') NOT NULL,
    `descripcion` VARCHAR(500) NOT NULL,
    `nivel` INTEGER NOT NULL DEFAULT 0,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `unidad` VARCHAR(20) NULL,
    `metrado` DECIMAL(14, 4) NULL,
    `precioUnitario` DECIMAL(14, 4) NULL,
    `parcial` DECIMAL(14, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `wbs_items_projectId_parentId_idx`(`projectId`, `parentId`),
    INDEX `wbs_items_projectId_orden_idx`(`projectId`, `orden`),
    UNIQUE INDEX `wbs_items_projectId_codigoPartida_key`(`projectId`, `codigoPartida`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `baselines` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `montoTotal` DECIMAL(14, 2) NOT NULL,
    `notas` TEXT NULL,
    `aprobadaAt` DATETIME(3) NULL,
    `aprobadaPor` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `baselines_projectId_version_key`(`projectId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `baseline_items` (
    `id` VARCHAR(191) NOT NULL,
    `baselineId` VARCHAR(191) NOT NULL,
    `codigoPartida` VARCHAR(32) NOT NULL,
    `descripcion` VARCHAR(500) NOT NULL,
    `tipo` ENUM('CAPITULO', 'PARTIDA') NOT NULL,
    `nivel` INTEGER NOT NULL DEFAULT 0,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `unidad` VARCHAR(20) NULL,
    `metrado` DECIMAL(14, 4) NULL,
    `precioUnitario` DECIMAL(14, 4) NULL,
    `parcial` DECIMAL(14, 2) NULL,

    INDEX `baseline_items_baselineId_orden_idx`(`baselineId`, `orden`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `entidad` VARCHAR(60) NOT NULL,
    `entidadId` VARCHAR(40) NOT NULL,
    `accion` ENUM('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGE', 'PASSWORD_RESET') NOT NULL,
    `antes` JSON NULL,
    `despues` JSON NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `audit_logs_entidad_entidadId_idx`(`entidad`, `entidadId`),
    INDEX `audit_logs_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wbs_items` ADD CONSTRAINT `wbs_items_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wbs_items` ADD CONSTRAINT `wbs_items_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `wbs_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baselines` ADD CONSTRAINT `baselines_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baseline_items` ADD CONSTRAINT `baseline_items_baselineId_fkey` FOREIGN KEY (`baselineId`) REFERENCES `baselines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
