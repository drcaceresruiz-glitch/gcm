-- Verificacion en dos pasos por codigo al correo, opcional por usuario.
--
-- No toca datos existentes: la columna nace en 0 (apagada) para todos, asi
-- que nadie se queda fuera al desplegar. Cada persona la enciende cuando
-- quiere desde su perfil.

ALTER TABLE `users`
  ADD COLUMN `dosFactoresActivo` BOOLEAN NOT NULL DEFAULT false;

-- El desafio que vive entre acertar la clave y terminar de entrar.
CREATE TABLE `codigos_acceso` (
  `id`         VARCHAR(191) NOT NULL,
  `userId`     VARCHAR(191) NOT NULL,
  `tokenHash`  CHAR(64)     NOT NULL,
  `codigoHash` CHAR(64)     NOT NULL,
  `intentos`   INTEGER      NOT NULL DEFAULT 0,
  `expiresAt`  DATETIME(3)  NOT NULL,
  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `codigos_acceso_tokenHash_key`(`tokenHash`),
  INDEX `codigos_acceso_userId_idx`(`userId`),
  INDEX `codigos_acceso_expiresAt_idx`(`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `codigos_acceso`
  ADD CONSTRAINT `codigos_acceso_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
