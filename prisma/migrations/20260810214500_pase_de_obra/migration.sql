-- Pase de obra: personal de campo que documenta SIN ser usuario de GCM.
--
-- No toca ningun dato existente. Las tres tablas nacen vacias y la columna
-- que se anade a `fotos_evidencia` nace NULL para todas las fotos ya subidas
-- (que las subio un usuario, no un pase). Se puede aplicar con la aplicacion
-- en marcha: el codigo viejo no mira nada de esto.

-- CreateTable
CREATE TABLE `pases_obra` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `nombres` VARCHAR(100) NOT NULL,
    `apellidos` VARCHAR(100) NOT NULL,
    `cargo` VARCHAR(100) NULL,
    `empresa` VARCHAR(150) NULL,
    `celular` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `revocadoAt` DATETIME(3) NULL,
    `revocadoPor` VARCHAR(150) NULL,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    -- MySQL admite varios NULL en un indice unico: quien no tenga correo no
    -- choca con los demas que tampoco lo tengan.
    UNIQUE INDEX `pases_obra_projectId_email_key`(`projectId`, `email`),
    UNIQUE INDEX `pases_obra_projectId_celular_key`(`projectId`, `celular`),
    INDEX `pases_obra_projectId_activo_idx`(`projectId`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `codigos_pase` (
    `id` VARCHAR(191) NOT NULL,
    `paseId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `codigoHash` CHAR(64) NOT NULL,
    `intentos` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `codigos_pase_tokenHash_key`(`tokenHash`),
    INDEX `codigos_pase_paseId_idx`(`paseId`),
    INDEX `codigos_pase_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesiones_pase` (
    `id` VARCHAR(191) NOT NULL,
    `paseId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sesiones_pase_tokenHash_key`(`tokenHash`),
    INDEX `sesiones_pase_paseId_idx`(`paseId`),
    INDEX `sesiones_pase_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
-- Nace NULL: las fotos ya existentes las subio un usuario con sesion, no un
-- pase. `subidaPor` sigue siendo la fuente del nombre en ambos casos.
ALTER TABLE `fotos_evidencia` ADD COLUMN `paseId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `fotos_evidencia_paseId_idx` ON `fotos_evidencia`(`paseId`);

-- AddForeignKey
ALTER TABLE `pases_obra` ADD CONSTRAINT `pases_obra_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codigos_pase` ADD CONSTRAINT `codigos_pase_paseId_fkey` FOREIGN KEY (`paseId`) REFERENCES `pases_obra`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sesiones_pase` ADD CONSTRAINT `sesiones_pase_paseId_fkey` FOREIGN KEY (`paseId`) REFERENCES `pases_obra`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull y no Cascade: borrar un pase JAMAS puede llevarse las fotos que
-- aporto. La evidencia sobrevive a la persona; `subidaPor` conserva su nombre.
ALTER TABLE `fotos_evidencia` ADD CONSTRAINT `fotos_evidencia_paseId_fkey` FOREIGN KEY (`paseId`) REFERENCES `pases_obra`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
