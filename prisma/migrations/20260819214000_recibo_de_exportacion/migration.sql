-- El recibo de haber sacado la constructora entera.
--
-- Existe para poder EXIGIR una exportacion antes de borrar una constructora:
-- el apunte de auditoria no sirve, porque se escribe al empezar y significa
-- "alguien lo intento".
--
-- SIN clave foranea a `companies`, a proposito: la fila tiene que sobrevivir
-- al borrado de la empresa, que es justo cuando pasa a importar. Por eso
-- tambien se copian aqui la razon social y el RUC.
--
-- ADITIVO: una tabla nueva. Nada existente se toca.

-- CreateTable
CREATE TABLE `exportaciones_empresa` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `razonSocial` VARCHAR(200) NOT NULL,
    `ruc` VARCHAR(11) NOT NULL,
    `formato` INTEGER NOT NULL,
    `hashManifiesto` VARCHAR(64) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `obras` INTEGER NOT NULL,
    `conteos` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `exportaciones_empresa_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
