/*
  El analisis de restricciones pasa a tener responsable y fecha.

  Hasta ahora una restriccion solo sabia decir si estaba resuelta. En Last
  Planner el analisis de restricciones ES una lista de
  *restriccion -> responsable -> fecha en que promete liberarla*; sin esas dos
  columnas no hay proceso de preparacion, hay una casilla que alguien marca.

  Se vio en la primera obra real: el Pareto dio 5 de 5 incumplimientos por
  "Prerrequisito / tarea previa" y no habia forma de saber quien iba a resolver
  aquello ni cuando dijo que lo tendria.

  Cinco columnas NUEVAS y tres indices. No toca ni un dato existente y se puede
  aplicar con la obra en marcha: todo queda NULL, que es exactamente lo que hay
  hoy —ninguna restriccion tiene responsable ni fecha—.

  Las dos claves ajenas van con SET NULL a proposito: dar de baja a alguien no
  puede borrar la traza de que una restriccion estuvo a su nombre.
*/

-- AlterTable
ALTER TABLE `restricciones_tarea` ADD COLUMN `comprometidoAt` DATETIME(3) NULL,
    ADD COLUMN `comprometidoPor` VARCHAR(150) NULL,
    ADD COLUMN `fechaCompromiso` DATE NULL,
    ADD COLUMN `responsableContactoId` VARCHAR(191) NULL,
    ADD COLUMN `responsableUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `restricciones_tarea_fechaCompromiso_resuelta_idx` ON `restricciones_tarea`(`fechaCompromiso`, `resuelta`);

-- CreateIndex
CREATE INDEX `restricciones_tarea_responsableUserId_resuelta_idx` ON `restricciones_tarea`(`responsableUserId`, `resuelta`);

-- CreateIndex
CREATE INDEX `restricciones_tarea_responsableContactoId_idx` ON `restricciones_tarea`(`responsableContactoId`);

-- AddForeignKey
ALTER TABLE `restricciones_tarea` ADD CONSTRAINT `restricciones_tarea_responsableUserId_fkey` FOREIGN KEY (`responsableUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `restricciones_tarea` ADD CONSTRAINT `restricciones_tarea_responsableContactoId_fkey` FOREIGN KEY (`responsableContactoId`) REFERENCES `contactos_aviso`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
