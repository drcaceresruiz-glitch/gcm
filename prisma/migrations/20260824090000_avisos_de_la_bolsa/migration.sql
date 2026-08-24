-- Avisos de la bolsa comprometida de la obra.
--
-- Pedido asi: «deberia haber avisos cuando la bolsa se vea comprometida, se
-- acerca o se pone en negativo, que permita configurar estos avisos. En vez de
-- asumirlo a sabiendas». La bolsa se comia sin que nadie se enterara hasta que
-- ya no habia con que pagar.
--
-- Los dos eventos suenan EN EL CRUCE del umbral, no mientras dure la
-- condicion: ver `lib/aviso-bolsa.ts`.

ALTER TABLE `avisos` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE', 'RESPUESTA_CONTRATISTA', 'NOTA_VENCIDA', 'BOLSA_EN_RIESGO', 'BOLSA_EN_ROJO') NOT NULL;

ALTER TABLE `envios_aviso` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO', 'VALORIZACION_PENDIENTE', 'RESPUESTA_CONTRATISTA', 'NOTA_VENCIDA', 'BOLSA_EN_RIESGO', 'BOLSA_EN_ROJO') NOT NULL;

-- La configuracion: se puede apagar solo este aviso, y se elige a partir de
-- que porcentaje de la bolsa prevista se considera «queda poca».
ALTER TABLE `ajustes_avisos_obra`
  ADD COLUMN `avisoBolsa` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN `umbralBolsaPorcentaje` INTEGER NOT NULL DEFAULT 25;

-- Lo que el reloj RECUERDA. Tabla propia y no dos columnas mas en
-- `ajustes_avisos_obra`, porque la EXISTENCIA de aquella fila significa que la
-- obra configuro los avisos: si el reloj la creara para apuntar el estado de
-- la bolsa, encenderia de rebote los recordatorios de una obra que nunca los
-- pidio.
CREATE TABLE `estado_bolsa_obra` (
  `projectId`     VARCHAR(191) NOT NULL,
  -- "holgada" | "cerca" | "roja".
  `estado`        VARCHAR(12) NOT NULL,
  `comprometida`  DECIMAL(14, 2) NOT NULL,
  `prevista`      DECIMAL(14, 2) NOT NULL,
  `revisadaAt`    DATETIME(3) NOT NULL,
  `avisadoAt`     DATETIME(3) NULL,
  `estadoAvisado` VARCHAR(12) NULL,

  PRIMARY KEY (`projectId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `estado_bolsa_obra`
  ADD CONSTRAINT `estado_bolsa_obra_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
