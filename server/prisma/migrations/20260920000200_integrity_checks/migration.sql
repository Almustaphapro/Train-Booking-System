-- MySQL 8.4 enforces these CHECK constraints. Keep this migration: Prisma schema
-- syntax cannot represent CHECK constraints or triggers. Do not replace with db push.
ALTER TABLE `Route`
  ADD CONSTRAINT `route_distinct_stations` CHECK (`originStationId` <> `destinationStationId`),
  ADD CONSTRAINT `route_positive_distance` CHECK (`distanceKm` > 0),
  ADD CONSTRAINT `route_positive_duration` CHECK (`estimatedDuration` > 0);

ALTER TABLE `Train`
  ADD CONSTRAINT `train_positive_capacity` CHECK (`capacity` > 0);

ALTER TABLE `Schedule`
  ADD CONSTRAINT `schedule_valid_times` CHECK (`arrivalTime` > `departureTime`),
  ADD CONSTRAINT `schedule_nonnegative_fares` CHECK (`fareEconomy` >= 0 AND `fareBusiness` >= 0);

ALTER TABLE `ScheduleSeat`
  ADD CONSTRAINT `schedule_seat_hold_deadline` CHECK (
    (`status` = 'HELD' AND `heldUntil` IS NOT NULL)
    OR (`status` <> 'HELD' AND `heldUntil` IS NULL)
  );

ALTER TABLE `Booking`
  ADD CONSTRAINT `booking_nonnegative_amount` CHECK (`amount` >= 0),
  ADD CONSTRAINT `booking_active_seat_claim` CHECK (
    (`bookingStatus` IN ('PENDING', 'CONFIRMED', 'COMPLETED')
      AND `activeScheduleSeatId` IS NOT NULL AND `activeScheduleSeatId` = `scheduleSeatId`)
    OR (`bookingStatus` IN ('CANCELLED', 'EXPIRED') AND `activeScheduleSeatId` IS NULL)
  );

ALTER TABLE `Payment`
  ADD CONSTRAINT `payment_nonnegative_amount` CHECK (`amount` >= 0),
  ADD CONSTRAINT `payment_paid_timestamp` CHECK (`status` NOT IN ('PAID', 'REFUNDED') OR `paidAt` IS NOT NULL);

ALTER TABLE `Ticket`
  ADD CONSTRAINT `ticket_valid_expiry` CHECK (`expiresAt` > `issuedAt`),
  ADD CONSTRAINT `ticket_used_timestamp` CHECK (`status` <> 'USED' OR `usedAt` IS NOT NULL),
  ADD CONSTRAINT `ticket_token_length` CHECK (CHAR_LENGTH(`qrToken`) = 64);

ALTER TABLE `FraudAlert`
  ADD CONSTRAINT `fraud_score_range` CHECK (`score` BETWEEN 0 AND 100),
  ADD CONSTRAINT `fraud_review_pair` CHECK (
    (`reviewedAt` IS NULL AND `reviewedBy` IS NULL)
    OR (`reviewedAt` IS NOT NULL AND `reviewedBy` IS NOT NULL)
  );

