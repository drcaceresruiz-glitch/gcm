-- Cuando EMPIEZA una semana del plan semanal.
--
-- Nullable y sin backfill a proposito: null significa <<los siete dias hacia
-- atras desde el corte>>, que es lo que valen todas las semanas que ya
-- existen. Ninguna fila cambia de significado al aplicar esto.
ALTER TABLE `planes_semanales` ADD COLUMN `fechaInicio` DATE NULL;
