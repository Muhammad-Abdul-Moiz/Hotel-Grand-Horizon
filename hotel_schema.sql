-- MySQL Script for Hotel Room Booking and Billing System
-- Database: hotel_db

CREATE DATABASE IF NOT EXISTS hotel_db;
USE hotel_db;

-- --------------------------------------------------------
-- Table Structures
-- --------------------------------------------------------

CREATE TABLE IF NOT EXISTS Guests (
    guest_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Rooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,
    room_number VARCHAR(10) NOT NULL UNIQUE,
    room_type VARCHAR(50) NOT NULL,
    price_per_night DECIMAL(10, 2) NOT NULL,
    status ENUM('Available', 'Occupied', 'Cleaning', 'Maintenance') DEFAULT 'Available'
);

CREATE TABLE IF NOT EXISTS Bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    guest_id INT NOT NULL,
    room_id INT NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    status ENUM('Confirmed', 'Checked-In', 'Checked-Out', 'Cancelled') DEFAULT 'Confirmed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guest_id) REFERENCES Guests(guest_id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Services (
    service_id INT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS BookingServices (
    booking_service_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    service_id INT NOT NULL,
    quantity INT DEFAULT 1,
    service_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES Bookings(booking_id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES Services(service_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS Billing (
    bill_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL UNIQUE,
    total_room_charges DECIMAL(10, 2) DEFAULT 0.00,
    total_service_charges DECIMAL(10, 2) DEFAULT 0.00,
    tax DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    payment_status ENUM('Pending', 'Paid', 'Refunded') DEFAULT 'Pending',
    payment_date DATETIME NULL,
    FOREIGN KEY (booking_id) REFERENCES Bookings(booking_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS HousekeepingLog (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    status ENUM('Pending', 'In Progress', 'Completed') DEFAULT 'Pending',
    assigned_cleaner VARCHAR(100) DEFAULT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
);

-- --------------------------------------------------------
-- Triggers
-- --------------------------------------------------------

DELIMITER //

-- Trigger 1: Auto-create and calculate billing invoice on Booking creation
CREATE TRIGGER trg_create_billing_after_booking
AFTER INSERT ON Bookings
FOR EACH ROW
BEGIN
    INSERT INTO Billing (booking_id, total_room_charges, tax, total_amount, payment_status)
    SELECT 
        NEW.booking_id,
        (r.price_per_night * GREATEST(TIMESTAMPDIFF(DAY, NEW.check_in_date, NEW.check_out_date), 1)),
        (r.price_per_night * GREATEST(TIMESTAMPDIFF(DAY, NEW.check_in_date, NEW.check_out_date), 1) * 0.10),
        (r.price_per_night * GREATEST(TIMESTAMPDIFF(DAY, NEW.check_in_date, NEW.check_out_date), 1) * 1.10),
        'Pending'
    FROM Rooms r
    WHERE r.room_id = NEW.room_id;
END;
//

-- Trigger 2: Auto-update billing total when a service is ordered
CREATE TRIGGER trg_update_billing_after_service
AFTER INSERT ON BookingServices
FOR EACH ROW
BEGIN
    UPDATE Billing
    SET total_service_charges = total_service_charges + (SELECT price * NEW.quantity FROM Services WHERE service_id = NEW.service_id),
        total_amount = total_amount + (SELECT price * NEW.quantity FROM Services WHERE service_id = NEW.service_id)
    WHERE booking_id = NEW.booking_id;
END;
//

-- Trigger 3: Room Status -> Occupied on Booking status -> Checked-In
CREATE TRIGGER trg_checkin_room_occupied
AFTER UPDATE ON Bookings
FOR EACH ROW
BEGIN
    IF NEW.status = 'Checked-In' AND OLD.status != 'Checked-In' THEN
        UPDATE Rooms
        SET status = 'Occupied'
        WHERE room_id = NEW.room_id;
    END IF;
END;
//

-- Trigger 3b: Room Status -> Occupied on Booking creation if Checked-In
CREATE TRIGGER trg_booking_insert_room_occupied
AFTER INSERT ON Bookings
FOR EACH ROW
BEGIN
    IF NEW.status = 'Checked-In' THEN
        UPDATE Rooms
        SET status = 'Occupied'
        WHERE room_id = NEW.room_id;
    END IF;
END;
//

-- Trigger 4: Room Status -> Cleaning on Booking status -> Checked-Out
CREATE TRIGGER trg_checkout_room_cleaning
AFTER UPDATE ON Bookings
FOR EACH ROW
BEGIN
    IF NEW.status = 'Checked-Out' AND OLD.status != 'Checked-Out' THEN
        UPDATE Rooms
        SET status = 'Cleaning'
        WHERE room_id = NEW.room_id;
    END IF;
END;
//

-- Trigger 5: Auto-insert housekeeping log when Room status -> Cleaning
CREATE TRIGGER trg_room_cleaning_started
AFTER UPDATE ON Rooms
FOR EACH ROW
BEGIN
    IF NEW.status = 'Cleaning' AND OLD.status != 'Cleaning' THEN
        INSERT INTO HousekeepingLog (room_id, status, start_time)
        VALUES (NEW.room_id, 'Pending', NOW());
    END IF;
END;
//

-- Trigger 6: Room Status -> Available on Housekeeping task status -> Completed
CREATE TRIGGER trg_housekeeping_completed
AFTER UPDATE ON HousekeepingLog
FOR EACH ROW
BEGIN
    IF NEW.status = 'Completed' AND OLD.status != 'Completed' THEN
        UPDATE Rooms
        SET status = 'Available'
        WHERE room_id = NEW.room_id;
    END IF;
END;
//

DELIMITER ;
