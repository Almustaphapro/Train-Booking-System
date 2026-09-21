ALTER TABLE `Payment`
  ADD COLUMN `provider` VARCHAR(30) NULL,
  ADD COLUMN `idempotencyKey` VARCHAR(36) NULL,
  ADD COLUMN `demoOutcome` VARCHAR(10) NULL,
  ADD COLUMN `readyAt` DATETIME(3) NULL,
  ADD COLUMN `failureReason` VARCHAR(255) NULL,
  ADD UNIQUE INDEX `Payment_idempotencyKey_key` (`idempotencyKey`);

ALTER TABLE `Payment` ADD CONSTRAINT `demo_payment_intent`
  CHECK (`provider` IS NULL OR `provider` <> 'DEMO' OR
    (`isDemo` = TRUE AND `idempotencyKey` IS NOT NULL AND `readyAt` IS NOT NULL
     AND `demoOutcome` IS NOT NULL AND `demoOutcome` IN ('SUCCESS', 'FAILURE')));
