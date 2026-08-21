-- La cascada comercial del presupuesto que se entrega al cliente.
--
-- POR QUE: decision del usuario el 20/08/2026. El orden cambia respecto del
-- que habia: los gastos generales y la utilidad se calculan sobre el COSTO
-- DIRECTO, y el descuento comercial se resta DESPUES, sobre el subtotal. Asi
-- el descuento sale entero del bolsillo de la constructora en vez de arrastrar
-- hacia abajo tambien la utilidad.
--
-- Y se anaden las dos formas de presentar la retencion de cuarta categoria,
-- para las constructoras que emiten recibo por honorarios: descontada al final
-- (el precio no cambia y se ve lo que queda limpio) o asumida (el precio sube
-- para que, tras retener, quede lo pactado).
--
-- POR QUE `versionCascada` Y NO CAMBIAR LA CUENTA A SECAS: las revisiones ya
-- aprobadas guardan su `montoTotal` calculado con el orden viejo. Cambiar la
-- formula haria que un contrato firmado contradijera su propio total, y eso no
-- da ningun error: da una cifra creible y equivocada. Las filas existentes se
-- quedan en 1 por el DEFAULT y siguen calculando como siempre.
--
-- SE REUTILIZA `TipoImpuesto`, el enum de las ordenes de compra. Es el mismo
-- hecho tributario visto desde el otro lado: alli es lo que se paga a un
-- proveedor, aqui lo que se cobra a un cliente. Dos vocabularios para lo mismo
-- es como acaban divergiendo.
--
-- SEGURA POR CONSTRUCCION: solo columnas nuevas, todas con DEFAULT. Ninguna
-- fila existente cambia de valor ni de comportamiento, y no hay backfill.

ALTER TABLE `baselines`
  ADD COLUMN `porcentajeDescuento` DECIMAL(6, 4) NOT NULL DEFAULT 0,
  ADD COLUMN `tipoImpuesto` ENUM('IGV', 'RENTA', 'NINGUNO') NOT NULL DEFAULT 'IGV',
  ADD COLUMN `porcentajeRetencion` DECIMAL(6, 4) NOT NULL DEFAULT 0.08,
  ADD COLUMN `retencionAsumida` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `versionCascada` INT NOT NULL DEFAULT 1;
