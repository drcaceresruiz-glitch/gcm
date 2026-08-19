-- CreateTable
CREATE TABLE `remitentes_correo` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `host` VARCHAR(150) NOT NULL,
    `puerto` INTEGER NOT NULL,
    `seguro` BOOLEAN NOT NULL DEFAULT true,
    `usuario` VARCHAR(200) NOT NULL,
    `claveCifrada` TEXT NOT NULL,
    `remitenteNombre` VARCHAR(150) NOT NULL,
    `remitenteCorreo` VARCHAR(150) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `verificadoAt` DATETIME(3) NULL,
    `ultimoError` VARCHAR(300) NULL,
    `ultimoErrorAt` DATETIME(3) NULL,
    `configuradoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `remitentes_correo_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `remitentes_correo` ADD CONSTRAINT `remitentes_correo_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
