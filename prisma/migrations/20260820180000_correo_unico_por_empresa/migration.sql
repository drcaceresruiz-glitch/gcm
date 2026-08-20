-- El correo de un usuario pasa a ser unico POR EMPRESA, no en toda la
-- instalacion.
--
-- POR QUE: la misma persona puede trabajar para dos constructoras clientes de
-- GCM —un supervisor externo, un consultor, o el propio operador— y hasta hoy
-- no podia tener cuenta en las dos. Decision del usuario el 20/08/2026:
-- «que las cuentas sean independientes para cada constructora, porque son
-- dueños diferentes».
--
-- SEGURA POR CONSTRUCCION, y conviene verlo antes de aplicarla: se cambia una
-- restriccion ESTRICTA por otra MAS DEBIL. Todo dato que cumplia «unico en
-- toda la tabla» cumple tambien «unico dentro de su empresa», asi que ninguna
-- fila existente puede violar el indice nuevo y la migracion no puede fallar
-- por datos. No hay backfill ni conversion: solo indices.
--
-- LO QUE SI CAMBIA, y no lo arregla ninguna migracion: el login ya no puede
-- resolver un correo a un unico usuario. Eso vive en `auth.service`.

-- El correo deja de ser unico global.
DROP INDEX `users_email_key` ON `users`;

-- Pero se sigue buscando por el: es por donde empieza el login, que ahora
-- recoge CANDIDATOS. Sin este indice, cada intento de acceso seria un
-- recorrido de la tabla entera de usuarios de todas las constructoras.
CREATE INDEX `users_email_idx` ON `users`(`email`);

-- Y dentro de una empresa no se repite: dos cuentas con el mismo correo en la
-- misma constructora serian indistinguibles para quien las gestiona.
CREATE UNIQUE INDEX `users_companyId_email_key` ON `users`(`companyId`, `email`);
