-- Adicionales y deductivos pactados con el contratista despues de firmar.
--
-- Hasta ahora la unica forma de registrarlos era editar `montoContratado`,
-- lo que borraba lo pactado y ademas revaluaba hacia atras lo ya valorizado.

CREATE TABLE `adendas_encargo` (
  `id`            VARCHAR(191) NOT NULL,
  `encargoId`     VARCHAR(191) NOT NULL,
  `projectId`     VARCHAR(191) NOT NULL,
  `numero`        INTEGER NOT NULL,
  `fecha`         DATE NOT NULL,
  -- Con signo: positivo es un adicional, negativo un deductivo.
  `importe`       DECIMAL(14, 2) NOT NULL,
  `concepto`      VARCHAR(300) NOT NULL,
  `motivo`        TEXT NOT NULL,
  `referencia`    VARCHAR(120) NULL,
  `estado`        ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
  `registradaPor` VARCHAR(150) NOT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,
  `resueltaAt`    DATETIME(3) NULL,
  `resueltaPor`   VARCHAR(150) NULL,
  `motivoRechazo` TEXT NULL,

  UNIQUE INDEX `adendas_encargo_encargoId_numero_key`(`encargoId`, `numero`),
  INDEX `adendas_encargo_projectId_estado_idx`(`projectId`, `estado`),
  INDEX `adendas_encargo_encargoId_estado_idx`(`encargoId`, `estado`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `adendas_encargo`
  ADD CONSTRAINT `adendas_encargo_encargoId_fkey`
  FOREIGN KEY (`encargoId`) REFERENCES `encargos_proveedor`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `adendas_encargo`
  ADD CONSTRAINT `adendas_encargo_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Lo que el porcentaje valia EL DIA DEL CORTE.
--
-- Nace NULL a proposito: las valorizaciones anteriores a esta columna no
-- saben lo que valian, y rellenarlas con el calculo de hoy seria inventarse
-- un dato historico. Quien las lea cae al calculo antiguo; las nuevas lo
-- escriben siempre.
ALTER TABLE `valorizaciones_encargo`
  ADD COLUMN `importe` DECIMAL(14, 2) NULL;
