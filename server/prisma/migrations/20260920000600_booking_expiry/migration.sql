ALTER TABLE `Booking` ADD COLUMN `expiresAt` DATETIME(3) NULL;

-- Preserve historical rows; recover the deadline for any existing pending hold.
UPDATE `Booking` b
JOIN `ScheduleSeat` s ON s.id = b.activeScheduleSeatId
SET b.expiresAt = s.heldUntil
WHERE b.bookingStatus = 'PENDING' AND s.status = 'HELD';
