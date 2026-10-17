const express = require("express");

const Database = require("better-sqlite3");

const cookieParser = require("cookie-parser");

const { rateLimit } = require("express-rate-limit");

const crypto = require("node:crypto");

const path = require("node:path");

const fs = require("node:fs");



require("dotenv").config({

  path: path.join(__dirname, ".env"),

});



const app = express();

const PORT = process.env.PORT || 3001;



app.disable("x-powered-by");

app.use(express.json({ limit: "20kb" }));

app.use(cookieParser());



// Render uses a proxy in production.

// Keep local development simple.

if (process.env.NODE_ENV === "production") {

  app.set("trust proxy", 1);

}



const staffPassword = process.env.STAFF_PASSWORD;



if (!staffPassword || staffPassword.length < 12) {

  console.error(

    "Please set STAFF_PASSWORD in server/.env " +

    "using at least 12 characters."

  );

  process.exit(1);

}



// Hash the configured staff password in memory.

// The actual password stays on the server.

const passwordSalt = crypto.randomBytes(16);



const passwordHash = crypto.scryptSync(

  staffPassword,

  passwordSalt,

  64

);



const SESSION_COOKIE = "orderflow_staff";

const SESSION_DURATION = 8 * 60 * 60 * 1000;



function hashToken(token) {

  return crypto

    .createHash("sha256")

    .update(token)

    .digest("hex");

}



function cookieOptions() {

  return {

    httpOnly: true,

    secure: process.env.NODE_ENV === "production",

    sameSite: "strict",

    path: "/",

  };

}



 // Database setup
 // Use a persistent disk in production, local SQLite during development.
const databasePath =
  process.env.DATABASE_PATH ||
  path.join(__dirname, "orderflow.sqlite");

fs.mkdirSync(path.dirname(databasePath), {
  recursive: true,
});

const db = new Database(databasePath);




db.pragma("journal_mode = WAL");

db.pragma("foreign_keys = ON");



db.exec(`

  CREATE TABLE IF NOT EXISTS menu_items (

    id INTEGER PRIMARY KEY,

    name TEXT NOT NULL,

    description TEXT NOT NULL,

    price_cents INTEGER NOT NULL,

    category TEXT NOT NULL,

    emoji TEXT NOT NULL,

    color TEXT NOT NULL,

    label TEXT NOT NULL DEFAULT '',

    available INTEGER NOT NULL DEFAULT 1

  );



  CREATE TABLE IF NOT EXISTS orders (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    table_number TEXT NOT NULL,

    customer_name TEXT NOT NULL,

    notes TEXT NOT NULL DEFAULT '',

    status TEXT NOT NULL DEFAULT 'Pending',

    subtotal_cents INTEGER NOT NULL,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))

  );



  CREATE TABLE IF NOT EXISTS order_items (

    id INTEGER PRIMARY KEY AUTOINCREMENT,

    order_id INTEGER NOT NULL,

    menu_item_id INTEGER NOT NULL,

    name TEXT NOT NULL,

    price_cents INTEGER NOT NULL,

    quantity INTEGER NOT NULL,

    FOREIGN KEY (order_id) REFERENCES orders(id)

  );



  CREATE TABLE IF NOT EXISTS staff_sessions (

    token_hash TEXT PRIMARY KEY,

    expires_at INTEGER NOT NULL

  );

`);



// Timer timestamps are durable server-side timestamps, not browser stopwatches.
// This additive migration does not delete or rewrite existing orders.
const orderColumns = new Set(
  db.prepare("PRAGMA table_info(orders)").all().map((column) => column.name)
);
if (!orderColumns.has("preparing_at_ms")) {
  db.exec("ALTER TABLE orders ADD COLUMN preparing_at_ms INTEGER");
}
if (!orderColumns.has("ready_at_ms")) {
  db.exec("ALTER TABLE orders ADD COLUMN ready_at_ms INTEGER");
}

// Private tracking records. Safe on an existing SQLite database:
// no stored orders or kitchen data are removed.
db.exec(`
  CREATE TABLE IF NOT EXISTS order_tracking_tokens (
    order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE
  );
`);

// Fictional BOWLSTATION menu

const starterMenu = [

  [

    1,

    "Teriyaki Chicken Bowl",

    "Grilled chicken, steamed rice, crunchy greens, and house teriyaki sauce.",

    1550,

    "Bowls",

    "🍗",

    "peach",

    "BESTSELLER",

  ],

  [

    2,

    "Spicy Miso Ramen",

    "Rich miso broth, noodles, egg, sweet corn, and chili oil.",

    1700,

    "Bowls",

    "🍜",

    "yellow",

    "FAN FAVORITE",

  ],

  [

    3,

    "Crispy Tofu Bowl",

    "Crispy tofu, sesame rice, pickled vegetables, and ginger sauce.",

    1400,

    "Bowls",

    "🥗",

    "mint",

    "PLANT-BASED",

  ],

  [

    4,

    "Katsu Curry Bowl",

    "Golden chicken katsu served with Japanese curry and warm rice.",

    1800,

    "Bowls",

    "🍛",

    "lavender",

    "COMFORT PICK",

  ],

  [

    5,

    "Crispy Gyoza",

    "Six pan-fried dumplings with our tangy dipping sauce.",

    800,

    "Sides",

    "🥟",

    "peach",

    "",

  ],

  [

    6,

    "Seaweed Fries",

    "Golden shoestring fries tossed with seaweed seasoning.",

    650,

    "Sides",

    "🍟",

    "yellow",

    "",

  ],

  [

    7,

    "Iced Matcha Latte",

    "Smooth matcha, chilled milk, and just a little sweetness.",

    600,

    "Drinks",

    "🍵",

    "mint",

    "",

  ],

  [

    8,

    "Yuzu Sparkler",

    "Refreshing citrus soda with bright yuzu flavor.",

    550,

    "Drinks",

    "🍋",

    "lavender",

    "",

  ],

];



// Seed the menu without deleting saved orders.

const insertMenuItem = db.prepare(`

  INSERT OR IGNORE INTO menu_items

  (id, name, description, price_cents, category, emoji, color, label)

  VALUES (?, ?, ?, ?, ?, ?, ?, ?)

`);



const seedMenu = db.transaction(() => {

  for (const item of starterMenu) {

    insertMenuItem.run(...item);

  }

});



seedMenu();



// Remove expired sessions periodically

function cleanExpiredSessions() {

  db.prepare(`

    DELETE FROM staff_sessions

    WHERE expires_at <= ?

  `).run(Date.now());

}



cleanExpiredSessions();



const cleanupInterval = setInterval(

  cleanExpiredSessions,

  60 * 60 * 1000

);



cleanupInterval.unref();



// Prevent cross-site browser requests to staff endpoints.

function rejectCrossSite(req, res, next) {

  const site = req.get("sec-fetch-site");



  if (

    site &&

    site !== "same-origin" &&

    site !== "none"

  ) {

    return res.status(403).json({

      error: "Cross-site staff requests are blocked.",

    });

  }



  next();

}



function currentStaffSession(req) {

  const token = req.cookies?.[SESSION_COOKIE];



  if (

    typeof token !== "string" ||

    !/^[a-f0-9]{64}$/.test(token)

  ) {

    return null;

  }



  const tokenHash = hashToken(token);



  const session = db.prepare(`

    SELECT token_hash AS tokenHash, expires_at AS expiresAt

    FROM staff_sessions

    WHERE token_hash = ?

  `).get(tokenHash);



  if (!session || session.expiresAt <= Date.now()) {

    return null;

  }



  return session;

}



// This protects backend data, not just the React page.

function requireStaff(req, res, next) {

  if (!currentStaffSession(req)) {

    return res.status(401).json({

      error: "Staff login required.",

    });

  }



  next();

}



function verifyStaffPassword(candidate) {

  if (typeof candidate !== "string") {

    return false;

  }



  if (candidate.length > 1024) {

    return false;

  }



  const candidateHash = crypto.scryptSync(

    candidate,

    passwordSalt,

    64

  );



  return crypto.timingSafeEqual(

    candidateHash,

    passwordHash

  );

}



const loginLimiter = rateLimit({

  windowMs: 15 * 60 * 1000,

  limit: 8,

  standardHeaders: "draft-7",

  legacyHeaders: false,

  message: {

    error: "Too many login attempts. Try again in 15 minutes.",

  },

});



// Disable caching for API responses.

app.use("/api", (req, res, next) => {

  res.set("Cache-Control", "no-store");

  next();

});



// Health check remains public.

app.get("/api/health", (req, res) => {

  res.json({

    status: "ok",

    message: "OrderFlow backend is running!",

  });

});



// Customer menu remains public.

app.get("/api/menu", (req, res) => {

  const menu = db.prepare(`

    SELECT

      id,

      name,

      description,

      price_cents AS priceCents,

      category,

      emoji,

      color,

      label

    FROM menu_items

    WHERE available = 1

    ORDER BY id

  `).all().map(({ priceCents, ...item }) => ({

    ...item,

    price: priceCents / 100,

  }));



  res.json({ menu });

});



// Check whether the browser has a valid staff session.

app.get(

  "/api/staff/session",

  rejectCrossSite,

  (req, res) => {

    res.json({

      authenticated: Boolean(currentStaffSession(req)),

    });

  }

);



// Staff login.

app.post(

  "/api/staff/login",

  rejectCrossSite,

  loginLimiter,

  (req, res) => {

    const candidate = req.body?.password;



    if (!verifyStaffPassword(candidate)) {

      return res.status(401).json({

        error: "Incorrect staff password.",

      });

    }



    // Replace the previous session on this browser.

    const oldToken = req.cookies?.[SESSION_COOKIE];



    if (

      typeof oldToken === "string" &&

      /^[a-f0-9]{64}$/.test(oldToken)

    ) {

      db.prepare(`

        DELETE FROM staff_sessions

        WHERE token_hash = ?

      `).run(hashToken(oldToken));

    }



    cleanExpiredSessions();



    const token = crypto.randomBytes(32).toString("hex");

    const expiresAt = Date.now() + SESSION_DURATION;



    db.prepare(`

      INSERT INTO staff_sessions (token_hash, expires_at)

      VALUES (?, ?)

    `).run(hashToken(token), expiresAt);



    res.cookie(SESSION_COOKIE, token, {

      ...cookieOptions(),

      maxAge: SESSION_DURATION,

    });



    res.json({

      authenticated: true,

      message: "Staff login successful.",

    });

  }

);



// Staff logout.

app.post(

  "/api/staff/logout",

  rejectCrossSite,

  (req, res) => {

    const token = req.cookies?.[SESSION_COOKIE];



    if (

      typeof token === "string" &&

      /^[a-f0-9]{64}$/.test(token)

    ) {

      db.prepare(`

        DELETE FROM staff_sessions

        WHERE token_hash = ?

      `).run(hashToken(token));

    }



    res.clearCookie(

      SESSION_COOKIE,

      cookieOptions()

    );



    res.json({

      authenticated: false,

      message: "Signed out.",

    });

  }

);



// Get an order from SQLite, including its food items.

function getOrder(id) {

  const order = db.prepare(`

    SELECT

      id,

      table_number AS tableNumber,

      customer_name AS customerName,

      notes,

      status,

      subtotal_cents AS subtotalCents,

      created_at AS createdAt,
      CAST(strftime('%s', created_at) AS INTEGER) * 1000 AS createdAtMs,
      preparing_at_ms AS preparingAtMs,
      ready_at_ms AS readyAtMs

    FROM orders

    WHERE id = ?

  `).get(id);



  if (!order) return null;



  const items = db.prepare(`

    SELECT

      menu_item_id AS id,

      name,

      price_cents AS priceCents,

      quantity

    FROM order_items

    WHERE order_id = ?

    ORDER BY id

  `).all(id).map((item) => ({

    id: item.id,

    name: item.name,

    price: item.priceCents / 100,

    quantity: item.quantity,

    lineTotal:

      (item.priceCents * item.quantity) / 100,

  }));



  return {

    id: order.id,

    tableNumber: order.tableNumber,

    customerName: order.customerName,

    notes: order.notes,

    status: order.status,

    subtotal: order.subtotalCents / 100,

    createdAt: order.createdAt,
    createdAtMs: order.createdAtMs,
    preparingAtMs: order.preparingAtMs,
    readyAtMs: order.readyAtMs,
    items,

  };

}



// Save a customer order using prices from SQLite.

const createOrder = db.transaction(

  (tableNumber, customerName, notes, items, trackingTokenHash) => {

    const menuLookup = db.prepare(`

      SELECT id, name, price_cents AS priceCents

      FROM menu_items

      WHERE id = ? AND available = 1

    `);



    const selected = items.map((item) => {

      const menuItem = menuLookup.get(item.id);



      if (!menuItem) {

        throw new Error(

          `Menu item ${item.id} is unavailable.`

        );

      }



      return {

        ...menuItem,

        quantity: item.quantity,

      };

    });



    const subtotalCents = selected.reduce(

      (sum, item) =>

        sum + item.priceCents * item.quantity,

      0

    );



    const result = db.prepare(`

      INSERT INTO orders

      (table_number, customer_name, notes, subtotal_cents)

      VALUES (?, ?, ?, ?)

    `).run(

      tableNumber,

      customerName,

      notes,

      subtotalCents

    );



    const orderId = Number(result.lastInsertRowid);



    const insertOrderItem = db.prepare(`

      INSERT INTO order_items

      (order_id, menu_item_id, name, price_cents, quantity)

      VALUES (?, ?, ?, ?, ?)

    `);



    for (const item of selected) {

      insertOrderItem.run(

        orderId,

        item.id,

        item.name,

        item.priceCents,

        item.quantity

      );

    }



    // Issue private tracking access in the same transaction as the order.
    db.prepare(`
      INSERT INTO order_tracking_tokens (order_id, token_hash)
      VALUES (?, ?)
    `).run(orderId, trackingTokenHash);

    return orderId;

  }

);




const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Too many demo orders. Please wait a minute.",
  },
});

// Public: customers can submit orders (and receive a private tracking token).
app.post("/api/orders", orderLimiter, (req, res) => {


  const {

    tableNumber,

    customerName = "",

    notes = "",

    items,

  } = req.body || {};



  const table = String(tableNumber ?? "");

  const tableValue = Number(table);



  const validItems =

    Array.isArray(items) &&

    items.length > 0 &&

    items.length <= 30 &&

    items.every(

      (item) =>

        item &&

        Number.isInteger(item.id) &&

        Number.isInteger(item.quantity) &&

        item.quantity >= 1 &&

        item.quantity <= 20

    ) &&

    new Set(items.map((item) => item.id)).size ===

      items.length &&

    items.reduce(

      (sum, item) => sum + item.quantity,

      0

    ) <= 30;



  if (

    !/^\d{1,2}$/.test(table) ||

    tableValue < 1 ||

    tableValue > 20 ||

    typeof customerName !== "string" ||

    customerName.length > 50 ||

    typeof notes !== "string" ||

    notes.length > 300 ||

    !validItems

  ) {

    return res.status(400).json({

      error: "Please check your order details.",

    });

  }



  try {

    // Never use the public table number or order ID as a tracking password.
    const trackingToken = crypto.randomBytes(32).toString("hex");
    const id = createOrder(

      String(tableValue).padStart(2, "0"),

      customerName.trim() || "Guest",

      notes.trim(),

      items,
      hashToken(trackingToken)

    );



    res.status(201).json({

      order: getOrder(id),
      trackingToken,

    });

  } catch (error) {

    console.error("Order error:", error.message);



    res.status(400).json({

      error: "Couldn't save that order. Check the menu items.",

    });

  }

});



// Customers can check ONLY an order whose private tracking token they own.
// Authorization is a random bearer secret, not an order ID or table number.
app.get("/api/customer/orders/:id", rejectCrossSite, (req, res) => {
  const id = Number(req.params.id);
  const match = /^Bearer ([a-f0-9]{64})$/.exec(req.get("authorization") || "");

  if (!Number.isSafeInteger(id) || id < 1 || !match) {
    return res.status(404).json({ error: "Order not found." });
  }

  const access = db.prepare(`
    SELECT order_id
    FROM order_tracking_tokens
    WHERE order_id = ? AND token_hash = ?
  `).get(id, hashToken(match[1]));

  // Respond the same way for an unknown ID or an invalid secret.
  if (!access) {
    return res.status(404).json({ error: "Order not found." });
  }

  const order = getOrder(id);
  if (!order) {
    return res.status(404).json({ error: "Order not found." });
  }

  // Do not expose customer names, kitchen notes, or any other table's data.
  res.json({
    order: {
      id: order.id,
      tableNumber: order.tableNumber,
      status: order.status,
      subtotal: order.subtotal,
      createdAtMs: order.createdAtMs,
      preparingAtMs: order.preparingAtMs,
      readyAtMs: order.readyAtMs,
      items: order.items,
    },
  });
});

// Protected: only staff may view kitchen orders.

app.get(

  "/api/orders",

  rejectCrossSite,

  requireStaff,

  (req, res) => {

    const rows = db.prepare(`

      SELECT id

      FROM orders

      ORDER BY id DESC

      LIMIT 100

    `).all();



    res.json({

      orders: rows.map((row) => getOrder(row.id)),

    });

  }

);



// Protected: only staff may update statuses.

const statuses = [

  "Pending",

  "Preparing",

  "Ready",

  "Completed",

];



app.patch(

  "/api/orders/:id/status",

  rejectCrossSite,

  requireStaff,

  (req, res) => {

    const id = Number(req.params.id);

    const newStatus = req.body?.status;



    if (

      !Number.isSafeInteger(id) ||

      id < 1 ||

      !statuses.includes(newStatus)

    ) {

      return res.status(400).json({

        error: "Invalid order or status.",

      });

    }



    const order = getOrder(id);



    if (!order) {

      return res.status(404).json({

        error: "Order not found.",

      });

    }



    const expectedStatus =

      statuses[statuses.indexOf(order.status) + 1];



    if (newStatus !== expectedStatus) {

      return res.status(409).json({

        error: "Orders must move forward one status at a time.",

      });

    }



    // Avoid conflicting updates from multiple kitchen screens.

    const statusChangedAt = Date.now();
    const result = db.prepare(`

      UPDATE orders
      SET status = ?,
          preparing_at_ms = CASE WHEN ? = 'Preparing' THEN ? ELSE preparing_at_ms END,
          ready_at_ms = CASE WHEN ? = 'Ready' THEN ? ELSE ready_at_ms END
      WHERE id = ? AND status = ?
    `).run(
      newStatus,
      newStatus, statusChangedAt,
      newStatus, statusChangedAt,
      id, order.status
    );



    if (result.changes !== 1) {

      return res.status(409).json({

        error: "Order changed. Please refresh.",

      });

    }



    res.json({

      order: getOrder(id),

    });

  }

);



// In production, Express also serves the React app.

const buildPath = path.join(__dirname, "..", "dist");



if (

  fs.existsSync(path.join(buildPath, "index.html"))

) {

  app.use(express.static(buildPath));



  app.use((req, res) => {

    if (

      req.method === "GET" &&

      !req.path.startsWith("/api/")

    ) {

      return res.sendFile(

        path.join(buildPath, "index.html")

      );

    }



    res.status(404).json({

      error: "Route not found.",

    });

  });

}



// Start the API.

app.listen(PORT, "0.0.0.0", () => {

  console.log(

    `OrderFlow backend running at http://localhost:${PORT}`

  );



  console.log("Staff authentication is enabled.");

});
