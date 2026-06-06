document.addEventListener('DOMContentLoaded', () => {
    // HTML escaping helper to prevent Stored XSS
    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    }

    // Current Active Tab tracking
    let activeTab = 'dashboard';
    
    // Core Elements
    const roomGrid = document.getElementById('room-grid');
    const btnNewBooking = document.getElementById('btn-new-booking');
    const btnNewBookingAlt = document.getElementById('btn-new-booking-alt');
    const bookingModal = document.getElementById('booking-modal');
    const bookingForm = document.getElementById('booking-form');
    const roomSelect = document.getElementById('room-select');
    
    // Stats elements
    const statTotal = document.getElementById('stat-total');
    const statAvailable = document.getElementById('stat-available');
    const statOccupied = document.getElementById('stat-occupied');
    const statCleaning = document.getElementById('stat-cleaning');

    // Tab title and description text
    const viewTitle = document.getElementById('view-title');
    const viewDesc = document.getElementById('view-desc');

    // Navigation Tabs Setup
    const navLinks = document.querySelectorAll('.nav-links a');
    const views = document.querySelectorAll('.view');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = link.id.replace('nav-', '');
            switchTab(targetTab);
        });
    });

    function switchTab(tabId) {
        activeTab = tabId;
        
        // Update Nav Menu active status
        document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
        const activeLink = document.getElementById(`nav-${tabId}`);
        if (activeLink) activeLink.parentElement.classList.add('active');
        
        // Toggle view containers
        views.forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(`view-${tabId}`);
        if (targetView) targetView.classList.add('active');

        // Update Title & description
        if (tabId === 'dashboard') {
            viewTitle.textContent = "Dashboard Overview";
            viewDesc.textContent = "Monitor real-time room occupancy, housekeeping tasks, and invoicing.";
            loadRooms();
        } else if (tabId === 'bookings') {
            viewTitle.textContent = "Reservation Directory";
            viewDesc.textContent = "Manage guest registrations and room booking statuses.";
            loadBookings();
        } else if (tabId === 'housekeeping') {
            viewTitle.textContent = "Housekeeping & Cleaning Queue";
            viewDesc.textContent = "Assign cleaning tasks, track room availability progress, and complete logs.";
            loadHousekeeping();
        } else if (tabId === 'billing') {
            viewTitle.textContent = "Billing & Financial Logs";
            viewDesc.textContent = "Review invoice summaries, track payments, and view guest receipts.";
            loadBilling();
        }
    }

    // --- Rooms & Dashboard Tab Logic ---
    let currentFilter = 'all';
    let allRoomsCache = [];

    // Filter room grid buttons
    const filterButtons = document.querySelectorAll('.btn-filter');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderRoomsGrid();
        });
    });

    async function loadRooms() {
        try {
            const response = await fetch('/api/rooms');
            if (!response.ok) throw new Error('Failed to fetch rooms');
            allRoomsCache = await response.json();
            
            updateDashboardStats();
            renderRoomsGrid();
            populateRoomSelectDropdown();
        } catch (error) {
            roomGrid.innerHTML = `<div class="loading" style="color: #f43f5e;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading room data from MySQL database.</div>`;
            console.error(error);
        }
    }

    function updateDashboardStats() {
        if (!statTotal) return;
        statTotal.textContent = allRoomsCache.length;
        
        let avail = 0, occ = 0, clean = 0;
        allRoomsCache.forEach(r => {
            if (r.status === 'Available') avail++;
            if (r.status === 'Occupied') occ++;
            if (r.status === 'Cleaning') clean++;
        });
        
        statAvailable.textContent = avail;
        statOccupied.textContent = occ;
        statCleaning.textContent = clean;
    }

    function renderRoomsGrid() {
        roomGrid.innerHTML = '';
        const filtered = allRoomsCache.filter(r => currentFilter === 'all' || r.status === currentFilter);
        
        if (filtered.length === 0) {
            roomGrid.innerHTML = `<div class="loading">No rooms matching status "${currentFilter}" found.</div>`;
            return;
        }

        filtered.forEach(room => {
            const card = document.createElement('div');
            card.className = 'room-card';
            
            let actionBtn = '';
            
            if (room.status === 'Available') {
                actionBtn = `
                    <button class="btn-small btn-primary" onclick="openBookingModalWithRoom(${room.room_id})">
                        <i class="fa-solid fa-key"></i> Book
                    </button>
                    <button class="btn-small btn-secondary" onclick="updateRoomStatus(${room.room_id}, 'Maintenance')">
                        <i class="fa-solid fa-tools"></i> Maint.
                    </button>
                `;
            } else if (room.status === 'Occupied') {
                actionBtn = `
                    <button class="btn-small btn-danger" onclick="checkoutRoom(${room.room_id})">
                        <i class="fa-solid fa-sign-out-alt"></i> Checkout
                    </button>
                `;
            } else if (room.status === 'Cleaning') {
                actionBtn = `
                    <button class="btn-small btn-action-clean" onclick="triggerHousekeepingView()">
                        <i class="fa-solid fa-broom"></i> Clean Queue
                    </button>
                `;
            } else if (room.status === 'Maintenance') {
                actionBtn = `
                    <button class="btn-small btn-primary" onclick="updateRoomStatus(${room.room_id}, 'Available')">
                        <i class="fa-solid fa-check"></i> Ready
                    </button>
                `;
            }

            card.innerHTML = `
                <div class="room-header">
                    <span class="room-number">Room ${room.room_number}</span>
                    <span class="room-type">${room.room_type}</span>
                </div>
                <div class="room-details">
                    <span class="room-status status-${room.status}">${room.status}</span>
                </div>
                <div class="room-price">PKR ${parseFloat(room.price_per_night).toLocaleString()}/night</div>
                <div class="room-actions">
                    ${actionBtn}
                </div>
            `;
            roomGrid.appendChild(card);
        });
    }

    function populateRoomSelectDropdown() {
        if (!roomSelect) return;
        roomSelect.innerHTML = '<option value="">Select an available room...</option>';
        allRoomsCache.filter(r => r.status === 'Available').forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.room_id;
            opt.textContent = `Room ${r.room_number} - ${r.room_type} (PKR ${parseFloat(r.price_per_night).toLocaleString()})`;
            roomSelect.appendChild(opt);
        });
    }

    // Manual status update
    window.updateRoomStatus = async function(roomId, newStatus) {
        try {
            const response = await fetch(`/api/rooms/${roomId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (response.ok) {
                loadRooms();
            } else {
                const data = await response.json();
                alert('Error updating status: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to connect to server.');
        }
    };

    // Checkout room API call (Triggers SQL check out trigger)
    window.checkoutRoom = async function(roomId) {
        if (confirm('Are you sure you want to check out the guest? This will trigger a room status change to "Cleaning" and auto-log a housekeeping task.')) {
            try {
                const response = await fetch(`/api/checkout/${roomId}`, { method: 'POST' });
                const data = await response.json();
                if (response.ok) {
                    alert(data.message);
                    if (activeTab === 'dashboard') {
                        loadRooms();
                    } else if (activeTab === 'bookings') {
                        loadBookings();
                    }
                } else {
                    alert('Error checking out: ' + data.error);
                }
            } catch (e) {
                console.error(e);
                alert('Connection failure.');
            }
        }
    };

    window.triggerHousekeepingView = function() {
        switchTab('housekeeping');
    };

    // --- Bookings Tab Logic ---
    async function loadBookings() {
        try {
            const response = await fetch('/api/all_bookings');
            const bookings = await response.json();
            const tbody = document.querySelector('#bookings-table tbody');
            tbody.innerHTML = '';
            
            if (bookings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No bookings recorded.</td></tr>';
                return;
            }

            bookings.forEach(b => {
                let actionBtn = '';
                if (b.status === 'Confirmed') {
                    // Allowed to Check-in manually
                    actionBtn = `
                        <button class="btn-small btn-primary" onclick="checkInBooking(${b.booking_id})">
                            <i class="fa-solid fa-sign-in-alt"></i> Check-in
                        </button>
                    `;
                } else if (b.status === 'Checked-In') {
                    actionBtn = `
                        <button class="btn-small btn-primary" onclick="openAddServiceModal(${b.booking_id})">
                            <i class="fa-solid fa-plus"></i> Service
                        </button>
                        <button class="btn-small btn-danger" onclick="checkoutRoom(${b.room_id})">
                            <i class="fa-solid fa-sign-out-alt"></i> Checkout
                        </button>
                    `;
                }

                tbody.innerHTML += `
                    <tr>
                        <td><strong>#BOOK-${b.booking_id}</strong></td>
                        <td>${escapeHTML(b.first_name)} ${escapeHTML(b.last_name)}</td>
                        <td>Room ${b.room_number}</td>
                        <td>${b.check_in_date}</td>
                        <td>${b.check_out_date}</td>
                        <td><span class="room-status status-${b.status === 'Checked-In' ? 'Occupied' : b.status}">${b.status}</span></td>
                        <td>
                            <div style="display: flex; gap: 0.5rem;">
                                ${actionBtn}
                                <button class="btn-small btn-secondary" onclick="openInvoiceModal(${b.booking_id})">
                                    <i class="fa-solid fa-file-invoice"></i> Bill
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        } catch (error) {
            console.error('Failed to load bookings:', error);
        }
    }

    // Process checkin of a booking
    window.checkInBooking = async function(bookingId) {
        if (confirm('Check in this guest? The room status will automatically update to Occupied.')) {
            try {
                const response = await fetch(`/api/bookings/${bookingId}/checkin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                if (response.ok) {
                    alert(data.message);
                    loadBookings();
                } else {
                    alert('Error checking in: ' + data.error);
                }
            } catch (e) {
                console.error(e);
                alert('Connection error.');
            }
        }
    };

    // --- Housekeeping Tab Logic ---
    const housekeepingModal = document.getElementById('housekeeping-modal');
    const housekeepingForm = document.getElementById('housekeeping-form');
    
    async function loadHousekeeping() {
        try {
            const response = await fetch('/api/housekeeping');
            const logs = await response.json();
            const tbody = document.querySelector('#housekeeping-table tbody');
            tbody.innerHTML = '';
            
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No housekeeping records.</td></tr>';
                return;
            }

            logs.forEach(log => {
                let actionBtn = '';
                if (log.status === 'Pending') {
                    actionBtn = `
                        <button class="btn-small btn-primary" onclick="openHousekeepingStartModal(${log.log_id})">
                            <i class="fa-solid fa-play"></i> Start Cleaning
                        </button>
                    `;
                } else if (log.status === 'In Progress') {
                    actionBtn = `
                        <button class="btn-small btn-action-clean" 
                                data-log-id="${log.log_id}" 
                                data-cleaner="${escapeHTML(log.assigned_cleaner)}"
                                onclick="completeHousekeepingFromButton(this)">
                            <i class="fa-solid fa-check-double"></i> Complete Clean
                        </button>
                    `;
                }

                tbody.innerHTML += `
                    <tr>
                        <td>#HK-${log.log_id}</td>
                        <td><strong>Room ${log.room_number}</strong></td>
                        <td>${log.room_type}</td>
                        <td><span class="room-status status-${log.status === 'In Progress' ? 'Cleaning' : (log.status === 'Completed' ? 'Available' : 'Maintenance')}">${log.status}</span></td>
                        <td>${log.assigned_cleaner ? escapeHTML(log.assigned_cleaner) : '<em style="color:var(--text-muted)">Unassigned</em>'}</td>
                        <td>${formatDate(log.start_time)}</td>
                        <td>${log.end_time ? formatDate(log.end_time) : '<em style="color:var(--text-muted)">Pending</em>'}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            });
        } catch (error) {
            console.error('Failed to load housekeeping:', error);
        }
    }

    window.openHousekeepingStartModal = function(logId) {
        document.getElementById('housekeeping-log-id').value = logId;
        housekeepingModal.classList.add('active');
    };

    // Close Housekeeping Start Modal
    document.getElementById('btn-close-housekeeping-modal').addEventListener('click', closeHousekeepingModal);
    document.getElementById('btn-cancel-housekeeping').addEventListener('click', closeHousekeepingModal);
    
    function closeHousekeepingModal() {
        housekeepingModal.classList.remove('active');
        housekeepingForm.reset();
    }

    housekeepingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            log_id: document.getElementById('housekeeping-log-id').value,
            status: 'In Progress',
            assigned_cleaner: document.getElementById('cleaner-name').value
        };

        try {
            const response = await fetch('/api/housekeeping/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                closeHousekeepingModal();
                loadHousekeeping();
            } else {
                alert('Failed to start cleaning.');
            }
        } catch (e) {
            console.error(e);
        }
    });

    window.completeHousekeeping = async function(logId, cleanerName) {
        if (confirm('Mark this room as cleaned? This will fire the database trigger to set room status back to Available.')) {
            try {
                const response = await fetch('/api/housekeeping/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        log_id: logId,
                        status: 'Completed',
                        assigned_cleaner: cleanerName
                    })
                });
                if (response.ok) {
                    alert('Housekeeping completed successfully! Room is now Available.');
                    loadHousekeeping();
                } else {
                    alert('Failed to update task.');
                }
            } catch (e) {
                console.error(e);
            }
        }
    };

    window.completeHousekeepingFromButton = function(btn) {
        const logId = btn.getAttribute('data-log-id');
        const cleanerName = btn.getAttribute('data-cleaner');
        window.completeHousekeeping(logId, cleanerName);
    };

    // --- Billing Tab & Invoices Logic ---
    async function loadBilling() {
        try {
            const response = await fetch('/api/all_billing');
            const bills = await response.json();
            const tbody = document.querySelector('#billing-table tbody');
            tbody.innerHTML = '';
            
            if (bills.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">No billing logs.</td></tr>';
                return;
            }

            bills.forEach(b => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>#BILL-${b.bill_id}</strong></td>
                        <td>#BOOK-${b.booking_id}</td>
                        <td>${escapeHTML(b.first_name)} ${escapeHTML(b.last_name)}</td>
                        <td>PKR ${parseFloat(b.total_room_charges).toLocaleString()}</td>
                        <td>PKR ${parseFloat(b.total_service_charges).toLocaleString()}</td>
                        <td>PKR ${parseFloat(b.tax).toLocaleString()}</td>
                        <td><strong>PKR ${parseFloat(b.total_amount).toLocaleString()}</strong></td>
                        <td><span class="invoice-badge ${b.payment_status}">${b.payment_status}</span></td>
                        <td>
                            <button class="btn-small btn-primary" onclick="openInvoiceModal(${b.booking_id})">
                                <i class="fa-solid fa-file-invoice"></i> View Invoice
                            </button>
                        </td>
                    </tr>
                `;
            });
        } catch (error) {
            console.error('Failed to load billing:', error);
        }
    }

    // Detailed Invoice Modal
    const invoiceModal = document.getElementById('invoice-modal');
    
    // Elements inside Invoice Modal
    const invBillId = document.getElementById('invoice-bill-id');
    const invBookingId = document.getElementById('invoice-booking-id');
    const invStatus = document.getElementById('invoice-payment-status');
    const invGuestName = document.getElementById('invoice-guest-name');
    const invGuestEmail = document.getElementById('invoice-guest-email');
    const invGuestPhone = document.getElementById('invoice-guest-phone');
    const invGuestAddress = document.getElementById('invoice-guest-address');
    const invRoomInfo = document.getElementById('invoice-room-info');
    const invRoomRate = document.getElementById('invoice-room-rate');
    const invCheckin = document.getElementById('invoice-checkin');
    const invCheckout = document.getElementById('invoice-checkout');
    const invDuration = document.getElementById('invoice-duration');
    const invItemsBody = document.getElementById('invoice-items-body');
    
    const invRoomSubtotal = document.getElementById('invoice-room-subtotal');
    const invServicesSubtotal = document.getElementById('invoice-services-subtotal');
    const invTaxAmount = document.getElementById('invoice-tax-amount');
    const invGrandTotal = document.getElementById('invoice-grand-total');
    
    const invPaidDateRow = document.getElementById('invoice-paid-date-row');
    const invPaidDate = document.getElementById('invoice-paid-date');
    const btnPayInvoice = document.getElementById('btn-pay-invoice');

    window.openInvoiceModal = async function(bookingId) {
        try {
            const response = await fetch(`/api/billing/${bookingId}`);
            if (!response.ok) throw new Error('Invoice not found');
            const data = await response.json();
            
            const bill = data.bill;
            const services = data.services;
            
            // Set header info
            invBillId.textContent = `#BILL-${bill.bill_id}`;
            invBookingId.textContent = `#BOOK-${bill.booking_id}`;
            
            invStatus.className = `invoice-badge ${bill.payment_status}`;
            invStatus.textContent = bill.payment_status;
            
            // Guest Details
            invGuestName.textContent = `${bill.first_name} ${bill.last_name}`;
            invGuestEmail.textContent = bill.email;
            invGuestPhone.textContent = bill.phone || 'N/A';
            invGuestAddress.textContent = bill.address || 'N/A';
            
            // Stay Details
            invRoomInfo.textContent = `Room ${bill.room_number} - ${bill.room_type}`;
            invRoomRate.textContent = parseFloat(bill.price_per_night).toLocaleString();
            invCheckin.textContent = bill.check_in_date;
            invCheckout.textContent = bill.check_out_date;
            
            const nights = calculateNights(bill.check_in_date, bill.check_out_date);
            invDuration.textContent = `${nights} Night${nights > 1 ? 's' : ''}`;
            
            // Totals
            invRoomSubtotal.textContent = `PKR ${parseFloat(bill.total_room_charges).toLocaleString()}`;
            invServicesSubtotal.textContent = `PKR ${parseFloat(bill.total_service_charges).toLocaleString()}`;
            invTaxAmount.textContent = `PKR ${parseFloat(bill.tax).toLocaleString()}`;
            invGrandTotal.textContent = `PKR ${parseFloat(bill.total_amount).toLocaleString()}`;
            
            // Payment details
            if (bill.payment_status === 'Paid') {
                invPaidDateRow.style.display = 'flex';
                invPaidDate.textContent = formatDate(bill.payment_date);
                btnPayInvoice.style.display = 'none';
            } else {
                invPaidDateRow.style.display = 'none';
                btnPayInvoice.style.display = 'inline-flex';
                btnPayInvoice.onclick = () => processPayment(bill.booking_id);
            }
            
            // Render itemized statement
            invItemsBody.innerHTML = '';
            
            // Add Room charge item
            invItemsBody.innerHTML += `
                <tr>
                    <td>Stay in Room ${bill.room_number} (${bill.room_type})</td>
                    <td class="text-center">${parseFloat(bill.price_per_night).toLocaleString()}</td>
                    <td class="text-center">${nights}</td>
                    <td class="text-right">PKR ${parseFloat(bill.total_room_charges).toLocaleString()}</td>
                </tr>
            `;
            
            // Add Service charges
            if (services.length > 0) {
                services.forEach(s => {
                    const rowTotal = parseFloat(s.price) * parseInt(s.quantity);
                    invItemsBody.innerHTML += `
                        <tr>
                            <td>Service Ordered: ${s.service_name} <br><small style="color:var(--text-muted)">on ${formatDate(s.service_date)}</small></td>
                            <td class="text-center">${parseFloat(s.price).toLocaleString()}</td>
                            <td class="text-center">${s.quantity}</td>
                            <td class="text-right">PKR ${rowTotal.toLocaleString()}</td>
                        </tr>
                    `;
                });
            } else {
                invItemsBody.innerHTML += `
                    <tr>
                        <td colspan="4" style="color:var(--text-muted); text-align:center;"><em>No extra services ordered for this booking.</em></td>
                    </tr>
                `;
            }
            
            invoiceModal.classList.add('active');
        } catch (e) {
            console.error(e);
            alert('Failed to load invoice details.');
        }
    };

    document.getElementById('btn-close-invoice-modal').addEventListener('click', closeInvoiceModal);
    document.getElementById('btn-close-invoice').addEventListener('click', closeInvoiceModal);
    
    function closeInvoiceModal() {
        invoiceModal.classList.remove('active');
    }

    async function processPayment(bookingId) {
        if (confirm('Process invoice payment? This will update status to Paid.')) {
            try {
                const response = await fetch(`/api/billing/${bookingId}/pay`, { method: 'POST' });
                if (response.ok) {
                    alert('Invoice successfully paid!');
                    closeInvoiceModal();
                    if (activeTab === 'billing') loadBilling();
                    else if (activeTab === 'bookings') loadBookings();
                } else {
                    alert('Failed to process payment.');
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    // --- Add Service Modal ---
    const serviceModal = document.getElementById('service-modal');
    const serviceForm = document.getElementById('service-form');
    const serviceSelect = document.getElementById('service-select');
    
    window.openAddServiceModal = function(bookingId) {
        document.getElementById('service-booking-id').value = bookingId;
        serviceModal.classList.add('active');
    };

    document.getElementById('btn-close-service-modal').addEventListener('click', closeServiceModal);
    document.getElementById('btn-cancel-service').addEventListener('click', closeServiceModal);
    
    function closeServiceModal() {
        serviceModal.classList.remove('active');
        serviceForm.reset();
    }

    serviceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            booking_id: document.getElementById('service-booking-id').value,
            service_id: serviceSelect.value,
            quantity: document.getElementById('service-quantity').value
        };

        try {
            const response = await fetch('/api/add_service', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                alert('Service successfully ordered and added to bill!');
                closeServiceModal();
                if (activeTab === 'bookings') loadBookings();
            } else {
                const data = await response.json();
                alert('Error: ' + data.error);
            }
        } catch (e) {
            console.error(e);
            alert('Failed to add service.');
        }
    });

    async function loadServicesList() {
        try {
            const response = await fetch('/api/services');
            const services = await response.json();
            if (!serviceSelect) return;
            serviceSelect.innerHTML = '<option value="">Select a service...</option>';
            services.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.service_id;
                opt.textContent = `${s.service_name} (PKR ${parseFloat(s.price).toLocaleString()})`;
                serviceSelect.appendChild(opt);
            });
        } catch (e) {
            console.error('Failed to load services', e);
        }
    }

    // --- Bookings Form Modal ---
    const btnCancelBooking = document.getElementById('btn-cancel-booking');
    
    // Show booking modal
    if (btnNewBooking) btnNewBooking.addEventListener('click', () => openBookingForm());
    if (btnNewBookingAlt) btnNewBookingAlt.addEventListener('click', () => openBookingForm());
    
    window.openBookingModalWithRoom = function(roomId) {
        openBookingForm();
        if (roomSelect) roomSelect.value = roomId;
    };

    function openBookingForm() {
        bookingModal.classList.add('active');
        // Pre-fill checkin as today, checkout as tomorrow
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        document.getElementById('check-in-date').value = today.toISOString().split('T')[0];
        document.getElementById('check-out-date').value = tomorrow.toISOString().split('T')[0];
    }

    if (btnCancelBooking) btnCancelBooking.addEventListener('click', closeBookingForm);
    document.getElementById('btn-close-booking-modal').addEventListener('click', closeBookingForm);

    function closeBookingForm() {
        bookingModal.classList.remove('active');
        bookingForm.reset();
    }

    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            first_name: document.getElementById('guest-first-name').value,
            last_name: document.getElementById('guest-last-name').value,
            email: document.getElementById('guest-email').value,
            phone: document.getElementById('guest-phone').value,
            address: document.getElementById('guest-address').value,
            check_in_date: document.getElementById('check-in-date').value,
            check_out_date: document.getElementById('check-out-date').value,
            room_id: roomSelect.value,
            status: document.getElementById('booking-status-select').value
        };

        // Dates validation
        if (new Date(payload.check_in_date) >= new Date(payload.check_out_date)) {
            alert('Check-out date must be after Check-in date!');
            return;
        }

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (response.ok) {
                alert('Booking created successfully! Billing was auto-calculated.');
                closeBookingForm();
                if (activeTab === 'dashboard') loadRooms();
                else if (activeTab === 'bookings') loadBookings();
            } else {
                alert('Failed to book: ' + data.error);
            }
        } catch (error) {
            console.error(error);
            alert('Error connecting to server.');
        }
    });

    // Helper functions
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function calculateNights(inDate, outDate) {
        const d1 = new Date(inDate);
        const d2 = new Date(outDate);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 1;
    }

    // Initial Dashboard Setup
    loadRooms();
    loadServicesList();
});
