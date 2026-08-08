-- AlterTable
ALTER TABLE `wbs_items` ADD COLUMN `editadaAMano` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `origen` ENUM('MANUAL', 'IMPORTADO') NOT NULL DEFAULT 'MANUAL';

-- Las partidas que ya existian se marcan como IMPORTADO, no como MANUAL.
--
-- El valor por defecto de la columna es MANUAL porque es el conservador para
-- una fila que se cree sin decir de donde viene. Pero aplicarselo tambien a
-- las que ya estaban seria mentir sobre las 360 de CRIOCORD, que entraron por
-- el importador de Excel, y ademas dejaria la funcion inutil desde el primer
-- dia: el aviso de reemplazo marcaria el presupuesto entero como "en riesgo",
-- y un aviso que senala todo no senala nada.
--
-- `editadaAMano` se queda en false: no hay forma de saber a posteriori quien
-- toco que antes de que existiera esta columna. A partir de aqui si se sabe.
UPDATE `wbs_items` SET `origen` = 'IMPORTADO';
