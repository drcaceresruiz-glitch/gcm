-- Cuando se abrio DE VERDAD un analisis de causa raiz, si no fue el dia en que
-- se escribio la fila.
--
-- `createdAt` y la apertura real son lo mismo mientras la obra registra sobre
-- la marcha. Dejan de serlo al reconstruir un periodo anterior: si hoy se
-- cargan los analisis que el equipo hizo hace tres meses, todos nacen con
-- fecha de hoy, y la latencia de reaccion -cuanto tarda la obra en analizar un
-- patron que se repite- sale inventada para todo ese periodo.
--
-- NULL en el uso normal, y eso es lo que la hace fiable: un campo que hubiera
-- que rellenar siempre acabaria puesto a ojo. Solo se escribe cuando alguien
-- declara expresamente que ese analisis es de otra fecha.

ALTER TABLE `analisis_causa`
  ADD COLUMN `aperturaDeclarada` DATE NULL;
