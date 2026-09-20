-- A cross-table issuance rule needs a trigger, rather than a CHECK constraint.
-- Later payment services must still confirm payment and issue tickets atomically.
CREATE TRIGGER `ticket_requires_confirmed_paid_booking`
BEFORE INSERT ON `Ticket` FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM `Booking` b
    WHERE b.`id` = NEW.`bookingId`
      AND b.`bookingStatus` = 'CONFIRMED' AND b.`paymentStatus` = 'PAID'
      AND EXISTS (
        SELECT 1 FROM `Payment` p WHERE p.`bookingId` = b.`id`
          AND p.`status` = 'PAID' AND p.`amount` = b.`amount` AND p.`currency` = b.`currency`
      )
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket requires a confirmed booking with successful payment';
  END IF;
END;

CREATE TRIGGER `ticket_booking_is_immutable`
BEFORE UPDATE ON `Ticket` FOR EACH ROW
BEGIN
  IF NEW.`bookingId` <> OLD.`bookingId` THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A ticket cannot be reassigned to another booking';
  END IF;
END;
