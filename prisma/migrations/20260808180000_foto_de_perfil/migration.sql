-- Foto de perfil, opcional. Solo anade una columna nullable: no toca datos
-- existentes, asi que es segura de aplicar. La imagen se guarda embebida
-- (data URL) porque aun no hay infraestructura de subida de archivos.

ALTER TABLE `users` ADD COLUMN `fotoPerfil` MEDIUMTEXT NULL;
