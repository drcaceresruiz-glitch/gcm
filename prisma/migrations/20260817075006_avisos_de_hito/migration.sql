/*
  DOS EVENTOS DE AVISO NUEVOS: los hitos.

  Hasta hoy los cuatro eventos eran todos del Lookahead: una restriccion que se
  abre, que hay que recordar, que quedo lista, y el repaso del dia. Los hitos
  se veian en una tabla y no avisaban a nadie, por ningun canal.

  HITO_CERCA suena UNA VEZ, al entrar en la ventana de antelacion del hito.
  HITO_VENCIDO insiste cada `diasRecordatorio` dias mientras siga sin cumplirse
  —el mismo ajuste que ya gobierna el recordatorio de restricciones, para no
  inventar uno nuevo que nadie sabria que existe—.

  SOLO AMPLIA DOS ENUM. No toca ni una fila: los valores que ya estan siguen
  donde estaban y en el mismo orden, que es lo que MySQL exige para no
  reescribir la tabla. Se puede aplicar con la obra en marcha.

  Ojo si alguna vez hay que revertir: quitar un valor de un ENUM con filas que
  lo usan las convierte en cadena vacia SIN avisar. Antes de revertir hay que
  borrar los avisos y envios de estos dos eventos.
*/

-- AlterTable
ALTER TABLE `avisos` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO') NOT NULL;

-- AlterTable
ALTER TABLE `envios_aviso` MODIFY `evento` ENUM('ABRIR', 'RECORDAR', 'LISTA', 'RESUMEN', 'HITO_CERCA', 'HITO_VENCIDO') NOT NULL;
