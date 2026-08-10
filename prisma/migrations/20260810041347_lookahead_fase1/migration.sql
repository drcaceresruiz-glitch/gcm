-- AlterTable
ALTER TABLE `compromisos_semanales` ADD COLUMN `cantidadEjec` DECIMAL(14, 4) NULL,
    ADD COLUMN `cantidadPlan` DECIMAL(14, 4) NULL,
    ADD COLUMN `color` VARCHAR(9) NULL,
    ADD COLUMN `lookaheadTaskId` VARCHAR(191) NULL,
    ADD COLUMN `protocoloCalidad` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `proveedorId` VARCHAR(191) NULL,
    ADD COLUMN `unidad` VARCHAR(20) NULL,
    ADD COLUMN `zona` VARCHAR(40) NULL;

-- CreateTable
CREATE TABLE `calendarios_laborales` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `diaSemana` INTEGER NOT NULL,
    `laborable` BOOLEAN NOT NULL DEFAULT true,
    `horas` DECIMAL(4, 2) NOT NULL DEFAULT 8,
    `turno` ENUM('NORMAL', 'NOCHE', 'TURNOS') NOT NULL DEFAULT 'NORMAL',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `calendarios_laborales_projectId_idx`(`projectId`),
    UNIQUE INDEX `calendarios_laborales_projectId_diaSemana_key`(`projectId`, `diaSemana`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lookahead_tareas` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `uid` INTEGER NOT NULL,
    `faseBloque` VARCHAR(120) NULL,
    `zona` VARCHAR(80) NULL,
    `proveedorId` VARCHAR(191) NULL,
    `bimGuid` VARCHAR(255) NULL,
    `estado` ENUM('PENDIENTE', 'LISTO', 'BLOQUEADO') NOT NULL DEFAULT 'PENDIENTE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lookahead_tareas_projectId_estado_idx`(`projectId`, `estado`),
    UNIQUE INDEX `lookahead_tareas_projectId_uid_key`(`projectId`, `uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `restricciones_tarea` (
    `id` VARCHAR(191) NOT NULL,
    `lookaheadTaskId` VARCHAR(191) NOT NULL,
    `tipo` ENUM('SEGURIDAD', 'INFORMACION', 'ESPACIO', 'MATERIALES', 'MANO_OBRA', 'REQUISITOS', 'EQUIPOS') NOT NULL,
    `detalle` VARCHAR(300) NULL,
    `requiereDoc` BOOLEAN NOT NULL DEFAULT false,
    `documentoId` VARCHAR(191) NULL,
    `resuelta` BOOLEAN NOT NULL DEFAULT false,
    `resueltaAt` DATETIME(3) NULL,
    `resueltaPor` VARCHAR(150) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `restricciones_tarea_lookaheadTaskId_idx`(`lookaheadTaskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `audit_logs_companyId_entidad_createdAt_idx` ON `audit_logs`(`companyId`, `entidad`, `createdAt`);

-- CreateIndex
CREATE INDEX `audit_logs_projectId_createdAt_idx` ON `audit_logs`(`projectId`, `createdAt`);

-- CreateIndex
CREATE INDEX `audit_logs_accion_createdAt_idx` ON `audit_logs`(`accion`, `createdAt`);

-- CreateIndex
CREATE INDEX `compromisos_semanales_proveedorId_idx` ON `compromisos_semanales`(`proveedorId`);

-- CreateIndex
CREATE INDEX `encargos_proveedor_projectId_fechaInicio_idx` ON `encargos_proveedor`(`projectId`, `fechaInicio`);

-- CreateIndex
CREATE INDEX `encargos_proveedor_estado_fechaInicio_idx` ON `encargos_proveedor`(`estado`, `fechaInicio`);

-- CreateIndex
CREATE INDEX `movimientos_presupuestales_projectId_fecha_idx` ON `movimientos_presupuestales`(`projectId`, `fecha`);

-- CreateIndex
CREATE INDEX `movimientos_presupuestales_tipo_estado_idx` ON `movimientos_presupuestales`(`tipo`, `estado`);

-- CreateIndex
CREATE INDEX `movimientos_presupuestales_aprobadoAt_idx` ON `movimientos_presupuestales`(`aprobadoAt`);

-- CreateIndex
CREATE INDEX `ordenes_compra_fecha_idx` ON `ordenes_compra`(`fecha`);

-- CreateIndex
CREATE INDEX `ordenes_compra_estado_fecha_idx` ON `ordenes_compra`(`estado`, `fecha`);

-- CreateIndex
CREATE INDEX `ordenes_compra_total_idx` ON `ordenes_compra`(`total`);

-- CreateIndex
CREATE INDEX `planes_semanales_projectId_fechaCorte_idx` ON `planes_semanales`(`projectId`, `fechaCorte`);

-- CreateIndex
CREATE INDEX `planes_semanales_estado_fechaCorte_idx` ON `planes_semanales`(`estado`, `fechaCorte`);

-- CreateIndex
CREATE INDEX `proveedores_companyId_razonSocial_idx` ON `proveedores`(`companyId`, `razonSocial`);

-- CreateIndex
CREATE INDEX `proveedores_companyId_activo_idx` ON `proveedores`(`companyId`, `activo`);

-- CreateIndex
CREATE INDEX `wbs_items_projectId_tipo_idx` ON `wbs_items`(`projectId`, `tipo`);

-- CreateIndex
CREATE INDEX `wbs_items_projectId_modalidad_idx` ON `wbs_items`(`projectId`, `modalidad`);

-- CreateIndex
CREATE INDEX `wbs_items_parentId_orden_idx` ON `wbs_items`(`parentId`, `orden`);

-- AddForeignKey
ALTER TABLE `compromisos_semanales` ADD CONSTRAINT `compromisos_semanales_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `calendarios_laborales` ADD CONSTRAINT `calendarios_laborales_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lookahead_tareas` ADD CONSTRAINT `lookahead_tareas_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lookahead_tareas` ADD CONSTRAINT `lookahead_tareas_proveedorId_fkey` FOREIGN KEY (`proveedorId`) REFERENCES `proveedores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restricciones_tarea` ADD CONSTRAINT `restricciones_tarea_lookaheadTaskId_fkey` FOREIGN KEY (`lookaheadTaskId`) REFERENCES `lookahead_tareas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (dato): siembra el calendario laboral por defecto para las obras que
-- YA existen (L-V 8h, sabado 5h, domingo descanso). Las obras nuevas lo reciben
-- al crearse (obras.service). La tabla acaba de crearse, asi que esta vacia y no
-- hay conflicto con el unique (projectId, diaSemana).
INSERT INTO `calendarios_laborales`
  (`id`, `projectId`, `diaSemana`, `laborable`, `horas`, `turno`, `createdAt`, `updatedAt`)
SELECT CONCAT(p.`id`, '-cal', d.`diaSemana`), p.`id`, d.`diaSemana`, d.`laborable`, d.`horas`, 'NORMAL', NOW(3), NOW(3)
FROM `projects` p
CROSS JOIN (
              SELECT 1 AS `diaSemana`, 1 AS `laborable`, 8.00 AS `horas`
    UNION ALL SELECT 2, 1, 8.00
    UNION ALL SELECT 3, 1, 8.00
    UNION ALL SELECT 4, 1, 8.00
    UNION ALL SELECT 5, 1, 8.00
    UNION ALL SELECT 6, 1, 5.00
    UNION ALL SELECT 7, 0, 0.00
) d;
