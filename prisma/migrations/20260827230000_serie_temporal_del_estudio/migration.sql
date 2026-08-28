-- Lo que hace falta para que una serie temporal interrumpida se sostenga:
-- saber DONDE se interrumpe y QUE semanas se vivieron con la herramienta.
--
-- EL PUNTO DE INTERRUPCION VIVE EN LA OBRA, no en un parametro de la
-- exportacion. Si cada descarga pidiera la fecha de corte, la fase de cada
-- dato dependeria de lo que alguien tecleara ese dia: dos exportaciones del
-- mismo estudio podrian clasificar la misma semana en lados distintos y no
-- habria forma de demostrar cual valia. Guardada aqui, la fase es un dato del
-- sistema, se audita y no se puede mover sin dejar rastro.
--
-- NULL significa que la obra no participa en ningun estudio; entonces la
-- exportacion no inventa fases.
ALTER TABLE `projects`
  ADD COLUMN `fechaInterrupcionEstudio` DATE NULL;

-- Y de cada semana, si se GESTIONO con GCM o se RECONSTRUYO despues desde
-- actas, cuaderno de obra o planillas.
--
-- Los datos reconstruidos pueden ser correctos y aun asi no son equivalentes:
-- nadie tenia delante el tablero cuando se tomaron las decisiones de esa
-- semana. Mezclarlos sin marca invalida la comparacion, porque el estudio deja
-- de poder demostrar que semana es de cada lado. El default es GESTIONADO
-- porque todo lo que ya existe se vivio con la aplicacion.
ALTER TABLE `planes_semanales`
  ADD COLUMN `origenDatos` ENUM('GESTIONADO', 'RECONSTRUIDO') NOT NULL DEFAULT 'GESTIONADO';
