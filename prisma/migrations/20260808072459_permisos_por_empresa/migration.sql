-- CreateTable
CREATE TABLE `company_permissions` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'RESIDENTE', 'ADMIN_OBRA', 'ALMACENERO', 'CONSULTOR') NOT NULL,
    `permiso` VARCHAR(40) NOT NULL,
    `concedido` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_permissions_companyId_role_permiso_key`(`companyId`, `role`, `permiso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_permissions` ADD CONSTRAINT `company_permissions_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
