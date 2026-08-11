/*
  Avisos de restricciones: que lo que GCM ya sabe llegue a quien puede
  resolverlo.

  Cuatro tablas y una columna. Todas VACIAS al crearse, asi que esta migracion
  no toca ni un dato existente y se puede aplicar con la obra en marcha:

    - `contactos_aviso`     libreta de gente de FUERA de GCM (proveedor,
                            proyectista). No es un pase: aquel da entrada a la
                            obra, esto solo dice por donde escribirle.
    - `suscripciones_aviso` a quien se avisa, de que flujo y por donde. Las
                            tres formas de decir "a quien" —persona, rol,
                            externo— en la misma tabla.
    - `avisos`              el aviso dentro de GCM, con leido POR USUARIO.
    - `reloj_tareas`        cuando corrio por ultima vez cada tarea
                            programada. GCM no tenia NADA que corriera solo.

  Y `mensajes_sms.projectId`, que faltaba: sin el no habia forma de contar
  cuantos SMS gasta una obra, y el tope diario de avisos necesita saberlo.
*/

-- AlterTable
ALTER TABLE `mensajes_sms` ADD COLUMN `projectId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `contactos_aviso` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `nombre` VARCHAR(150) NOT NULL,
    `empresa` VARCHAR(150) NULL,
    `cargo` VARCHAR(100) NULL,
    `celular` VARCHAR(20) NULL,
    `email` VARCHAR(150) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `bajaAt` DATETIME(3) NULL,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contactos_aviso_projectId_activo_idx`(`projectId`, `activo`),
    UNIQUE INDEX `contactos_aviso_projectId_email_key`(`projectId`, `email`),
    UNIQUE INDEX `contactos_aviso_projectId_celular_key`(`projectId`, `celular`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suscripciones_aviso` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `rol` ENUM('ADMIN', 'RESIDENTE', 'ADMIN_OBRA', 'ALMACENERO', 'CONSULTOR') NULL,
    `contactoId` VARCHAR(191) NULL,
    `tipo` ENUM('SEGURIDAD', 'INFORMACION', 'ESPACIO', 'MATERIALES', 'MANO_OBRA', 'REQUISITOS', 'EQUIPOS') NULL,
    `porApp` BOOLEAN NOT NULL DEFAULT true,
    `porCorreo` BOOLEAN NOT NULL DEFAULT true,
    `porSms` BOOLEAN NOT NULL DEFAULT false,
    `alAbrir` BOOLEAN NOT NULL DEFAULT true,
    `alRecordar` BOOLEAN NOT NULL DEFAULT true,
    `alQuedarLista` BOOLEAN NOT NULL DEFAULT false,
    `enResumen` BOOLEAN NOT NULL DEFAULT true,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `suscripciones_aviso_projectId_tipo_idx`(`projectId`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `avisos` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN') NOT NULL,
    `titulo` VARCHAR(200) NOT NULL,
    `cuerpo` VARCHAR(400) NOT NULL,
    `camino` VARCHAR(200) NOT NULL,
    `leidoAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `avisos_userId_leidoAt_createdAt_idx`(`userId`, `leidoAt`, `createdAt`),
    INDEX `avisos_projectId_createdAt_idx`(`projectId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reloj_tareas` (
    `clave` VARCHAR(40) NOT NULL,
    `ultimaAt` DATETIME(3) NOT NULL,
    `cursor` VARCHAR(60) NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `mensajes_sms_projectId_createdAt_idx` ON `mensajes_sms`(`projectId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `contactos_aviso` ADD CONSTRAINT `contactos_aviso_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suscripciones_aviso` ADD CONSTRAINT `suscripciones_aviso_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suscripciones_aviso` ADD CONSTRAINT `suscripciones_aviso_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `suscripciones_aviso` ADD CONSTRAINT `suscripciones_aviso_contactoId_fkey` FOREIGN KEY (`contactoId`) REFERENCES `contactos_aviso`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avisos` ADD CONSTRAINT `avisos_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `avisos` ADD CONSTRAINT `avisos_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
