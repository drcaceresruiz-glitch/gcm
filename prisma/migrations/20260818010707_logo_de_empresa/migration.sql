-- AlterTable
ALTER TABLE `companies` ADD COLUMN `logoHash` VARCHAR(64) NULL,
    ADD COLUMN `logoMime` VARCHAR(100) NULL,
    ADD COLUMN `logoRuta` VARCHAR(255) NULL;
