
# BOWLSTATION — QR Restaurant Ordering System

A full-stack, mobile-friendly restaurant ordering application built with React, Express, and SQLite.

BOWLSTATION allows customers to scan a table-specific QR code, browse a visual menu, place an order, and track its progress. Staff use a separate, password-protected kitchen dashboard to manage incoming orders and update preparation statuses.

**Project type:** Full-stack web application / portfolio demonstration  
**Status:** Functional local prototype — public deployment in progress

> **Portfolio demo:** BOWLSTATION represents a fictional restaurant. Orders are for demonstration purposes only. No real meals are prepared, and no payments are processed.

## Overview

Traditional restaurant ordering can involve handwritten tickets, repeated trips between tables and the kitchen, and limited visibility for customers waiting for their food.

BOWLSTATION explores a digital ordering workflow that connects customers and kitchen staff through one application.

The system is designed around three goals:

- Make table ordering easy on mobile devices.
- Give kitchen staff a clear, organized order queue.
- Let customers follow their orders without accessing staff information or other customers' orders.

## Features

### Customer ordering

- **Table-specific QR codes** — Each table has its own ordering link.
- **Visual menu** — Eight food and drink items with individually matched photos.
- **Food photo viewer** — Tap a dish photo to enlarge it, with mobile zoom support.
- **Menu browsing** — Search dishes and filter by category.
- **Shopping cart** — Add items, adjust quantities, and review the subtotal.
- **Guest and seat labels** — Identify customers ordering separately at the same table.
- **Kitchen instructions** — Include special requests with an order.
- **Order confirmation** — Receive a unique order number after checkout.
- **Private order tracking** — Follow the status of orders placed from the same browser.
- **Live wait timer** — See elapsed time since the order was placed.
- **Automatic tracker cleanup** — Completed orders disappear from the customer tracker after two minutes without changing the assigned table.

### Kitchen dashboard

- Password-protected staff access.
- Incoming orders displayed as individual kitchen tickets.
- Table numbers, order numbers, guest names, and seat labels.
- Large item quantities and readable dish names.
- Highlighted kitchen instructions.
- Order filtering and summary counts.
- Status workflow: **Pending → Preparing → Ready → Completed**.
- Live total-wait and preparation timers.
- Orange pulsing attention indicator after five minutes.
- Solid red priority indicator after ten minutes.
- Automatic order refresh and staff logout.

### Shared-table ordering

Multiple people at the same table can use the same QR code and order independently.

For example:

| Order | Table | Customer | Seat | Status |
|---|---|---|---|---|
| #101 | 08 | Alex | 1 | Preparing |
| #102 | 08 | Sam | 2 | Pending |
| #103 | 08 | Jamie | 3 | Ready |

Each order has its own items, tracking information, and status. The kitchen can see all orders, while customers only have access to orders for which their browser holds the private tracking credentials.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, Vite |
| Styling | CSS, responsive layouts |
| Backend | Node.js, Express |
| Database | SQLite, better-sqlite3 |
| Authentication | Password verification, HTTP-only session cookies |
| Security features | Hashed session tokens, login rate limiting, protected staff endpoints |
| QR codes | QR code generation with table-specific URLs |
| Version control | Git, GitHub |

## How It Works

### 1. Customer scans a QR code

A table-specific link opens the customer menu:

`http://localhost:5173/?table=8`

For phone testing, `localhost` is replaced with the laptop's local network IP address.

The table number stays assigned throughout the ordering session.

### 2. Customer places an order

The customer browses the menu, adds items to the cart, enters a guest/seat label, and submits an order.

The Express backend validates the order and stores its details in SQLite.

### 3. Kitchen receives the order

Authorized staff open `/kitchen` and sign in.

The dashboard displays incoming orders with the table number, guest information, food items, notes, and elapsed wait time.

### 4. Staff update the status

Staff move orders through the kitchen workflow:

`Pending → Preparing → Ready → Completed`

The backend saves status changes and preparation timestamps in SQLite.

### 5. Customer tracks progress

The customer's browser periodically checks the status of its own orders using private tracking credentials.

When an order is completed, it remains visible briefly before being cleared from the customer tracker.

## Running Locally

### Requirements

- Node.js LTS
- npm
- Git
- A modern web browser

### 1. Clone the repository

```bash
git clone https://github.com/thv-cyber/orderflow-lite.git
cd orderflow-lite
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
cd server
npm install
```

### 4. Configure the staff password

Create a file named `.env` inside the `server` folder:

```env
STAFF_PASSWORD=replace-with-a-unique-password-at-least-12-characters
```

Use a strong, unique password. Do not commit the `.env` file to GitHub.

### 5. Start the backend

From the `server` folder:

```bash
node index.js
```

The API runs on:

`http://localhost:3001`

The SQLite database is created automatically during setup.

### 6. Start the frontend

Open a second terminal in the project root:

```bash
npm run dev
```

Open:

**Customer menu:**  
`http://localhost:5173/?table=1`

**Kitchen dashboard:**  
`http://localhost:5173/kitchen`

To test with a phone on the same Wi-Fi network, start Vite with:

```bash
npm run dev -- --host 0.0.0.0
```

Then use the laptop's LAN IP address in place of `localhost`. Network firewall settings may need to allow access to port 5173.

## Project Structure

```text
orderflow-lite/
├── public/
│   ├── menu-images/       # Food and drink photos
│   ├── favicon.svg
│   └── icons.svg
├── server/
│   ├── index.js           # Express API and SQLite logic
│   ├── package.json
│   └── .env               # Local secret, not committed
├── src/
│   ├── App.jsx            # Customer ordering and tracking
│   ├── App.css            # Customer interface styling
│   ├── Kitchen.jsx        # Staff dashboard
│   ├── Kitchen.css        # Kitchen interface styling
│   ├── StaffLogin.css
│   └── main.jsx
├── generate-qr.cjs        # Table QR code generator
├── package.json
├── vite.config.js
└── README.md
```

## Technical Highlights

**Full-stack communication**

React communicates with the Express API to retrieve menu items, submit orders, and check order status.

**Persistent order records**

SQLite stores menu items, orders, individual order items, staff sessions, and order-tracking information.

**Private customer tracking**

Orders receive private tracking credentials. A table number or sequential order ID alone is not sufficient to retrieve another customer's tracking details.

**Protected kitchen operations**

Kitchen order data and status updates require a valid staff session. The backend enforces these restrictions rather than relying only on hiding the staff interface.

**Server-based timers**

Wait and preparation times use timestamps stored by the backend, so refreshing the dashboard does not restart an order's timer.

**Mobile-first workflow**

Customers can use the menu on their phones, including table assignment, photo viewing, cart management, and order tracking.

## Testing

The application has been exercised locally using a laptop and mobile devices on the same Wi-Fi network.

Testing has included:

- Opening table-specific QR links on a phone.
- Placing orders from the mobile customer interface.
- Receiving orders on the kitchen dashboard.
- Identifying separate guest and seat labels for customers sharing a table.
- Updating kitchen statuses and observing customer tracking changes.
- Displaying live timers and attention indicators.
- Enlarging menu photos on mobile.

Additional production testing will be performed before public deployment.

## Screenshots

Project screenshots will be added here as part of the portfolio presentation.

Planned screenshots:

1. Customer menu with food photography.
2. Mobile order and checkout experience.
3. Private customer order tracker.
4. Kitchen dashboard with active orders and live timers.
5. Shared-table orders with guest and seat labels.

## Development Challenges

### Supporting multiple customers at one table

**Challenge:** Different customers may share a table while ordering and receiving food independently.

**Approach:** Separate orders are associated with the same table number. Guest and seat labels help the kitchen identify the correct customer, while private tracking credentials separate the customer-facing order views.

### Making kitchen orders easy to read

**Challenge:** Large timers and low-contrast details can make kitchen tickets harder to scan during busy periods.

**Approach:** The dashboard was refined to prioritize item quantities, food names, and special instructions. Timers were made more compact and given visual attention indicators.

### Keeping customer tracking private

**Challenge:** Customers need access to their order status without gaining access to the complete kitchen queue.

**Approach:** A dedicated tracking flow uses private order credentials, while kitchen operations remain behind staff authentication.

## Current Status and Next Steps

BOWLSTATION is a functional local prototype.

Remaining work includes:

- Final end-to-end and security testing.
- Preparing a production deployment configuration.
- Selecting persistent storage for the SQLite database.
- Deploying the frontend and backend over HTTPS.
- Regenerating table QR codes with the public URL.
- Adding final project screenshots and a live demo link.

## Author

**Aljun Agunas**  
Computer Systems Technology Student  
Saskatchewan Polytechnic

**GitHub:** [thv-cyber](https://github.com/thv-cyber)

---

Built as a personal full-stack development and portfolio project.

**Last updated:** October 16, 2026
