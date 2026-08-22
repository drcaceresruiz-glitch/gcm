-- CreateTable
CREATE TABLE `mensajes_soporte` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `direccion` ENUM('DEL_OPERADOR', 'DE_LA_EMPRESA') NOT NULL,
    `cuerpo` TEXT NOT NULL,
    `autorNombre` VARCHAR(150) NOT NULL,
    `autorUserId` VARCHAR(191) NULL,
    `leidoPorOperadorAt` DATETIME(3) NULL,
    `leidoPorEmpresaAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `mensajes_soporte_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `mensajes_soporte` ADD CONSTRAINT `mensajes_soporte_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
