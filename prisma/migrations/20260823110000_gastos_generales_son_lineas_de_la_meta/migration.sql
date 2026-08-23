-- Los gastos generales dejan de ser una tabla aparte.
--
-- Un sueldo, un alquiler o una poliza son ahora items de la meta sin
-- `codigoRef`, con la unidad en «mes» cuando se pagan por mes: un gasto
-- variable es `meses x monto mensual`, que es exactamente
-- `metrado x precioUnitario`. Habia dos listas con dos sumas, y una podia
-- quedarse en cero sin que nada avisara: una meta enseñaba 600 de costo
-- cuando eran 700, con el sueldo del residente escrito en el Excel y
-- valiendo cero en la cuenta.
--
-- NO se migran los datos existentes A PROPOSITO: el unico presupuesto meta
-- cargado se descarta. Si hubiera que recuperar alguno, la lista vieja sigue
-- en `audit_log` (accion CREATE sobre PresupuestoMeta).

-- Nace a cero y se recalcula al guardar; la meta que ya estuviera cargada
-- conserva su costo directo y su costo total tal cual estaban.
ALTER TABLE `presupuestos_meta`
  ADD COLUMN `costoPropio` DECIMAL(14, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE `presupuestos_meta` DROP COLUMN `gastosGenerales`;

DROP TABLE `gastos_generales_meta`;
