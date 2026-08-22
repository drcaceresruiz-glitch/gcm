-- AddForeignKey
ALTER TABLE `adjuntos_nota` ADD CONSTRAINT `adjuntos_nota_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
