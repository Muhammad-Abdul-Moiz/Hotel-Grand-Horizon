HOTEL ROOM BOOKING AND BILLING SYSTEM — Grand Horizon


A professional, enterprise-grade Hotel Property Management System (PMS)
dashboard built with a Python (Flask) backend, MySQL database, and a clean
SaaS UI frontend.

The system leverages 7 advanced MySQL database triggers to handle stay pricing,
taxes, service additions, guest check-ins, check-outs and housekeeping task
lifecycles entirely at the database layer.

--------------------------------------------------------------------------------
REPOSITORY STRUCTURE
--------------------------------------------------------------------------------

DB/
├── hotel_app/
│   ├── app.py              Flask Backend API Server
│   ├── init_db.py          MySQL Database Initialization & Seeding Script
│   ├── templates/
│   │   └── index.html      Dashboard HTML Structure
│   └── static/
│       ├── style.css       Clean light-themed SaaS CSS Stylesheet
│       └── script.js       Frontend Event Handling & API Bindings
└── hotel_schema.sql        Standalone MySQL Database Schema & Triggers


--------------------------------------------------------------------------------
CORE FEATURES
--------------------------------------------------------------------------------

1. Dashboard Room Grid
   Real-time room status monitoring (Available, Occupied, Cleaning,
   Maintenance) with action buttons and filter tabs.

2. Reservations Directory
   Create guest bookings (Confirmed reservations or immediate Checked-In
   stays). Process Check-ins or Check-outs directly from the table list.

3. Housekeeping Queue
   Monitor rooms needing cleaning, assign tasks to staff, and mark
   cleaning tasks as completed.

4. Itemized Billing Modal
   View itemized invoices showing room rate charges multiplied by stay
   duration, taxes, and timestamps of ordered amenities, with quick pay
   processing.

--------------------------------------------------------------------------------
MYSQL DATABASE TRIGGERS
--------------------------------------------------------------------------------

The system relies on 7 database-level automation triggers:

  trg_create_billing_after_booking   (AFTER INSERT ON Bookings)
    Auto-creates a new Billing invoice and computes room charges
    (nights x price_per_night), guaranteeing a minimum of 1 night.

  trg_update_billing_after_service   (AFTER INSERT ON BookingServices)
    Increments the invoice's service subtotal and grand total dynamically
    when a service is ordered.

  trg_booking_insert_room_occupied   (AFTER INSERT ON Bookings)
    Sets a room's status to Occupied when a new booking is created with
    an immediate check-in.

  trg_checkin_room_occupied          (AFTER UPDATE ON Bookings)
    Updates a room to Occupied when a confirmed reservation checks in.

  trg_checkout_room_cleaning         (AFTER UPDATE ON Bookings)
    Sets a room to Cleaning when booking status changes to Checked-Out.

  trg_room_cleaning_started          (AFTER UPDATE ON Rooms)
    Automatically logs a new housekeeping task (status Pending) when a
    room status transitions to Cleaning.

  trg_housekeeping_completed         (AFTER UPDATE ON HousekeepingLog)
    Automatically resets a room status to Available when the corresponding
    housekeeping task is marked Completed.

--------------------------------------------------------------------------------
LOCAL INSTALLATION & SETUP
--------------------------------------------------------------------------------

STEP 1 — Prerequisites

  Ensure you have Python 3.x and a running MySQL server installed.
  Install the required Python packages:

    pip install flask pymysql

STEP 2 — Configure Database Credentials

  Open hotel_app/app.py and hotel_app/init_db.py and update the DB_CONFIG
  dictionary at the top to match your MySQL server configuration:

    DB_CONFIG = {
        'host':     'localhost',
        'user':     'root',
        'password': 'your_mysql_password',
        'database': 'hotel_db'
    }

STEP 3 — Initialize the Database

  Run the database initialization script to create the hotel_db database,
  establish all tables and triggers, and populate seed data:

    cd hotel_app
    python init_db.py

STEP 4 — Run the Web Application

  Start the Flask development server:

    python app.py

  Open your browser and visit:  http://127.0.0.1:5050

================================================================================
