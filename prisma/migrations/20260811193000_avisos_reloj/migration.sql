/*
  Lo que le faltaba al motor de avisos para no fallar en produccion.

  Tres agujeros que la primera migracion no cubria, y los tres son de los que
  no dan la cara hasta que ya has molestado a alguien:

    1. `envios_aviso` — la CLAVE UNICA que se reserva ANTES de enviar. Sin
       ella, dos pasadas solapadas del cron mandan el mismo correo dos veces,
       y si el cron estuvo caido tres horas, al volver manda tres horas de
       avisos de golpe.

    2. `lookahead_tareas.listaAt` — la fecha de la TRANSICION a LISTO. Sin
       ella no hay forma de saber que una tarea ACABA de quedar lista, solo
       que lo esta; el aviso saldria otra vez cada vez que alguien toca la
       matriz.

    3. `mensajes_sms.prioridad` — los avisos comparten cola con los codigos de
       acceso, que caducan a los diez minutos y salen de cinco en cinco. Diez
       avisos por delante y alguien no puede entrar en su cuenta por culpa de
       un aviso de materiales. Los codigos encolaran con 10, los avisos con 0.

  Y `ajustes_avisos_obra`, que es lo que se ajusta por obra (cada cuanto
  insistir, a que hora el resumen, cuanto SMS se puede gastar).

  `reloj_tareas` se rehace: `ultimaAt` no bastaba. Hace falta saber si hay una
  pasada EN CURSO —para no solapar— y que la que revienta deje escrito que
  termino, o el reloj se bloquea a si mismo para siempre. La tabla se creo hace
  minutos y esta vacia, asi que soltar la columna no pierde nada.
*/

-- AlterTable
ALTER TABLE `lookahead_tareas` ADD COLUMN `listaAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `mensajes_sms` ADD COLUMN `prioridad` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `reloj_tareas` DROP COLUMN `ultimaAt`,
    ADD COLUMN `avisosCreados` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `error` VARCHAR(300) NULL,
    ADD COLUMN `iniciadaAt` DATETIME(3) NOT NULL,
    ADD COLUMN `obrasVistas` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `terminadaAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `envios_aviso` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN') NOT NULL,
    `canal` ENUM('APP', 'CORREO', 'SMS') NOT NULL,
    `userId` VARCHAR(191) NULL,
    `contactoId` VARCHAR(191) NULL,
    `clave` VARCHAR(120) NOT NULL,
    `destino` VARCHAR(150) NOT NULL,
    `enviado` BOOLEAN NOT NULL,
    `motivo` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `envios_aviso_companyId_canal_createdAt_idx`(`companyId`, `canal`, `createdAt`),
    UNIQUE INDEX `envios_aviso_projectId_canal_clave_key`(`projectId`, `canal`, `clave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ajustes_avisos_obra` (
    `projectId` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `diasRecordatorio` INTEGER NOT NULL DEFAULT 3,
    `horaResumen` INTEGER NOT NULL DEFAULT 7,
    `maxSmsDia` INTEGER NOT NULL DEFAULT 20,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ajustes_avisos_obra` ADD CONSTRAINT `ajustes_avisos_obra_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
