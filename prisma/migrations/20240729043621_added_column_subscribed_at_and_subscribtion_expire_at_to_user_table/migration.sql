/*
  Warnings:

  - You are about to drop the column `paid` on the `user` table. All the data in the column will be lost.

*/
-- Drop the column `paid` on the `user` table
ALTER TABLE `user` DROP COLUMN `paid`;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `paid`,
    ADD COLUMN `subscribed_at` DATETIME(3) NULL,
    ADD COLUMN `subscribtion_expire_at` DATETIME(3) NULL;
