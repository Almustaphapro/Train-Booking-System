ALTER TABLE `FraudAlert`
  ADD COLUMN `dedupeKey` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `FraudAlert_dedupeKey_key` (`dedupeKey`),
  ADD INDEX `FraudAlert_userId_type_createdAt_idx` (`userId`, `type`, `createdAt`);

CREATE INDEX `AuditLog_userId_action_createdAt_idx` ON `AuditLog` (`userId`, `action`, `createdAt`);
