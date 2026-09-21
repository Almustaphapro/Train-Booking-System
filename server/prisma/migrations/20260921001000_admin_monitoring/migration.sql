CREATE INDEX `Booking_createdAt_idx` ON `Booking` (`createdAt`);
CREATE INDEX `Payment_status_paidAt_idx` ON `Payment` (`status`, `paidAt`);
CREATE INDEX `FraudAlert_createdAt_idx` ON `FraudAlert` (`createdAt`);
CREATE INDEX `AuditLog_entityType_entityId_createdAt_idx` ON `AuditLog` (`entityType`, `entityId`, `createdAt`);
