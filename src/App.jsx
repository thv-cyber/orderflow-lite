import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Kitchen from "./Kitchen";
import "./App.css";

// Match the server's menu IDs to the real food photos.
// Images can be kept in public/menu/ OR public/menu-images/.
const MENU_PHOTOS = {
  1: "teriyaki-chicken-bowl.webp",
  2: "spicy-miso-ramen.webp",
  3: "crispy-tofu-bowl.webp",
  4: "katsu-curry-bowl.webp",
  5: "crispy-gyoza.webp",
  6: "seaweed-fries.webp",
  7: "iced-matcha-latte.webp",
  8: "yuzu-sparkler.webp",
};
// The photo itself is a button, rather than an entire menu row being clickable.
// That keeps the existing Add button independent and easy to use on mobile.
function DishPhoto({ item, onView }) {
  const filename = MENU_PHOTOS[item.id];
  const [attempt, setAttempt] = useState(0);
  const locations = filename
    ? [`/menu/${filename}`, `/menu-images/${filename}`]
    : [];
  const showPhoto = attempt < locations.length;

  return (
    <div className={`dish-image bowlstation-photo dish-${item.color}`}>
      {showPhoto ? (
        <button
          type="button"
          className="dish-photo-open"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 5, pointerEvents: "auto", touchAction: "manipulation", cursor: "zoom-in" }}
          onClick={() => onView({ item, src: locations[attempt] })}
          aria-label={`View larger photo of ${item.name}`}
          title={`View ${item.name} photo`}
        >
          <img
            key={locations[attempt]}
            src={locations[attempt]}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => {
              console.warn(`BOWLSTATION: unable to load menu photo ${locations[attempt]}`);
              setAttempt((current) => current + 1);
            }}
          />
          <span className="dish-photo-open-hint" aria-hidden="true">
            ⤢ View photo
          </span>
        </button>
      ) : (
        <div className="photo-missing" aria-label={`${item.name} photo unavailable`}>
          <span aria-hidden="true">{item.emoji || "🍽️"}</span>
          <small>Photo unavailable</small>
        </div>
      )}
    </div>
  );
}

const clampZoom = (value) => Math.max(1, Math.min(4, value));
function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A separate dialog preserves native page pinch-to-zoom elsewhere on the site.
// Inside the viewer, two-finger pinch zooms the *photo* without zooming the page.
function PhotoLightbox({ photo, onClose, onAdd }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageAttempt, setImageAttempt] = useState(0);
  const filename = MENU_PHOTOS[photo.item.id];
  const backupSrc = photo.src.startsWith("/menu/")
    ? `/menu-images/${filename}`
    : `/menu/${filename}`;
  const sources = [photo.src, backupSrc];
  const src = sources[imageAttempt];
  const missing = imageAttempt >= sources.length;
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef({ distance: 0, zoom: 1, x: 0, y: 0 });

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(null);
      }
      if (event.key === "Tab") {
        // Keep keyboard focus inside the active photo dialog.
        const controls = dialogRef.current?.querySelectorAll(
          'button:not([disabled])'
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  function setZoomLevel(value) {
    const next = clampZoom(value);
    setZoom(next);
    if (next === 1) setPan({ x: 0, y: 0 });
  }

  function handlePointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2) {
      gesture.current.distance = pointerDistance(points[0], points[1]);
      gesture.current.zoom = zoom;
    } else if (points.length === 1) {
      gesture.current.x = event.clientX;
      gesture.current.y = event.clientY;
    }
  }

  function handlePointerMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length === 2 && gesture.current.distance > 0) {
      const distance = pointerDistance(points[0], points[1]);
      setZoomLevel(gesture.current.zoom * distance / gesture.current.distance);
    } else if (points.length === 1 && zoom > 1) {
      const dx = event.clientX - gesture.current.x;
      const dy = event.clientY - gesture.current.y;
      setPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
      gesture.current.x = event.clientX;
      gesture.current.y = event.clientY;
    }
  }

  function handlePointerEnd(event) {
    pointers.current.delete(event.pointerId);
    const points = [...pointers.current.values()];
    if (points.length === 1) {
      gesture.current.x = points[0].x;
      gesture.current.y = points[0].y;
    } else if (points.length === 0) {
      gesture.current.distance = 0;
    }
  }

  function imageError() {
    setImageAttempt((previous) => previous + 1);
  }

  return createPortal(
    <div
      className="food-lightbox-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(null);
      }}
    >
      <section
        ref={dialogRef}
        className="food-lightbox"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-lightbox-title"
        aria-describedby="food-lightbox-description"
      >
        <div className="food-lightbox-header">
          <div>
            <span className="food-lightbox-eyebrow">BOWLSTATION / MENU</span>
            <h2 id="food-lightbox-title">{photo.item.name}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="food-lightbox-close"
            onClick={() => onClose(null)}
            aria-label="Close enlarged photo"
          >
            ✕
          </button>
        </div>
        <div
          className="food-lightbox-stage"
          aria-label={`Enlarged photo of ${photo.item.name}. Use two fingers to zoom or drag when enlarged.`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={() => setZoomLevel(zoom === 1 ? 2 : 1)}
        >
          {!missing ? (
            <img
              src={src}
              alt={photo.item.name}
              draggable="false"
              style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
              onError={imageError}
            />
          ) : (
            <div className="food-lightbox-missing">Photo unavailable right now.</div>
          )}
        </div>
        <div className="food-lightbox-controls">
          <span>Pinch to zoom · drag to explore</span>
          <div className="food-lightbox-zoom-buttons">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoomLevel(zoom - 0.5)}>−</button>
            <output aria-label="Photo zoom level">{Math.round(zoom * 100)}%</output>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 4} onClick={() => setZoomLevel(zoom + 0.5)}>+</button>
            <button type="button" className="food-lightbox-reset" disabled={zoom === 1 && pan.x === 0 && pan.y === 0} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button>
          </div>
        </div>
        <div className="food-lightbox-footer">
          <p id="food-lightbox-description">{photo.item.description}</p>
          <div className="food-lightbox-checkout">
            <strong>{money(photo.item.price)}</strong>
            <button type="button" onClick={() => { onAdd(photo.item.id); onClose(null); }}>+ Add to order</button>
          </div>
        </div>
      </section>
    </div>,
    document.body
  );
}

// Keep a completed order on screen for two minutes, then hide it locally.
// This never deletes an order or tracking record from SQLite.
const COMPLETED_ORDER_VISIBLE_MS = 2 * 60 * 1000;

// Keep the tracking secret on the customer's own device for their table.
// Never store or fetch the restaurant's full kitchen order list here.
function loadMyOrders(table) {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(`bowlstation:my-orders:${table}`) || "[]"
    );
    return Array.isArray(stored)
      ? stored
          .filter((entry) =>
            Number.isSafeInteger(entry?.id) &&
            entry.id > 0 &&
            entry.tableNumber === table &&
            typeof entry.token === "string" &&
            /^[a-f0-9]{64}$/.test(entry.token)
          )
          // Older locally saved Completed orders have no completion timestamp.
          // Give them two minutes from this first load instead of dropping them.
          .map((entry) =>
            entry.status === "Completed" && !Number.isFinite(entry.completedAt)
              ? { ...entry, completedAt: Date.now() }
              : entry
          )
          .filter((entry) =>
            entry.status !== "Completed" ||
            Date.now() - entry.completedAt < COMPLETED_ORDER_VISIBLE_MS
          )
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

const ORDER_STEPS = ["Pending", "Preparing", "Ready", "Completed"];

// A stable server timestamp means the timer survives refreshes and device sleep.
// Show the final wait when Ready; never invent a food-ready countdown.
function formatDuration(ms) {
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${remaining}`;
}

function CustomerWaitTime({ order, now }) {
  const placedAt = order.createdAtMs;
  const finished = order.status === "Ready" || order.status === "Completed";
  const waitEnd = finished ? order.readyAtMs : now;
  const hasStart = Number.isFinite(placedAt) && placedAt > 0;
  const hasEnd = Number.isFinite(waitEnd) && waitEnd > 0;
  const elapsed = hasStart && hasEnd ? formatDuration(waitEnd - placedAt) : "—";
  return (
    <div className="customer-wait-clock" aria-label={`Time since order received: ${elapsed}`}>
      <span className="customer-clock-symbol" aria-hidden="true">◷</span>
      <div>
        <strong>{elapsed}</strong>
        <small>{finished ? "Time until ready" : "Time since ordering"}</small>
      </div>
      <span className="customer-clock-context">
        {finished ? "Ready to enjoy" : "Live wait time"}
      </span>
    </div>
  );
}

function OrderProgress({ status }) {
  const position = ORDER_STEPS.indexOf(status);
  return (
    <div className="customer-order-steps" role="group" aria-label={`Order status: ${status}`}>
      {ORDER_STEPS.map((step, index) => (
        <div
          className={`customer-order-step ${index <= position ? "reached" : ""}`}
          key={step}
        >
          <span className="customer-step-dot" aria-hidden="true">
            {index < position ? "✓" : index + 1}
          </span>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

const categories = [
  { name: "All items", icon: "▦" },
  { name: "Bowls", icon: "🍜" },
  { name: "Sides", icon: "🥟" },
  { name: "Drinks", icon: "🥤" },
];
const money = (amount) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
function tableNumber() {
  const value = new URLSearchParams(window.location.search).get("table");
  if (!value || !/^\d{1,2}$/.test(value)) return null;
  const num = Number(value);
  return num >= 1 && num <= 20 ? String(num).padStart(2, "0") : null;
}

// Don't silently place a guest at the wrong table when their QR link is missing.
function TableAccessScreen() {
  return (
    <main className="table-access-page">
      <style>{`
        .table-access-page { box-sizing:border-box;min-height:100dvh;display:grid;place-items:center;padding:24px;background:linear-gradient(145deg,#eef3ff 0%,#fff 60%,#fff9d9 100%);color:#173c9b;font-family:inherit; }
        .table-access-card {width:min(440px,100%);background:white;padding:clamp(28px,6vw,50px);border:1px solid #dce5f7;border-radius:28px;text-align:center;box-shadow:0 24px 65px #173c9b18;}
        .table-access-brand {font-size:13px;font-weight:900;letter-spacing:.12em;margin-bottom:30px;}
        .table-access-symbol {margin:0 auto 22px;width:80px;height:80px;display:grid;place-items:center;background:#ffdd48;border:3px solid #173c9b;border-radius:23px;font-size:42px;font-weight:900;}
        .table-access-card h1 {font-size:clamp(26px,5vw,36px);line-height:1.13;letter-spacing:-.04em;margin:0 0 14px;}
        .table-access-card p {color:#53647f;line-height:1.65;font-size:15px;margin:0;}
        .table-access-note {margin-top:26px;padding:15px;border-radius:14px;background:#eef3ff;font-size:13px;font-weight:700;}
      `}</style>
      <section className="table-access-card" aria-labelledby="table-access-title">
        <div className="table-access-brand">BOWLSTATION</div>
        <div className="table-access-symbol" aria-hidden="true">B</div>
        <h1 id="table-access-title">Ready to order?</h1>
        <p>Scan the BOWLSTATION QR code at your table to open the menu for the correct table.</p>
        <div className="table-access-note">Need a hand? Our team is happy to help.</div>
      </section>
    </main>
  );
}

export default function App() {
  if (window.location.pathname === "/kitchen") return <Kitchen />;
  const table = tableNumber();
  return table ? <OrderingKiosk table={table} /> : <TableAccessScreen />;
}
function OrderingKiosk({ table }) {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All items");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [name, setName] = useState("");
  const [seatNumber, setSeatNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [mobileCart, setMobileCart] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const [myOrders, setMyOrders] = useState(() => loadMyOrders(table));
  const [trackingError, setTrackingError] = useState("");
  const [now, setNow] = useState(Date.now());

  // Only the clock display re-renders every second. Status updates still
  // come securely from /api/customer/orders/:id every eight seconds.
  useEffect(() => {
    if (!myOrders.length) return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [myOrders.length]);

  // Poll every 8 seconds while there are unfinished orders. The bearer
  // token only grants access to the order that created it.
  const trackedIds = myOrders.map(({ id, token }) => `${id}:${token}`).join("|");

  useEffect(() => {
    if (!trackedIds) return;
    let cancelled = false;
    const ordersToCheck = myOrders.filter((order) => order.status !== "Completed");
    if (!ordersToCheck.length) return;

    async function updateStatuses() {
      const updates = await Promise.all(ordersToCheck.map(async (mine) => {
        try {
          const response = await fetch(`/api/customer/orders/${mine.id}`, {
            headers: { Authorization: `Bearer ${mine.token}` },
            cache: "no-store",
          });
          if (!response.ok) throw new Error(`Tracking request failed: ${response.status}`);
          const data = await response.json();
          if (data.order?.id !== mine.id || data.order?.tableNumber !== table) {
            throw new Error("Tracking response did not match this table.");
          }
          return {
            id: mine.id,
            status: data.order.status,
            createdAtMs: data.order.createdAtMs,
            preparingAtMs: data.order.preparingAtMs,
            readyAtMs: data.order.readyAtMs,
          };
        } catch {
          return null;
        }
      }));
      if (cancelled) return;

      const valid = updates.filter(Boolean);
      if (valid.length) {
        setTrackingError("");
        setMyOrders((previous) => {
          const next = previous.map((order) => {
            const fresh = valid.find((entry) => entry.id === order.id);
            if (!fresh) return order;
            const changed =
              fresh.status !== order.status ||
              fresh.createdAtMs !== order.createdAtMs ||
              fresh.preparingAtMs !== order.preparingAtMs ||
              fresh.readyAtMs !== order.readyAtMs;
            if (!changed) return order;
            return {
              ...order,
              status: fresh.status,
              createdAtMs: fresh.createdAtMs,
              preparingAtMs: fresh.preparingAtMs,
              readyAtMs: fresh.readyAtMs,
              // Start the two-minute removal window only when Completed
              // appears on this customer's screen.
              completedAt:
                fresh.status === "Completed" && order.status !== "Completed"
                  ? Date.now()
                  : order.completedAt ?? null,
            };
          });
          return next.every((entry, i) => entry === previous[i]) ? previous : next;
        });
      } else {
        setTrackingError("We can't refresh your order status right now. We'll keep trying.");
      }
    }

    updateStatuses();
    const interval = window.setInterval(updateStatuses, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  // The tokens/IDs change only when a new order is placed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedIds, table]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        `bowlstation:my-orders:${table}`,
        JSON.stringify(myOrders.slice(0, 5))
      );
    } catch {
      // Browser storage can be disabled; the current order still works.
    }
  }, [myOrders, table]);

  // Remove expired completed orders from this customer's display/storage.
  // This does not affect the assigned table, other guests, or staff records.
  useEffect(() => {
    const removeExpired = () => {
      const now = Date.now();
      const expiredIds = myOrders
        .filter((order) =>
          order.status === "Completed" &&
          Number.isFinite(order.completedAt) &&
          now - order.completedAt >= COMPLETED_ORDER_VISIBLE_MS
        )
        .map((order) => order.id);

      if (!expiredIds.length) return;
      setMyOrders((previous) =>
        previous.filter((order) => !expiredIds.includes(order.id))
      );
      // Avoid leaving an old confirmation dialog open for an expired order.
      setConfirmation((previous) =>
        previous && expiredIds.includes(previous.id) ? null : previous
      );
    };

    removeExpired();
    const interval = window.setInterval(removeExpired, 5000);
    return () => window.clearInterval(interval);
  }, [myOrders]);

  const confirmedStatus = myOrders.find((entry) => entry.id === confirmation?.id);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMenu() {
      try {
        const response = await fetch("/api/menu", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Menu request failed");
        const data = await response.json();
        if (!Array.isArray(data.menu)) throw new Error("Invalid menu");
        setMenu(data.menu);
      } catch (error) {
        if (error.name !== "AbortError") {
          setMenuError("The menu isn't available right now. Please ask a team member for help.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMenu();
    return () => controller.abort();
  }, []);
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") {
        setMobileCart(false);
        setConfirmation(null);
        setSelectedPhoto(null);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);
  const visibleItems = menu.filter((item) => {
    const categoryMatches =
      selectedCategory === "All items" ||
      item.category === selectedCategory;
    const searchMatches =
      `${item.name} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
    return categoryMatches && searchMatches;
  });
  const cartItems = useMemo(
    () =>
      cart
        .map((entry) => {
          const item = menu.find((food) => food.id === entry.id);
          return item ? { ...item, quantity: entry.quantity } : null;
        })
        .filter(Boolean),
    [cart, menu]
  );
  const count = cartItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  function addItem(id) {
    const existing = cart.find((entry) => entry.id === id);
    if (count >= 30 || existing?.quantity >= 20) {
      setCheckoutError("Maximum 30 items per order, 20 per menu item.");
      return;
    }
    setCart((previous) => {
      const found = previous.find((entry) => entry.id === id);
      if (found) {
        return previous.map((entry) =>
          entry.id === id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        );
      }
      return [...previous, { id, quantity: 1 }];
    });
    setCheckoutError("");
  }
  function changeQuantity(id, difference) {
    if (difference > 0 && count >= 30) return;
    setCart((previous) =>
      previous
        .map((entry) =>
          entry.id === id
            ? {
                ...entry,
                quantity: Math.max(
                  0,
                  Math.min(20, entry.quantity + difference)
                ),
              }
            : entry
        )
        .filter((entry) => entry.quantity > 0)
    );
    setCheckoutError("");
  }
  async function submitOrder(event) {
    event.preventDefault();
    if (!cartItems.length || busy) return;

    // When friends order separately at one table, the kitchen needs to know
    // which guest each ticket belongs to. Require a name OR a seat number.
    const guestName = name.trim();
    if (!guestName && !seatNumber) {
      setCheckoutError("Please enter a first name or choose a seat so we know who to serve.");
      return;
    }
    // Existing kitchen screens display order.customerName. Build the label
    // here so no kitchen/backend migration is needed for this feature.
    // Up to 35 characters + the seat suffix remains under the API's 50-char limit.
    const guestLabel = `${guestName || "Guest"}${seatNumber ? ` · Seat ${seatNumber}` : ""}`;

    setBusy(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: table,
          customerName: guestLabel,
          notes: notes.trim(),
          items: cartItems.map((item) => ({
            id: item.id,
            quantity: item.quantity,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not save order.");
      }
      if (!/^[a-f0-9]{64}$/.test(data.trackingToken || "")) {
        console.warn("BOWLSTATION: tracking token missing; verify the updated backend is running.");
      }
      if (/^[a-f0-9]{64}$/.test(data.trackingToken || "")) {
        const tracked = {
          id: data.order.id,
          tableNumber: data.order.tableNumber,
          token: data.trackingToken,
          status: data.order.status,
          subtotal: data.order.subtotal,
          guestLabel: data.order.customerName,
          createdAtMs: data.order.createdAtMs,
          preparingAtMs: data.order.preparingAtMs,
          readyAtMs: data.order.readyAtMs,
        };
        setMyOrders((previous) =>
          [tracked, ...previous.filter((entry) => entry.id !== tracked.id)].slice(0, 5)
        );
      }
      // A successfully saved order is never treated as failed, even if an
      // older backend forgot to return the tracking token.
      setConfirmation(data.order);
      setCart([]);
      setName("");
      setSeatNumber("");
      setNotes("");
      setMobileCart(false);
    } catch (error) {
      setCheckoutError(error.message || "We couldn't place your order. Please try again or ask our team for help.");
    } finally {
      setBusy(false);
    }
  }
  const cartProps = {
    cartItems,
    count,
    subtotal,
    table,
    name,
    setName,
    seatNumber,
    setSeatNumber,
    notes,
    setNotes,
    busy,
    checkoutError,
    changeQuantity,
    submitOrder,
  };
  return (
    <div className="kiosk">
      <style>{`
        .dish-image.bowlstation-photo { position:relative!important;display:block!important;overflow:hidden!important;padding:0!important;flex-shrink:0;background:#173c9b!important;isolation:isolate; }
        .dish-image.bowlstation-photo::before,.dish-image.bowlstation-photo::after { display:none!important;content:none!important; }
        .dish-image.bowlstation-photo img { position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;object-position:center;border-radius:inherit;transition:transform 350ms ease; }
        .photo-missing { position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:5px;padding:8px;text-align:center;color:white;font-size:10px;font-weight:800; }
        .photo-missing small { font-size:9px;font-weight:400;overflow-wrap:anywhere; }
        @media(hover:hover) { .dish-row:hover .bowlstation-photo img { transform:scale(1.045); } }
        @media(prefers-reduced-motion:reduce) { .dish-image.bowlstation-photo img {transition:none;} }

        .customer-orders { margin:22px 0 24px;padding:18px 20px 14px;border:1px solid #d8e2fa;border-radius:20px;background:#f8faff;box-shadow:0 8px 26px rgba(20,56,130,.055); }
        .customer-orders-heading { display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px; }
        .customer-orders-heading h2 {margin:4px 0 0;font-size:clamp(18px,2.3vw,23px);font-weight:800;color:#122f83;}
        .customer-table-label {border-radius:999px;padding:8px 12px;background:#ffdd48;color:#173c9b;font-size:11px;font-weight:900;white-space:nowrap;}
        .customer-tracked-order {padding:14px 0;border-top:1px solid #dfe6f5;}
        .customer-order-top {display:flex;align-items:center;justify-content:space-between;gap:12px;color:#173c9b;font-size:14px;}
        .customer-status-pill {background:#173c9b;color:white;padding:7px 12px;border-radius:999px;font-size:11px;font-weight:800;}
        .customer-order-steps {display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:16px 0 10px;}
        .customer-order-step {display:flex;flex-direction:column;align-items:center;text-align:center;gap:7px;min-width:0;font-size:10px;font-weight:700;color:#7485a6;}
        .customer-step-dot {width:28px;height:28px;display:grid;place-items:center;border:2px solid #ccd6e7;background:white;color:#8494ad;border-radius:50%;font-size:12px;font-weight:900;}
        .customer-order-step.reached {color:#173c9b;}
        .customer-order-step.reached .customer-step-dot {background:#ffdd48;border-color:#173c9b;color:#173c9b;}
        .customer-order-help {margin:6px 0 0;color:#51617c;font-size:12px;}
        .customer-wait-clock {margin:13px 0 10px;display:flex;align-items:center;gap:12px;padding:13px 14px;background:linear-gradient(110deg,#eaf0ff,#f8faff);border:1px solid #dce5f8;border-radius:14px;color:#173c9b;}
        .customer-clock-symbol {font-size:29px;line-height:1;}
        .customer-wait-clock div {display:flex;flex-direction:column;gap:3px;}
        .customer-wait-clock strong {font-size:clamp(21px,3vw,27px);font-weight:900;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.025em;}
        .customer-wait-clock small {color:#516585;font-size:11px;font-weight:700;}
        .customer-clock-context {margin-left:auto;color:#173c9b;background:#ffdd48;border-radius:999px;padding:7px 9px;font-size:10px;font-weight:800;white-space:nowrap;}
        .customer-tracking-privacy {color:#71809b;font-size:11px;margin:8px 0 0;}
        .customer-tracking-warning {color:#994817;font-size:12px;margin:8px 0;}
        .customer-confirmation-progress {margin:14px 0 18px;padding:12px;border:1px solid #dfe7f8;border-radius:14px;background:#f8faff;}
        .customer-confirmation-progress p {font-size:12px;line-height:1.5;margin:12px 0 0;color:#52617a;}
        .customer-confirmation-button {width:100%;font:inherit;cursor:pointer;text-align:center;border:0;}
        /* Restaurant-ready customer experience */
        .kiosk .menu-toolbar h1 {letter-spacing:-.035em;}
        .kiosk .dish-image.bowlstation-photo {box-shadow:inset 0 0 0 1px #173c9b16;}
        .kiosk .dish-image.bowlstation-photo img {color:transparent;}
        .photo-missing span {font-size:32px;line-height:1;}
        .photo-missing small {font-size:11px;}
        .customer-orders {border:1px solid #dce5f8;border-top:4px solid #ffdd48;background:linear-gradient(135deg,#fff 0%,#f5f8ff 100%);}
        .customer-tracked-order {padding:17px 0;}
        .customer-tracked-order:last-of-type {border-bottom:0;}
        .customer-status-pill.status-ready {background:#ffdd48;color:#173c9b;}
        .customer-status-pill.status-completed {background:#eaf5ef;color:#156b40;}
        .customer-order-steps {position:relative;}
        .customer-order-step {line-height:1.2;}
        .customer-order-step.reached .customer-step-dot {box-shadow:0 0 0 3px rgba(255,221,72,.17);}
        .customer-confirmation-progress {background:#f7f9ff;border-radius:17px;padding:16px 12px;}
        .customer-confirmation-progress p {font-size:13px;}
        .confirmation-panel {max-height:calc(100dvh - 30px);overflow-y:auto;overscroll-behavior:contain;}
        .mobile-drawer {max-height:100dvh;overflow-y:auto;overscroll-behavior:contain;}
        .customer-tracking-privacy {line-height:1.5;}
        .order-allergy-note {margin:4px 0 14px;color:#714d19;background:#fff8df;border:1px solid #f4df8d;border-radius:10px;padding:10px 12px;font-size:11px;line-height:1.5;}
        .guest-label-intro {margin:4px 0 12px;padding:13px 14px;background:#edf3ff;border-left:4px solid #ffdd48;border-radius:12px;color:#173c9b;}
        .guest-label-intro strong {font-size:14px;}
        .guest-label-intro p {margin:6px 0 0;font-size:12px;line-height:1.55;color:#506383;}
        .guest-seat-select {display:block;width:100%;box-sizing:border-box;min-height:46px;border:1px solid #d5ddec;border-radius:11px;padding:10px 12px;background:#fff;color:#1c2d47;font:inherit;font-size:14px;}
        .guest-label-hint {font-size:11px;color:#5f7190;line-height:1.5;margin:7px 0 13px;}
        .customer-order-guest-label {margin:6px 0 0;color:#526585;font-size:12px;font-weight:700;}
        button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {outline:3px solid #ffbc2e;outline-offset:3px;}
        @media(max-width:540px) {
          .customer-orders {padding:17px 13px 11px;margin:16px 0;border-radius:16px;}
          .customer-table-label {padding:7px 9px;font-size:10px;}
          .customer-orders-heading h2 {font-size:20px;}
          .customer-tracked-order {padding:13px 0;}
          .customer-order-step {font-size:9px;gap:6px;}
          .customer-step-dot {width:26px;height:26px;font-size:11px;}
          .customer-confirmation-progress {padding:12px 9px;}
          .confirmation-panel {margin:12px;max-width:calc(100vw - 24px);}
          .order-allergy-note {font-size:11px;}
        }
        @media(prefers-reduced-motion:reduce) { .bowlstation-photo img {transition:none;} }

        /* Separate, accessible fallback control beside the food description. */
        .kiosk .dish-view-photo-cta {display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;width:max-content!important;max-width:100%!important;margin-top:9px!important;padding:8px 12px!important;border:1px solid #c9d7f2!important;border-radius:999px!important;background:#eef3ff!important;color:#173c9b!important;font-size:12px!important;line-height:1.2!important;font-weight:800!important;cursor:pointer!important;pointer-events:auto!important;position:relative!important;z-index:1!important;}
        .kiosk .dish-view-photo-cta:active {background:#ffdd48!important;}
        .kiosk .dish-photo-open {pointer-events:auto!important;z-index:5!important;touch-action:manipulation!important;}
        .food-lightbox-backdrop {z-index:2147483000!important;}
        /* Tap any menu picture for its own full-screen, zoomable product view. */
        .dish-photo-open { position:absolute;inset:0;display:block;width:100%;height:100%;border:0;padding:0;margin:0;background:transparent;color:inherit;cursor:zoom-in;border-radius:inherit;overflow:hidden;-webkit-tap-highlight-color:transparent; }
        .dish-photo-open img { pointer-events:none; }
        .dish-photo-open-hint {position:absolute;right:7px;bottom:7px;border-radius:999px;background:rgba(12,33,88,.85);color:#fff;padding:6px 9px;font-weight:800;font-size:10px;line-height:1.1;letter-spacing:.01em;white-space:nowrap;pointer-events:none;backdrop-filter:blur(6px);}
        .dish-photo-open:focus-visible {outline:3px solid #ffdd48;outline-offset:-4px;}
        .food-lightbox-backdrop {position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:clamp(8px,2vw,24px);background:rgba(5,18,46,.84);backdrop-filter:blur(12px);}
        .food-lightbox {width:min(840px,100%);max-height:calc(100dvh - 18px);display:flex;flex-direction:column;overflow:hidden;border-radius:22px;background:white;color:#173c9b;box-shadow:0 30px 110px #06163c99;}
        .food-lightbox-header {display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px 14px;flex-shrink:0;}
        .food-lightbox-eyebrow {color:#7083ab;font-size:10px;font-weight:900;letter-spacing:.15em;}
        .food-lightbox-header h2 {margin:4px 0 0;font-size:clamp(21px,3vw,30px);line-height:1.1;letter-spacing:-.035em;}
        .food-lightbox-close {display:grid;place-items:center;flex-shrink:0;width:43px;height:43px;border-radius:50%;border:1px solid #dbe4f6;background:#f5f8ff;color:#173c9b;font-size:20px;cursor:pointer;}
        .food-lightbox-stage {position:relative;height:min(55dvh,610px);min-height:110px;flex:1 1 auto;display:grid;place-items:center;overflow:hidden;background:#f4f7fc;touch-action:none;user-select:none;cursor:grab;}
        .food-lightbox-stage:active {cursor:grabbing;}
        .food-lightbox-stage img {width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;pointer-events:none;transform-origin:center;}
        .food-lightbox-missing {padding:24px;text-align:center;color:#526585;}
        .food-lightbox-controls {display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:9px 19px;border-bottom:1px solid #e2e9f4;border-top:1px solid #e2e9f4;color:#6d7e9b;font-size:12px;font-weight:700;flex-shrink:0;}
        .food-lightbox-zoom-buttons {display:flex;align-items:center;gap:7px;}
        .food-lightbox-zoom-buttons button {min-width:34px;height:34px;padding:0 8px;background:#f2f6ff;color:#173c9b;border:1px solid #dce5f7;border-radius:8px;font-size:18px;font-weight:800;cursor:pointer;}
        .food-lightbox-zoom-buttons button:disabled {opacity:.35;cursor:default;}
        .food-lightbox-zoom-buttons output {min-width:45px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums;}
        .food-lightbox-zoom-buttons .food-lightbox-reset {font-size:11px;}
        .food-lightbox-footer {display:flex;align-items:center;justify-content:space-between;gap:18px;padding:15px 22px 18px;flex-shrink:0;}
        .food-lightbox-footer p {flex:1;margin:0;font-size:13px;line-height:1.5;color:#5c6d8a;}
        .food-lightbox-checkout {display:flex;align-items:center;gap:16px;white-space:nowrap;}
        .food-lightbox-checkout strong {font-size:20px;font-weight:900;}
        .food-lightbox-checkout button {border:0;border-radius:11px;background:#ffdd48;color:#173c9b;padding:12px 17px;font-size:13px;font-weight:900;cursor:pointer;}
        @media(max-width:600px) {
          .dish-photo-open-hint {font-size:9px;padding:5px 7px;}
          .food-lightbox {height:calc(100dvh - 20px);border-radius:17px;}
          .food-lightbox-header {padding:14px 15px 12px;}
          .food-lightbox-stage {min-height:0;}
          .food-lightbox-controls {padding:7px 12px;}
          .food-lightbox-controls>span {font-size:10px;}
          .food-lightbox-footer {padding:13px 15px calc(15px + env(safe-area-inset-bottom));align-items:stretch;flex-direction:column;gap:10px;}
          .food-lightbox-checkout {justify-content:space-between;}
        }
        @media(prefers-reduced-motion:reduce) { .dish-photo-open img {transition:none!important;} }

      `}</style>
      {/* Functional application header */}
      <header className="kiosk-header">
        <a className="kiosk-brand" href={`/?table=${Number(table)}`} aria-label="BOWLSTATION — return to your table's menu">
          <span className="brand-symbol">B</span>
          <span>
            <strong>BOWLSTATION</strong>
            <small>GOOD FOOD. GOOD MOOD.</small>
          </span>
        </a>
        <div className="kiosk-header-right">
          <div className="service-indicator">
            <span className="service-dot" />
            DINE IN
          </div>
          <div className="table-number">
            TABLE <strong>{table}</strong>
          </div>
        </div>
      </header>
      <div className="kiosk-layout">
        {/* Left-hand touchscreen categories */}
        <nav className="category-rail" aria-label="Menu categories">
          <div className="rail-label">CATEGORIES</div>
          {categories.map((category) => (
            <button
              key={category.name}
              type="button"
              aria-pressed={selectedCategory === category.name}
              className={
                selectedCategory === category.name
                  ? "rail-category active"
                  : "rail-category"
              }
              onClick={() => setSelectedCategory(category.name)}
            >
              <span className="category-icon">{category.icon}</span>
              <span>{category.name}</span>
            </button>
          ))}
          <div className="rail-help">
            <span>?</span>
            <p>Need help? Ask a staff member.</p>
          </div>
        </nav>
        {/* Menu takes up most of the screen */}
        <main className="menu-panel">
          <div className="menu-toolbar">
            <div>
              <span className="eyebrow">READY WHEN YOU ARE</span>
              <h1>Choose your meal</h1>
              <p>Fresh flavors, your way. Tap + to add a favorite.</p>
            </div>
            <div className="table-service-tag">
              <span>ORDERING FOR</span>
              <strong>TABLE {table}</strong>
            </div>
          </div>
          {myOrders.length > 0 && (
            <section className="customer-orders" aria-label="Your orders for this table">
              <div className="customer-orders-heading">
                <div>
                  <span className="eyebrow">LIVE ORDER UPDATES</span>
                  <h2>Your order tracker</h2>
                </div>
                <span className="customer-table-label">TABLE {table}</span>
              </div>
              {myOrders.map((mine) => (
                <div className="customer-tracked-order" key={mine.id} aria-live="polite" aria-atomic="true">
                  <div className="customer-order-top">
                    <strong>Order #{mine.id}</strong>
                    <span className={`customer-status-pill status-${mine.status.toLowerCase()}`}>{mine.status}</span>
                  </div>
                  {mine.guestLabel && (
                    <p className="customer-order-guest-label">For {mine.guestLabel}</p>
                  )}
                  <CustomerWaitTime order={mine} now={now} />
                  <OrderProgress status={mine.status} />
                  <p className="customer-order-help">
                    {mine.status === "Pending" && "Order received! Your meal is waiting in the kitchen queue."}
                    {mine.status === "Preparing" && "Our kitchen is working on your meal."}
                    {mine.status === "Ready" && "It's ready! Please follow your restaurant's pickup or serving instructions."}
                    {mine.status === "Completed" && "All done. Enjoy your meal! This update will clear in two minutes."}
                  </p>
                </div>
              ))}
              {trackingError && <p className="customer-tracking-warning" role="status">{trackingError}</p>}
              <p className="customer-tracking-privacy">Private to orders placed in this browser for Table {table}. Refreshes automatically.</p>
            </section>
          )}

          <label className="menu-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Search dishes, ingredients, drinks..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search menu"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </label>
          <div className="menu-list-heading">
            <h2>{selectedCategory}</h2>
            <span>{visibleItems.length} ITEMS</span>
          </div>
          {loading && (
            <div className="menu-state" role="status">Getting your menu ready...</div>
          )}
          {menuError && (
            <div className="menu-state error" role="alert">
              {menuError}
            </div>
          )}
          {!loading && !menuError && visibleItems.length === 0 && (
            <div className="menu-state">
              No dishes found. Try another category or search.
            </div>
          )}
          <div className="dish-list">
            {visibleItems.map((item) => {
              const quantity =
                cart.find((entry) => entry.id === item.id)?.quantity || 0;
              return (
                <article className="dish-row" key={item.id}>
                  <DishPhoto item={item} onView={setSelectedPhoto} />
                  <div className="dish-information">
                    <div className="dish-topline">
                      <span>{item.category}</span>
                      {item.label && <em>{item.label}</em>}
                    </div>
                    <h3>{item.name}</h3>
                    <p>{item.description}</p>
                    <strong>{money(item.price)}</strong>
                    {MENU_PHOTOS[item.id] && (
                      <button
                        type="button"
                        className="dish-view-photo-cta"
                        onClick={() => setSelectedPhoto({ item, src: `/menu/${MENU_PHOTOS[item.id]}` })}
                        aria-label={`Enlarge ${item.name} photo`}
                      >
                        ⤢ View larger photo
                      </button>
                    )}
                  </div>
                  <div className="dish-action">
                    {quantity > 0 && (
                      <span className="dish-added">
                        {quantity} IN ORDER
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => addItem(item.id)}
                      aria-label={`Add ${item.name}`}
                    >
                      <span>+</span>
                      <small>ADD</small>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="menu-bottom-note">
            Made fresh, enjoyed together · Prices shown in CAD
          </div>
        </main>
        {/* Order is always visible on desktop */}
        <aside className="cart-sidebar">
          <CartPanel {...cartProps} />
        </aside>
      </div>
      {/* Sticky mobile cart button */}
      <button
        type="button"
        className="mobile-checkout"
        onClick={() => setMobileCart(true)}
      >
        <span>View my order ({count})</span>
        <strong>{money(subtotal)} →</strong>
      </button>
      {mobileCart && (
        <div
          className="mobile-shade"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMobileCart(false);
            }
          }}
        >
          <section
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Your order"
          >
            <button
              type="button"
              className="drawer-close"
              onClick={() => setMobileCart(false)}
            >
              ← Keep browsing
            </button>
            <CartPanel {...cartProps} />
          </section>
        </div>
      )}
      {confirmation && (
        <div className="confirmation-shade">
          <section
            className="confirmation-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="success-title"
          >
            <span className="confirmation-check">✓</span>
            <h2 id="success-title">You're all set!</h2>
            <p>
              Thanks for ordering! Order #{confirmation.id} for {confirmation.customerName} has been sent to the kitchen for Table {confirmation.tableNumber}.
            </p>
            <div className="confirmation-summary">
              <div>
                <span>ORDER NUMBER</span>
                <strong>#{confirmation.id}</strong>
              </div>
              <div>
                <span>ORDER SUBTOTAL</span>
                <strong>{money(confirmation.subtotal)}</strong>
              </div>
              <div>
                <span>STATUS</span>
                <strong>{confirmedStatus?.status || confirmation.status}</strong>
              </div>
            </div>
            <div className="customer-confirmation-progress">
              {confirmedStatus ? (
                <>
                  <CustomerWaitTime order={confirmedStatus} now={now} />
                  <OrderProgress status={confirmedStatus.status} />
                  <p>We'll keep this status up to date. Return to the menu any time to follow your order.</p>
                </>
              ) : (
                <p>Your order has been received, but live tracking isn't available. Ask our team for an update.</p>
              )}
            </div>

            <button
              type="button"
              className="confirmation-primary customer-confirmation-button"
              onClick={() => setConfirmation(null)}
            >
              Continue browsing →
            </button>
          </section>
        </div>
      )}
      {selectedPhoto && (
        <PhotoLightbox
          key={selectedPhoto.item.id}
          photo={selectedPhoto}
          onClose={setSelectedPhoto}
          onAdd={addItem}
        />
      )}
    </div>
  );
}
function CartPanel({
  cartItems,
  count,
  subtotal,
  table,
  name,
  setName,
  seatNumber,
  setSeatNumber,
  notes,
  setNotes,
  busy,
  checkoutError,
  changeQuantity,
  submitOrder,
}) {
  return (
    <div className="cart-panel">
      <div className="cart-panel-header">
        <div>
          <span className="cart-subtitle">YOUR TABLE</span>
          <h2>Order summary</h2>
        </div>
        <span className="cart-table">{table}</span>
      </div>
      <div className="cart-item-list">
        {cartItems.length === 0 ? (
          <div className="cart-empty">
            <div className="empty-tray">▱</div>
            <strong>Your tray is empty</strong>
            <p>Add items from the menu to get started.</p>
          </div>
        ) : (
          cartItems.map((item) => (
            <div className="cart-item" key={item.id}>
              <div className="cart-item-top">
                <strong>{item.name}</strong>
                <span>{money(item.price * item.quantity)}</span>
              </div>
              <div className="cart-item-bottom">
                <span>{money(item.price)} each</span>
                <div className="cart-stepper">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, -1)}
                    aria-label={`Remove one ${item.name}`}
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, 1)}
                    aria-label={`Add one ${item.name}`}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <form className="order-form" onSubmit={submitOrder}>
        <div className="guest-label-intro">
          <strong>Who's ordering?</strong>
          <p>Sharing a table? Each person can place their own order. Add a first name or seat number so our team knows who to serve.</p>
        </div>
        <label htmlFor="guest-name">First name</label>
        <input
          id="guest-name"
          placeholder="e.g. Alex"
          autoComplete="given-name"
          value={name}
          maxLength={35}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="guest-seat">Seat number (optional)</label>
        <select
          id="guest-seat"
          className="guest-seat-select"
          value={seatNumber}
          onChange={(event) => setSeatNumber(event.target.value)}
        >
          <option value="">Choose a seat, if you know it</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={String(index + 1)}>
              Seat {index + 1}
            </option>
          ))}
        </select>
        <p className="guest-label-hint">Enter a first name or choose a seat to place an order.</p>
        <label htmlFor="order-notes">Special instructions (optional)</label>
        <textarea
          id="order-notes"
          rows={2}
          placeholder="No onions, extra sauce..."
          value={notes}
          maxLength={300}
          onChange={(event) => setNotes(event.target.value)}
        />
        <p className="order-allergy-note">Food allergy? Please speak to a team member before ordering.</p>
        <div className="cart-bill">
          <div>
            <span>Items</span>
            <strong>{count}</strong>
          </div>
          <div className="bill-total">
            <span>Subtotal</span>
            <strong>{money(subtotal)}</strong>
          </div>
          <p>Taxes are not included in this subtotal. Online payment is not available.</p>
        </div>
        {checkoutError && (
          <p className="form-error" role="alert">
            {checkoutError}
          </p>
        )}
        <button
          type="submit"
          className="submit-order"
          disabled={!cartItems.length || busy}
        >
          {busy ? "Placing your order..." : "Place order"}
          <span>→</span>
        </button>
      </form>
    </div>
  );
}
