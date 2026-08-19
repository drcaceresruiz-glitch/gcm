-- Por que fallo la ultima lectura del buzon, y cuando.
--
-- Sin esto, un buzon que GCM no puede leer —contrasena cambiada, servidor de
-- entrada distinto, cuenta caida— se ve igual que un buzon donde nadie ha
-- contestado: el fallo se quedaba en la consola del servidor y la pantalla
-- seguia diciendo «recogiendo».
--
-- Va aparte de `ultimoError`, que es el del ENVIO: son dos caminos distintos
-- (465 y 993) y uno puede llevar semanas roto con el otro perfecto.
--
-- ADITIVO: dos columnas nuevas y nulas. Ninguna fila existente se toca.

-- AlterTable
ALTER TABLE `remitentes_correo` ADD COLUMN `lecturaError` VARCHAR(300) NULL,
    ADD COLUMN `lecturaErrorAt` DATETIME(3) NULL;
