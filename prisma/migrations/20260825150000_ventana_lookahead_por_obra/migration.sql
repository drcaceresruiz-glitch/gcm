-- La ventana del Lookahead deja de vivir solo en la URL.
--
-- El Last Planner no fija un numero de semanas: tres es el minimo util y lo
-- habitual son cuatro a seis, pero depende de los plazos de entrega de la obra
-- —una con acero importado necesita mirar mas lejos que una de acabados—.
-- Hasta hoy se elegia en el desplegable, viajaba en `?semanas=` y se perdia al
-- salir de la pantalla: cada persona que entraba volvia a ver tres semanas y
-- tenia que volver a ampliarla.
--
-- NULL a proposito, y no un DEFAULT 3: «esta obra no ha elegido» y «esta obra
-- eligio tres» no son lo mismo. Con un default no se podria cambiar nunca el
-- valor recomendado sin pisar la eleccion de quien de verdad quiso tres.

ALTER TABLE `projects`
  ADD COLUMN `semanasLookahead` INTEGER NULL;
