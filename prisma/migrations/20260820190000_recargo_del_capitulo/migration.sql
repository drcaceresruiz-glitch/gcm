-- Cada capitulo del presupuesto real guarda su porcentaje de recargo.
--
-- POR QUE: decision del usuario el 20/08/2026 — el presupuesto CONTRACTUAL
-- deja de importarse por su cuenta y pasa a GENERARSE desde el real, que es
-- el que de verdad se cuadro con los contratistas. Cada capitulo se recarga
-- un porcentaje, y la diferencia entre los dos presupuestos es exactamente
-- la bolsa operativa.
--
-- La plantilla del real ya trae la columna "% Recargo" y el importador ya la
-- lee, pero hasta hoy el dato moria en el mapeo de la accion y no llegaba a
-- ninguna tabla. Esta columna es donde aterriza.
--
-- SE GUARDA COMO PORCENTAJE, no como fraccion: 18.000 son 18%. Es lo que se
-- escribe en la plantilla y lo que ensena la hoja de calculo. Guardarlo igual
-- evita el error de cien veces, que en un presupuesto no da error: da una
-- cifra creible y equivocada.
--
-- SEGURA POR CONSTRUCCION: columna nueva, NULL y sin default. Ninguna fila
-- existente cambia, no hay backfill y nada puede fallar por datos. Las metas
-- ya guardadas se quedan sin recargo, que es la verdad: se cargaron cuando la
-- columna todavia no existia.
--
-- Solo tiene sentido en las filas de tipo CAPITULO. No se fuerza con una
-- restriccion porque el importador ya es quien decide —solo lo rellena en
-- capitulos— y una CHECK aqui haria fallar la carga entera por una celda
-- suelta, en vez de avisar.

ALTER TABLE `presupuesto_meta_items`
  ADD COLUMN `porcentajeRecargo` DECIMAL(6, 3) NULL;
