/*
  El analisis de causa raiz: por que se repite una causa y que se va a hacer.

  Tabla nueva y nada mas: no toca ninguna existente, asi que no hay dato que
  migrar ni riesgo de perder nada. El cierre semanal sigue funcionando igual
  el segundo antes y el segundo despues.

  Cuelga del par (obra, causa) y no del compromiso que fallo, porque la raiz
  es del patron y no del fallo suelto. El razonamiento largo esta en el
  comentario del modelo, en schema.prisma.

  Sin unicidad por (projectId, causa) a proposito: un patron puede volver
  meses despues con otra raiz, y conservar lo que se intento vale mas que la
  limpieza. Que solo haya UNO abierto a la vez lo cuida el servicio, porque
  MariaDB no admite indices unicos parciales —el mismo motivo por el que la
  linea base del cronograma se garantiza desde el codigo—.
*/

CREATE TABLE `analisis_causa` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `causa` ENUM('PRERREQUISITO', 'MATERIALES', 'MANO_OBRA', 'EQUIPOS', 'INFORMACION', 'CLIENTE_TERCEROS', 'CLIMA', 'REPROGRAMACION', 'OTRA') NOT NULL,
    `porQue` TEXT NOT NULL,
    `accion` TEXT NOT NULL,
    `responsableUserId` VARCHAR(191) NULL,
    `fechaCompromiso` DATE NULL,
    `cerradoAt` DATETIME(3) NULL,
    `cerradoPor` VARCHAR(150) NULL,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `analisis_causa_projectId_causa_idx`(`projectId`, `causa`),
    INDEX `analisis_causa_projectId_cerradoAt_idx`(`projectId`, `cerradoAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Cascade: borrar una obra se lleva su analisis, que no significa nada fuera
-- de ella.
ALTER TABLE `analisis_causa` ADD CONSTRAINT `analisis_causa_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull: dar de baja a alguien no puede borrar el analisis del que se hizo
-- cargo. `creadoPor` guarda ademas el nombre como texto, que sobrevive a todo.
ALTER TABLE `analisis_causa` ADD CONSTRAINT `analisis_causa_responsableUserId_fkey`
    FOREIGN KEY (`responsableUserId`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
