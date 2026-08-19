-- Las respuestas de los contratistas, dentro de la obra.
--
-- Todo es ADITIVO: columnas nuevas nulas o con valor por defecto, e indices
-- nuevos. Ninguna fila existente se toca y la migracion no puede perder datos.
--
-- El unico `(companyId, messageIdEntrante)` no choca con lo que ya hay: todas
-- las filas actuales son salientes y tienen esa columna en nulo, y MySQL admite
-- tantos nulos como haga falta en un indice unico.

-- AlterTable
ALTER TABLE `avisos` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE', 'RESPUESTA_CONTRATISTA') NOT NULL;

-- AlterTable
ALTER TABLE `envios_aviso` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE', 'RESPUESTA_CONTRATISTA') NOT NULL;

-- AlterTable
ALTER TABLE `mensajes_contratista` ADD COLUMN `direccion` ENUM('SALIENTE', 'ENTRANTE') NOT NULL DEFAULT 'SALIENTE',
    ADD COLUMN `enRespuestaA` VARCHAR(30) NULL,
    ADD COLUMN `messageIdEntrante` VARCHAR(255) NULL,
    ADD COLUMN `token` VARCHAR(40) NULL,
    ADD COLUMN `userId` VARCHAR(30) NULL;

-- AlterTable
ALTER TABLE `remitentes_correo` ADD COLUMN `leerRespuestas` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `leidoHastaAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `mensajes_contratista_companyId_token_idx` ON `mensajes_contratista`(`companyId`, `token`);

-- CreateIndex
CREATE UNIQUE INDEX `mensajes_contratista_companyId_messageIdEntrante_key` ON `mensajes_contratista`(`companyId`, `messageIdEntrante`);
