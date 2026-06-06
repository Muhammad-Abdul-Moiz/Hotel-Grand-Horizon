# Hotel Management System

A full-stack Hotel Management System built with **Python Flask**, **MySQL**, and **JavaScript**. Manage rooms, bookings, billing, and housekeeping from a single clean dashboard.

The system uses **7 MySQL database triggers** to automate billing calculations, room status transitions, and housekeeping scheduling entirely at the database layer.

---

## Repository Structure

```
├── hotel_app/
│   ├── app.py              # Flask Backend API Server
│   ├── init_db.py          # MySQL Database Initialization & Seeding Script
│   ├── templates/
│   │   └── index.html      # Dashboard HTML Structure
│   └── static/
│       ├── style.css       # Clean light-themed SaaS CSS Stylesheet
│       └── script.js       # Frontend Event Handling & API Bindings
└── hotel_schema.sql        # Standalone MySQL Database Schema & Triggers

```

---

## Tech Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6)
- **Backend:** Python, Flask, PyMySQL
- **Database:** MySQL

---

## Core Features

1. **Dashboard Room Grid** — Real-time room status monitoring (Available, Occupied, Cleaning, Maintenance) with action buttons and filter tabs.
2. **Reservations Directory** — Create guest bookings (Confirmed reservations or immediate Checked-In stays). Process check-ins and check-outs directly from the table.
3. **Housekeeping Queue** — Monitor rooms needing cleaning, assign tasks to staff, and mark tasks as completed.
4. **Itemized Billing** — View invoices showing room charges, ordered services, taxes, and grand totals with one-click payment processing.

---

## MySQL Database Triggers

| Trigger | Event | Action |
|---|---|---|
| `trg_create_billing_after_booking` | AFTER INSERT ON Bookings | Auto-creates invoice and computes room charges + 10% tax |
| `trg_update_billing_after_service` | AFTER INSERT ON BookingServices | Increments service charges and grand total on invoice |
| `trg_booking_insert_room_occupied` | AFTER INSERT ON Bookings | Sets room to Occupied on immediate walk-in check-in |
| `trg_checkin_room_occupied` | AFTER UPDATE ON Bookings | Sets room to Occupied when confirmed booking checks in |
| `trg_checkout_room_cleaning` | AFTER UPDATE ON Bookings | Sets room to Cleaning on guest checkout |
| `trg_room_cleaning_started` | AFTER UPDATE ON Rooms | Logs a new Pending housekeeping task when room enters Cleaning |
| `trg_housekeeping_completed` | AFTER UPDATE ON HousekeepingLog | Resets room to Available when cleaning is marked Completed |

---

## Setup & Installation

### 1. Prerequisites

Make sure you have **Python 3.x** and a running **MySQL server** installed, then install the required packages:

```bash
pip install flask pymysql
```

### 2. Configure Database Credentials

Open `hotel_app/app.py` and `hotel_app/init_db.py` and update the `DB_CONFIG` with your MySQL credentials:

```python
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'your_mysql_password',
    'database': 'hotel_db'
}
```

### 3. Initialize the Database

Run the initialization script to create the database, tables, triggers, and seed data:

```bash
cd hotel_app
python init_db.py
```

### 4. Run the Application

```bash
python app.py
```

Visit **http://127.0.0.1:5050** in your browser.

