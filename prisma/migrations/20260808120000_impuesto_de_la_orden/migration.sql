-- Escrita a mano. Prisma traducia el renombrado de `igv` a `impuesto` como
-- DROP + ADD, y eso habria borrado los importes de las ordenes ya cargadas.
-- `RENAME COLUMN` conserva los datos y existe desde MariaDB 10.5.

ALTER TABLE `ordenes_compra` RENAME COLUMN `igv` TO `impuesto`;

-- Que impuesto lleva cada orden. Las ya cargadas son de IGV, que ademas es
-- el caso corriente, asi que el valor por defecto las deja correctas sin
-- tener que tocarlas.
ALTER TABLE `ordenes_compra`
  ADD COLUMN `tipoImpuesto` ENUM('IGV', 'RENTA', 'NINGUNO') NOT NULL DEFAULT 'IGV';

-- El mismo dato en el proveedor, que es de donde lo hereda cada orden nueva:
-- quien factura factura siempre, y quien emite recibo por honorarios tambien.
ALTER TABLE `proveedores`
  ADD COLUMN `tipoImpuesto` ENUM('IGV', 'RENTA', 'NINGUNO') NOT NULL DEFAULT 'IGV';
