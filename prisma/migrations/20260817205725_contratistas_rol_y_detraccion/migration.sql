-- AlterTable
ALTER TABLE `proveedores` ADD COLUMN `cuentaDetraccion` VARCHAR(40) NULL,
    ADD COLUMN `rol` ENUM('PROVEEDOR', 'CONTRATISTA', 'AMBOS') NOT NULL DEFAULT 'PROVEEDOR';

-- CreateIndex
CREATE INDEX `proveedores_companyId_rol_idx` ON `proveedores`(`companyId`, `rol`);
