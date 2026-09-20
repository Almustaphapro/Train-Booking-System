-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(30) NOT NULL,
    `fullName` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(20) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `role` ENUM('PASSENGER', 'ADMIN', 'TICKET_OFFICER') NOT NULL DEFAULT 'PASSENGER',
    `status` ENUM('ACTIVE', 'SUSPENDED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    INDEX `User_role_status_idx`(`role`, `status`),
    INDEX `User_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Station` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(20) NOT NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(100) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Station_code_key`(`code`),
    INDEX `Station_city_status_idx`(`city`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Route` (
    `id` VARCHAR(30) NOT NULL,
    `originStationId` VARCHAR(30) NOT NULL,
    `destinationStationId` VARCHAR(30) NOT NULL,
    `distanceKm` DECIMAL(8, 2) NOT NULL,
    `estimatedDuration` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Route_destinationStationId_idx`(`destinationStationId`),
    INDEX `Route_status_idx`(`status`),
    UNIQUE INDEX `Route_originStationId_destinationStationId_key`(`originStationId`, `destinationStationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Train` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'MAINTENANCE', 'RETIRED') NOT NULL DEFAULT 'ACTIVE',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Train_code_key`(`code`),
    INDEX `Train_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Seat` (
    `id` VARCHAR(30) NOT NULL,
    `trainId` VARCHAR(30) NOT NULL,
    `seatNumber` VARCHAR(10) NOT NULL,
    `seatClass` ENUM('ECONOMY', 'BUSINESS') NOT NULL,
    `status` ENUM('ACTIVE', 'OUT_OF_SERVICE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Seat_trainId_seatClass_status_idx`(`trainId`, `seatClass`, `status`),
    UNIQUE INDEX `Seat_trainId_seatNumber_key`(`trainId`, `seatNumber`),
    UNIQUE INDEX `Seat_id_trainId_key`(`id`, `trainId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Schedule` (
    `id` VARCHAR(30) NOT NULL,
    `trainId` VARCHAR(30) NOT NULL,
    `routeId` VARCHAR(30) NOT NULL,
    `departureTime` DATETIME(3) NOT NULL,
    `arrivalTime` DATETIME(3) NOT NULL,
    `fareEconomy` DECIMAL(12, 2) NOT NULL,
    `fareBusiness` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'NGN',
    `status` ENUM('SCHEDULED', 'BOARDING', 'DEPARTED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Schedule_routeId_departureTime_status_idx`(`routeId`, `departureTime`, `status`),
    INDEX `Schedule_status_departureTime_idx`(`status`, `departureTime`),
    UNIQUE INDEX `Schedule_trainId_departureTime_key`(`trainId`, `departureTime`),
    UNIQUE INDEX `Schedule_id_trainId_key`(`id`, `trainId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScheduleSeat` (
    `id` VARCHAR(30) NOT NULL,
    `scheduleId` VARCHAR(30) NOT NULL,
    `seatId` VARCHAR(30) NOT NULL,
    `trainId` VARCHAR(30) NOT NULL,
    `status` ENUM('AVAILABLE', 'HELD', 'BOOKED') NOT NULL DEFAULT 'AVAILABLE',
    `heldUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ScheduleSeat_scheduleId_trainId_idx`(`scheduleId`, `trainId`),
    INDEX `ScheduleSeat_seatId_trainId_idx`(`seatId`, `trainId`),
    INDEX `ScheduleSeat_scheduleId_status_idx`(`scheduleId`, `status`),
    INDEX `ScheduleSeat_status_heldUntil_idx`(`status`, `heldUntil`),
    UNIQUE INDEX `ScheduleSeat_scheduleId_seatId_key`(`scheduleId`, `seatId`),
    UNIQUE INDEX `ScheduleSeat_id_scheduleId_key`(`id`, `scheduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(30) NOT NULL,
    `bookingReference` VARCHAR(40) NOT NULL,
    `userId` VARCHAR(30) NOT NULL,
    `scheduleId` VARCHAR(30) NOT NULL,
    `scheduleSeatId` VARCHAR(30) NOT NULL,
    `activeScheduleSeatId` VARCHAR(30) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'NGN',
    `bookingStatus` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `paymentStatus` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Booking_bookingReference_key`(`bookingReference`),
    UNIQUE INDEX `Booking_activeScheduleSeatId_key`(`activeScheduleSeatId`),
    INDEX `Booking_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Booking_scheduleId_bookingStatus_idx`(`scheduleId`, `bookingStatus`),
    INDEX `Booking_scheduleSeatId_scheduleId_idx`(`scheduleSeatId`, `scheduleId`),
    INDEX `Booking_bookingStatus_createdAt_idx`(`bookingStatus`, `createdAt`),
    INDEX `Booking_paymentStatus_createdAt_idx`(`paymentStatus`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(30) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
    `transactionReference` VARCHAR(60) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'NGN',
    `paymentMethod` ENUM('CARD', 'BANK_TRANSFER', 'USSD') NOT NULL,
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Payment_transactionReference_key`(`transactionReference`),
    INDEX `Payment_bookingId_status_idx`(`bookingId`, `status`),
    INDEX `Payment_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` VARCHAR(30) NOT NULL,
    `bookingId` VARCHAR(30) NOT NULL,
    `ticketNumber` VARCHAR(40) NOT NULL,
    `qrToken` VARCHAR(64) NOT NULL,
    `status` ENUM('VALID', 'USED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'VALID',
    `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Ticket_bookingId_key`(`bookingId`),
    UNIQUE INDEX `Ticket_ticketNumber_key`(`ticketNumber`),
    UNIQUE INDEX `Ticket_qrToken_key`(`qrToken`),
    INDEX `Ticket_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketScanLog` (
    `id` VARCHAR(30) NOT NULL,
    `ticketId` VARCHAR(30) NULL,
    `officerId` VARCHAR(30) NOT NULL,
    `result` ENUM('VALID', 'BOARDED', 'ALREADY_USED', 'INVALID', 'EXPIRED', 'CANCELLED', 'REJECTED') NOT NULL,
    `reason` VARCHAR(500) NULL,
    `tokenFingerprint` CHAR(64) NULL,
    `ipAddress` VARCHAR(45) NULL,
    `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketScanLog_ticketId_scannedAt_idx`(`ticketId`, `scannedAt`),
    INDEX `TicketScanLog_officerId_scannedAt_idx`(`officerId`, `scannedAt`),
    INDEX `TicketScanLog_result_scannedAt_idx`(`result`, `scannedAt`),
    INDEX `TicketScanLog_tokenFingerprint_scannedAt_idx`(`tokenFingerprint`, `scannedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FraudAlert` (
    `id` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NULL,
    `bookingId` VARCHAR(30) NULL,
    `ticketId` VARCHAR(30) NULL,
    `type` ENUM('DUPLICATE_TICKET_USE', 'REPEATED_INVALID_SCANS', 'EXCESSIVE_BOOKING_ATTEMPTS', 'HIGH_CANCELLATION_RATE', 'REPEATED_PAYMENT_FAILURES', 'EXCESSIVE_RESERVATIONS', 'ANOMALY_SCORE') NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `description` TEXT NOT NULL,
    `features` JSON NULL,
    `status` ENUM('NEW', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED') NOT NULL DEFAULT 'NEW',
    `reviewedAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(30) NULL,
    `reviewNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FraudAlert_status_severity_createdAt_idx`(`status`, `severity`, `createdAt`),
    INDEX `FraudAlert_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `FraudAlert_bookingId_idx`(`bookingId`),
    INDEX `FraudAlert_ticketId_idx`(`ticketId`),
    INDEX `FraudAlert_reviewedBy_idx`(`reviewedBy`),
    INDEX `FraudAlert_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(30) NOT NULL,
    `userId` VARCHAR(30) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entityType` VARCHAR(50) NOT NULL,
    `entityId` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `ipAddress` VARCHAR(45) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Route` ADD CONSTRAINT `Route_originStationId_fkey` FOREIGN KEY (`originStationId`) REFERENCES `Station`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Route` ADD CONSTRAINT `Route_destinationStationId_fkey` FOREIGN KEY (`destinationStationId`) REFERENCES `Station`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Seat` ADD CONSTRAINT `Seat_trainId_fkey` FOREIGN KEY (`trainId`) REFERENCES `Train`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Schedule` ADD CONSTRAINT `Schedule_trainId_fkey` FOREIGN KEY (`trainId`) REFERENCES `Train`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Schedule` ADD CONSTRAINT `Schedule_routeId_fkey` FOREIGN KEY (`routeId`) REFERENCES `Route`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ScheduleSeat` ADD CONSTRAINT `ScheduleSeat_scheduleId_trainId_fkey` FOREIGN KEY (`scheduleId`, `trainId`) REFERENCES `Schedule`(`id`, `trainId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ScheduleSeat` ADD CONSTRAINT `ScheduleSeat_seatId_trainId_fkey` FOREIGN KEY (`seatId`, `trainId`) REFERENCES `Seat`(`id`, `trainId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_scheduleId_fkey` FOREIGN KEY (`scheduleId`) REFERENCES `Schedule`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_scheduleSeatId_scheduleId_fkey` FOREIGN KEY (`scheduleSeatId`, `scheduleId`) REFERENCES `ScheduleSeat`(`id`, `scheduleId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_activeScheduleSeatId_fkey` FOREIGN KEY (`activeScheduleSeatId`) REFERENCES `ScheduleSeat`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TicketScanLog` ADD CONSTRAINT `TicketScanLog_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TicketScanLog` ADD CONSTRAINT `TicketScanLog_officerId_fkey` FOREIGN KEY (`officerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_reviewedBy_fkey` FOREIGN KEY (`reviewedBy`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
