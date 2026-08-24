-- Bajar un costo propio de la meta congelada, con la firma de gerencia.
--
-- Pedido asi: «que el residente y/o el administrador de la obra pueda
-- solicitar deducir monto de los gastos generales, se le presenta al gerente
-- general y si este lo aprueba perfecto, se hacen todos los ajustes».
--
-- Es una tabla APARTE y no una edicion de la meta a proposito. La meta se
-- congela al aprobarla, y esa congelacion es lo que permite ver la desviacion:
-- si el plan se reescribiera para encajar con la realidad, siempre pareceria
-- que se va justo. Misma relacion que `baselines` con
-- `movimientos_presupuestales`: congelado mas ajustes aprobados igual a
-- vigente.

CREATE TABLE `deducciones_costo_propio` (
  `id`                VARCHAR(191) NOT NULL,
  `projectId`         VARCHAR(191) NOT NULL,
  `presupuestoMetaId` VARCHAR(191) NOT NULL,
  `metaItemId`        VARCHAR(191) NOT NULL,
  `numero`            INTEGER NOT NULL,
  -- Siempre positivo: cuanto se va a dejar de gastar.
  `importe`           DECIMAL(14, 2) NOT NULL,
  `motivo`            TEXT NOT NULL,
  `estado`            ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
  `solicitadaPor`     VARCHAR(150) NOT NULL,
  `createdAt`         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`         DATETIME(3) NOT NULL,
  `resueltaAt`        DATETIME(3) NULL,
  `resueltaPor`       VARCHAR(150) NULL,
  `motivoRechazo`     TEXT NULL,

  UNIQUE INDEX `deducciones_costo_propio_projectId_numero_key`(`projectId`, `numero`),
  INDEX `deducciones_costo_propio_presupuestoMetaId_estado_idx`(`presupuestoMetaId`, `estado`),
  INDEX `deducciones_costo_propio_metaItemId_estado_idx`(`metaItemId`, `estado`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `deducciones_costo_propio`
  ADD CONSTRAINT `deducciones_costo_propio_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `deducciones_costo_propio`
  ADD CONSTRAINT `deducciones_costo_propio_presupuestoMetaId_fkey`
  FOREIGN KEY (`presupuestoMetaId`) REFERENCES `presupuestos_meta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `deducciones_costo_propio`
  ADD CONSTRAINT `deducciones_costo_propio_metaItemId_fkey`
  FOREIGN KEY (`metaItemId`) REFERENCES `presupuesto_meta_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
