-- Mensajes reutilizables para escribir a un contratista.
--
-- Hermana de `formas_pago_plantillas`: mismo patron, misma forma, mismo unico
-- por (empresa, nombre). Nace VACIA a proposito — GCM no trae escritas las
-- palabras con las que una constructora habla con sus contratistas.
--
-- ADITIVO: una tabla nueva. Nada existente se toca.

-- CreateTable
CREATE TABLE `plantillas_mensaje` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `asunto` VARCHAR(200) NULL,
    `cuerpo` TEXT NOT NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `plantillas_mensaje_companyId_idx`(`companyId`),
    UNIQUE INDEX `plantillas_mensaje_companyId_nombre_key`(`companyId`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plantillas_mensaje` ADD CONSTRAINT `plantillas_mensaje_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
