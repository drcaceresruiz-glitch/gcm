/*
  HITOS DE OBRA: lo que hay que saber de un hito y no cabe en su tarea.

  Un hito ES una fila del cronograma con `esHito` —el Gantt la dibuja como un
  rombo, sin barra—. Esta tabla guarda lo que esa fila no puede llevar encima:
  tras que partida va, quien responde de que se cumpla, y con cuanta
  antelacion avisar.

  POR QUE UNA TABLA Y NO COLUMNAS EN `tareas_cronograma`. Las versiones del
  cronograma se SUSTITUYEN enteras al importar un corte nuevo. Un responsable
  escrito dentro de la tarea se perderia el siguiente jueves sin que nadie se
  diera cuenta. Se ancla en (projectId, uid) y SIN clave ajena a la tarea, que
  es la misma doctrina que ya siguen `avances_tarea` y `mapeo_tarea_partida`.

  Y el ancla a la partida es el CODIGO, no el id, por lo mismo que en el
  mapeo: reimportar el presupuesto recrea las filas de `wbs_items` con
  identificadores nuevos, y una clave ajena dejaria el ancla rota —o la
  borraria en cascada— cada vez que se corrige el Excel.

  Los dos responsables van con SET NULL: dar de baja a alguien no puede borrar
  la traza de que un hito estuvo a su nombre. Que solo haya uno de los dos con
  valor lo comprueba el servicio; la base no puede.

  UNA TABLA NUEVA Y VACIA. No toca ni un dato existente y se puede aplicar con
  la obra en marcha: sin filas, todo se comporta exactamente como hoy.
*/

-- CreateTable
CREATE TABLE `hitos_obra` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `uid` INTEGER NOT NULL,
    `anclaCodigo` VARCHAR(32) NULL,
    `responsableUserId` VARCHAR(191) NULL,
    `responsableContactoId` VARCHAR(191) NULL,
    `diasAviso` INTEGER NOT NULL DEFAULT 7,
    `creadoPor` VARCHAR(150) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `hitos_obra_projectId_anclaCodigo_idx`(`projectId`, `anclaCodigo`),
    INDEX `hitos_obra_responsableUserId_idx`(`responsableUserId`),
    INDEX `hitos_obra_responsableContactoId_idx`(`responsableContactoId`),
    UNIQUE INDEX `hitos_obra_projectId_uid_key`(`projectId`, `uid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hitos_obra` ADD CONSTRAINT `hitos_obra_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hitos_obra` ADD CONSTRAINT `hitos_obra_responsableUserId_fkey` FOREIGN KEY (`responsableUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hitos_obra` ADD CONSTRAINT `hitos_obra_responsableContactoId_fkey` FOREIGN KEY (`responsableContactoId`) REFERENCES `contactos_aviso`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
