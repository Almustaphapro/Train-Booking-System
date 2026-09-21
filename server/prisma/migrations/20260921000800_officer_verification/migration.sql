-- Preserve previous logs; new officer verifications bind to a selected schedule.
ALTER TABLE `TicketScanLog`
  ADD COLUMN `scheduleId` VARCHAR(30) NULL,
  ADD INDEX `TicketScanLog_scheduleId_scannedAt_idx` (`scheduleId`, `scannedAt`),
  ADD CONSTRAINT `TicketScanLog_scheduleId_fkey` FOREIGN KEY (`scheduleId`)
    REFERENCES `Schedule` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
