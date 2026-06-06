from flask import Flask, render_template, request, jsonify
import pymysql
import pymysql.cursors

app = Flask(__name__)

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': 'your_password',
    'database': 'hotel_db',
    'cursorclass': pymysql.cursors.DictCursor
}

def get_db_connection():
    conn = pymysql.connect(**DB_CONFIG)
    return conn

@app.route('/')
def index():
    return render_template('index.html')

# --- API Endpoints ---

# 1. Rooms API
@app.route('/api/rooms', methods=['GET'])
def get_rooms():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Rooms ORDER BY room_number")
        rooms = cursor.fetchall()
        conn.close()
        return jsonify(rooms)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rooms/<int:room_id>/status', methods=['POST'])
def update_room_status(room_id):
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        status = data['status']
        cursor.execute("UPDATE Rooms SET status = %s WHERE room_id = %s", (status, room_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# 2. Bookings API
@app.route('/api/all_bookings', methods=['GET'])
def get_all_bookings():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT b.booking_id, b.room_id, g.first_name, g.last_name, r.room_number, 
                   b.check_in_date, b.check_out_date, b.status 
            FROM Bookings b
            JOIN Guests g ON b.guest_id = g.guest_id
            JOIN Rooms r ON b.room_id = r.room_id
            ORDER BY b.booking_id DESC
        ''')
        bookings = cursor.fetchall()
        conn.close()
        return jsonify(bookings)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bookings', methods=['POST'])
def create_booking():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Validate dates
        from datetime import datetime
        try:
            in_date = datetime.strptime(data['check_in_date'], '%Y-%m-%d')
            out_date = datetime.strptime(data['check_out_date'], '%Y-%m-%d')
            if out_date <= in_date:
                conn.close()
                return jsonify({'error': 'Check-out date must be after check-in date'}), 400
        except (ValueError, KeyError) as date_err:
            conn.close()
            return jsonify({'error': 'Invalid or missing check-in/check-out date'}), 400

        # Validate room status availability
        cursor.execute("SELECT status FROM Rooms WHERE room_id = %s FOR UPDATE", (data['room_id'],))
        room = cursor.fetchone()
        if not room:
            conn.close()
            return jsonify({'error': 'Selected room does not exist'}), 404
        
        status = data.get('status', 'Confirmed')
        if status == 'Checked-In' and room['status'] != 'Available':
            conn.close()
            return jsonify({'error': f"Room is currently {room['status']} and cannot be checked-in immediately"}), 400

        # 1. Insert Guest
        cursor.execute('''
            INSERT INTO Guests (first_name, last_name, email, phone, address) 
            VALUES (%s, %s, %s, %s, %s)
        ''', (data['first_name'], data['last_name'], data['email'], data.get('phone', ''), data.get('address', '')))
        guest_id = cursor.lastrowid
        
        # 2. Insert Booking - Trigger trg_create_billing_after_booking and trg_booking_insert_room_occupied will fire!
        status = data.get('status', 'Confirmed')
        cursor.execute('''
            INSERT INTO Bookings (guest_id, room_id, check_in_date, check_out_date, status) 
            VALUES (%s, %s, %s, %s, %s)
        ''', (guest_id, data['room_id'], data['check_in_date'], data['check_out_date'], status))
        booking_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'booking_id': booking_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/bookings/<int:booking_id>/checkin', methods=['POST'])
def checkin_booking(booking_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Updating the booking status to Checked-In.
        # This will fire the MySQL trigger trg_checkin_room_occupied to set Room to Occupied!
        cursor.execute(
            "UPDATE Bookings SET status = 'Checked-In' WHERE booking_id = %s",
            (booking_id,)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Guest checked in successfully. Room is now Occupied.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/checkout/<int:room_id>', methods=['POST'])
def checkout(room_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Find active booking for this room
        cursor.execute('''
            SELECT booking_id FROM Bookings 
            WHERE room_id = %s AND status = 'Checked-In' 
            ORDER BY booking_id DESC LIMIT 1
        ''', (room_id,))
        row = cursor.fetchone()
        
        if not row:
            # If no active booking, just forcefully clean the room for demo
            cursor.execute("UPDATE Rooms SET status = 'Cleaning' WHERE room_id = %s", (room_id,))
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Room status set to cleaning.'})

        booking_id = row['booking_id']
        
        # Updating the booking status to Checked-Out. 
        # This will fire the MySQL trigger trg_checkout_room_cleaning to set Room to Cleaning!
        cursor.execute(
            "UPDATE Bookings SET status = 'Checked-Out' WHERE booking_id = %s",
            (booking_id,)
        )
        conn.commit()
        conn.close()
        return jsonify({'success': True, 'message': 'Guest checked out. Room is now being cleaned.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# 3. Services API
@app.route('/api/services', methods=['GET'])
def get_services():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Services")
        services = cursor.fetchall()
        conn.close()
        return jsonify(services)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/add_service', methods=['POST'])
def add_service():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        booking_id = data['booking_id']
        service_id = data['service_id']
        quantity = int(data.get('quantity', 1))
        
        # Insert into BookingServices. Trigger trg_update_billing_after_service will automatically update Billing!
        cursor.execute('''
            INSERT INTO BookingServices (booking_id, service_id, quantity) 
            VALUES (%s, %s, %s)
        ''', (booking_id, service_id, quantity))
        
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# 4. Billing API
@app.route('/api/all_billing', methods=['GET'])
def get_all_billing():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT bi.bill_id, bi.booking_id, g.first_name, g.last_name,
                   bi.total_room_charges, bi.total_service_charges, bi.tax,
                   bi.total_amount, bi.payment_status
            FROM Billing bi
            JOIN Bookings b ON bi.booking_id = b.booking_id
            JOIN Guests g ON b.guest_id = g.guest_id
            ORDER BY bi.bill_id DESC
        ''')
        billing = cursor.fetchall()
        conn.close()
        return jsonify(billing)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/billing/<int:booking_id>', methods=['GET'])
def get_booking_billing(booking_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Fetch bill details
        cursor.execute('''
            SELECT bi.*, g.first_name, g.last_name, g.email, g.phone, g.address,
                   r.room_number, r.room_type, r.price_per_night,
                   b.check_in_date, b.check_out_date, b.status as booking_status
            FROM Billing bi
            JOIN Bookings b ON bi.booking_id = b.booking_id
            JOIN Guests g ON b.guest_id = g.guest_id
            JOIN Rooms r ON b.room_id = r.room_id
            WHERE bi.booking_id = %s
        ''', (booking_id,))
        bill = cursor.fetchone()
        
        if not bill:
            conn.close()
            return jsonify({'error': 'Invoice not found'}), 404
            
        # Fetch ordered services
        cursor.execute('''
            SELECT s.service_name, s.price, bs.quantity, bs.service_date
            FROM BookingServices bs
            JOIN Services s ON bs.service_id = s.service_id
            WHERE bs.booking_id = %s
            ORDER BY bs.service_date DESC
        ''', (booking_id,))
        services = cursor.fetchall()
        
        conn.close()
        return jsonify({
            'bill': bill,
            'services': services
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/billing/<int:booking_id>/pay', methods=['POST'])
def pay_bill(booking_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE Billing 
            SET payment_status = 'Paid', payment_date = NOW() 
            WHERE booking_id = %s
        ''', (booking_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# 5. Housekeeping API
@app.route('/api/housekeeping', methods=['GET'])
def get_housekeeping():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT h.*, r.room_number, r.room_type
            FROM HousekeepingLog h
            JOIN Rooms r ON h.room_id = r.room_id
            ORDER BY h.log_id DESC
        ''')
        logs = cursor.fetchall()
        conn.close()
        return jsonify(logs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/housekeeping/update', methods=['POST'])
def update_housekeeping():
    data = request.json
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        log_id = data['log_id']
        status = data['status']
        assigned_cleaner = data.get('assigned_cleaner', '')
        
        if status == 'Completed':
            cursor.execute('''
                UPDATE HousekeepingLog 
                SET status = %s, assigned_cleaner = %s, end_time = NOW() 
                WHERE log_id = %s
            ''', (status, assigned_cleaner, log_id))
        else:
            cursor.execute('''
                UPDATE HousekeepingLog 
                SET status = %s, assigned_cleaner = %s 
                WHERE log_id = %s
            ''', (status, assigned_cleaner, log_id))
            
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    # Add trigger check or database initialize notice
    app.run(debug=True, use_reloader=False, port=5050)
