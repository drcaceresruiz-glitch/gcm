/*
  El aviso de Prisma era: no se puede anadir una columna obligatoria a una
  tabla que tenga filas. Se resuelve VACIANDO la cola primero, y se puede
  hacer sin perder nada que importe.

  `mensajes_sms` no es un historico: son SMS pendientes de enviar, con un
  codigo de un solo uso dentro que caduca a los diez minutos. Cualquier fila
  que hubiera aqui al aplicar esto ya no serviria para entrar en ningun sitio.
  Y no se puede adivinar de que empresa era cada una —ese es justo el dato que
  faltaba—, asi que dejarlas seria dejar basura sin dueno.

  Lo unico que se pierde: si alguien pidio un codigo en el minuto anterior al
  despliegue, no le llega y tiene que pedirlo otra vez.
*/
DELETE FROM `mensajes_sms`;

-- DropIndex
DROP INDEX `mensajes_sms_enviadoAt_expiraAt_idx` ON `mensajes_sms`;

-- AlterTable
ALTER TABLE `mensajes_sms` ADD COLUMN `companyId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `emisores_sms` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `etiqueta` VARCHAR(80) NOT NULL,
    `numero` VARCHAR(20) NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `ultimaConsultaAt` DATETIME(3) NULL,
    `vinculadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `emisores_sms_tokenHash_key`(`tokenHash`),
    INDEX `emisores_sms_companyId_activo_idx`(`companyId`, `activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `mensajes_sms_companyId_enviadoAt_expiraAt_idx` ON `mensajes_sms`(`companyId`, `enviadoAt`, `expiraAt`);

-- AddForeignKey
ALTER TABLE `emisores_sms` ADD CONSTRAINT `emisores_sms_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mensajes_sms` ADD CONSTRAINT `mensajes_sms_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
