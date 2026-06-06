import pymysql

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'your-password'
}

def init_db():
    # 1. Connect without database to create it
    conn = pymysql.connect(**DB_CONFIG)
    cursor = conn.cursor()
    
    print("Creating database hotel_db if not exists...")
    cursor.execute("CREATE DATABASE IF NOT EXISTS hotel_db;")
    cursor.execute("USE hotel_db;")
    conn.commit()
    conn.close()

    # 2. Connect with database
    DB_CONFIG_WITH_DB = DB_CONFIG.copy()
    DB_CONFIG_WITH_DB['database'] = 'hotel_db'
    
    # We enable multi-statements to allow dropping/creating triggers easily
    conn = pymysql.connect(
        **DB_CONFIG_WITH_DB,
        client_flag=pymysql.constants.CLIENT.MULTI_STATEMENTS
    )
    cursor = conn.cursor()

    print("Dropping existing triggers...")
    cursor.execute("DROP TRIGGER IF EXISTS trg_create_billing_after_booking;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_update_billing_after_service;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_checkin_room_occupied;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_checkout_room_cleaning;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_room_cleaning_started;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_housekeeping_completed;")
    cursor.execute("DROP TRIGGER IF EXISTS trg_booking_insert_room_occupied;")

    print("Dropping existing tables...")
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0;")
    cursor.execute("DROP TABLE IF EXISTS HousekeepingLog;")
    cursor.execute("DROP TABLE IF EXISTS Billing;")
    cursor.execute("DROP TABLE IF EXISTS BookingServices;")
    cursor.execute("DROP TABLE IF EXISTS Services;")
    cursor.execute("DROP TABLE IF EXISTS Bookings;")
    cursor.execute("DROP TABLE IF EXISTS Rooms;")
    cursor.execute("DROP TABLE IF EXISTS Guests;")
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1;")

    print("Creating tables...")
    
    # Guests Table
    cursor.execute('''
    CREATE TABLE Guests (
        guest_id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')

    # Rooms Table
    cursor.execute('''
    CREATE TABLE Rooms (
        room_id INT AUTO_INCREMENT PRIMARY KEY,
        room_number VARCHAR(10) NOT NULL UNIQUE,
        room_type VARCHAR(50) NOT NULL,
        price_per_night DECIMAL(10, 2) NOT NULL,
        status ENUM('Available', 'Occupied', 'Cleaning', 'Maintenance') DEFAULT 'Available'
    );
    ''')

    # Bookings Table
    cursor.execute('''
    CREATE TABLE Bookings (
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
    ''')

    # Services Table
    cursor.execute('''
    CREATE TABLE Services (
        service_id INT AUTO_INCREMENT PRIMARY KEY,
        service_name VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL
    );
    ''')

    # BookingServices Table
    cursor.execute('''
    CREATE TABLE BookingServices (
        booking_service_id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT NOT NULL,
        service_id INT NOT NULL,
        quantity INT DEFAULT 1,
        service_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES Bookings(booking_id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES Services(service_id) ON DELETE CASCADE
    );
    ''')

    # Billing Table
    cursor.execute('''
    CREATE TABLE Billing (
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
    ''')

    # HousekeepingLog Table
    cursor.execute('''
    CREATE TABLE HousekeepingLog (
        log_id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        status ENUM('Pending', 'In Progress', 'Completed') DEFAULT 'Pending',
        assigned_cleaner VARCHAR(100) DEFAULT NULL,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP NULL,
        FOREIGN KEY (room_id) REFERENCES Rooms(room_id) ON DELETE CASCADE
    );
    ''')

    print("Creating triggers...")

    # Trigger 1: Auto-initiate billing on Booking creation
    cursor.execute('''
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
    ''')

    # Trigger 2: Update billing total on BookingService creation
    cursor.execute('''
    CREATE TRIGGER trg_update_billing_after_service
    AFTER INSERT ON BookingServices
    FOR EACH ROW
    BEGIN
        UPDATE Billing
        SET total_service_charges = total_service_charges + (SELECT price * NEW.quantity FROM Services WHERE service_id = NEW.service_id),
            total_amount = total_amount + (SELECT price * NEW.quantity FROM Services WHERE service_id = NEW.service_id)
        WHERE booking_id = NEW.booking_id;
    END;
    ''')

    # Trigger 3: Room Status -> Occupied on Booking status -> Checked-In
    cursor.execute('''
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
    ''')

    # Trigger 3b: Room Status -> Occupied on Booking creation if Checked-In
    cursor.execute('''
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
    ''')

    # Trigger 4: Room Status -> Cleaning on Booking status -> Checked-Out
    cursor.execute('''
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
    ''')

    # Trigger 5: Auto-insert housekeeping log when Room status -> Cleaning
    cursor.execute('''
    CREATE TRIGGER trg_room_cleaning_started
    AFTER UPDATE ON Rooms
    FOR EACH ROW
    BEGIN
        IF NEW.status = 'Cleaning' AND OLD.status != 'Cleaning' THEN
            INSERT INTO HousekeepingLog (room_id, status, start_time)
            VALUES (NEW.room_id, 'Pending', NOW());
        END IF;
    END;
    ''')

    # Trigger 6: Room Status -> Available on Housekeeping task status -> Completed
    cursor.execute('''
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
    ''')

    print("Seeding data...")

    # Rooms seed
    cursor.executemany('''
        INSERT INTO Rooms (room_number, room_type, price_per_night, status) 
        VALUES (%s, %s, %s, %s)
    ''', [
        ('101', 'Single', 5000.00, 'Available'),
        ('102', 'Double', 8500.00, 'Available'),
        ('103', 'Single', 5000.00, 'Available'),
        ('201', 'Suite', 15000.00, 'Available'),
        ('202', 'Suite', 15000.00, 'Available'),
        ('203', 'Double', 8500.00, 'Available'),
        ('301', 'Presidential Suite', 35000.00, 'Available')
    ])

    # Services seed
    cursor.executemany('''
        INSERT INTO Services (service_name, price) 
        VALUES (%s, %s)
    ''', [
        ('Room Service - Breakfast', 1500.00),
        ('Room Service - Dinner', 3500.00),
        ('Spa Treatment', 8000.00),
        ('Laundry Service', 1000.00),
        ('Airport Shuttle', 2500.00)
    ])

    # Guests seed
    cursor.executemany('''
        INSERT INTO Guests (first_name, last_name, email, phone, address)
        VALUES (%s, %s, %s, %s, %s)
    ''', [
        ('Muhammad', 'Ali', 'muhammad.ali@example.com', '+923001234567', 'House 12-A, Gulberg III, Lahore'),
        ('Fatima', 'Zahra', 'fatima.zahra@example.com', '+923129876543', 'Flat 402, Phase 6, DHA, Karachi'),
        ('Zainab', 'Siddiqui', 'zainab.siddiqui@example.com', '+923214567890', 'Sector F-7/2, Islamabad')
    ])

    # Now we insert bookings, which will trigger Billing entries automatically!
    # Wait, we need the guest_ids and room_ids. Let's select them.
    cursor.execute("SELECT guest_id FROM Guests ORDER BY guest_id ASC")
    guests = [r[0] for r in cursor.fetchall()]
    
    cursor.execute("SELECT room_id, room_number FROM Rooms")
    rooms = {r[1]: r[0] for r in cursor.fetchall()}

    # Bookings seed
    # Booking 1: Checked-In (Muhammad Ali in Suite 201)
    cursor.execute('''
        INSERT INTO Bookings (guest_id, room_id, check_in_date, check_out_date, status)
        VALUES (%s, %s, CURDATE() - INTERVAL 2 DAY, CURDATE() + INTERVAL 3 DAY, 'Checked-In')
    ''', (guests[0], rooms['201']))
    booking1_id = cursor.lastrowid
    
    # Booking 2: Checked-Out (Fatima Zahra in Suite 202, Checked out 1 day ago. This will set room to Cleaning and create a Housekeeping log)
    cursor.execute('''
        INSERT INTO Bookings (guest_id, room_id, check_in_date, check_out_date, status)
        VALUES (%s, %s, CURDATE() - INTERVAL 5 DAY, CURDATE() - INTERVAL 1 DAY, 'Checked-In')
    ''', (guests[1], rooms['202']))
    booking2_id = cursor.lastrowid
    
    # Update Booking 2 status to Checked-Out to trigger cleaning lifecycle!
    cursor.execute('''
        UPDATE Bookings SET status = 'Checked-Out' WHERE booking_id = %s
    ''', (booking2_id,))
 
    # Booking 3: Confirmed booking (Zainab Siddiqui in Double 102)
    cursor.execute('''
        INSERT INTO Bookings (guest_id, room_id, check_in_date, check_out_date, status)
        VALUES (%s, %s, CURDATE() + INTERVAL 1 DAY, CURDATE() + INTERVAL 4 DAY, 'Confirmed')
    ''', (guests[2], rooms['102']))
    booking3_id = cursor.lastrowid
 
    # Add services for Muhammad Ali (Booking 1)
    # This will trigger Billing updates automatically!
    cursor.execute("SELECT service_id FROM Services WHERE service_name = 'Room Service - Breakfast'")
    breakfast_id = cursor.fetchone()[0]
    cursor.execute("SELECT service_id FROM Services WHERE service_name = 'Spa Treatment'")
    spa_id = cursor.fetchone()[0]

    cursor.execute('''
        INSERT INTO BookingServices (booking_id, service_id, quantity)
        VALUES (%s, %s, 2)
    ''', (booking1_id, breakfast_id))

    cursor.execute('''
        INSERT INTO BookingServices (booking_id, service_id, quantity)
        VALUES (%s, %s, 1)
    ''', (booking1_id, spa_id))

    # Wait, we need to make sure the room status for 201 is 'Occupied' since Booking 1 is Checked-In.
    # The trg_checkin_room_occupied trigger ran on INSERT of Bookings? No, it runs AFTER UPDATE.
    # Let's run an UPDATE on Booking 1 to trigger it, or manually update Room status, or let the trigger run.
    # Ah, the trigger is AFTER UPDATE, not AFTER INSERT. So let's run an update.
    cursor.execute("UPDATE Bookings SET status = 'Checked-In' WHERE booking_id = %s", (booking1_id,))

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("MySQL database initialized successfully!")
