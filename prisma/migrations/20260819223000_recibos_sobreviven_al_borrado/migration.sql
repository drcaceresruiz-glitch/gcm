-- Los recibos de respaldo dejan de morir con la empresa.
--
-- `respaldos_obra.companyId` apuntaba a `companies` con ON DELETE CASCADE, asi
-- que al borrar una constructora se perdian TODOS los recibos de respaldo de
-- sus obras: precisamente la prueba de que se le entrego su informacion antes
-- de destruirla. Una prueba que muere con lo que prueba no prueba nada.
--
-- Se queda la COLUMNA (sigue diciendo de quien era) y se va la clave foranea,
-- igual que en `audit_logs`. Los indices no se tocan.
--
-- NO se pierde ni una fila: quitar una restriccion no borra datos.

-- DropForeignKey
ALTER TABLE `respaldos_obra` DROP FOREIGN KEY `respaldos_obra_companyId_fkey`;
