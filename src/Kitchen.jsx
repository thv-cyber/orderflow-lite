
import { useCallback, useEffect, useState } from "react";
import "./Kitchen.css";

const STATUSES = ["Pending", "Preparing", "Ready", "Completed"];
const FILTERS = ["Active", "All", ...STATUSES];

function formatMoney(amount) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number(amount) || 0);
}

function formatElapsed(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";

  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = String(seconds % 60).padStart(2, "0");

  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${remaining}`;
}

function orderElapsed(order, now) {
  const start = order.createdAtMs;

  const end =
    order.status === "Ready" || order.status === "Completed"
      ? order.readyAtMs
      : now;

  return Number.isFinite(start) &&
    start > 0 &&
    Number.isFinite(end) &&
    end > 0
    ? end - start
    : null;
}

function prepElapsed(order, now) {
  if (order.status === "Pending") return null;

  const start = order.preparingAtMs;

  if (!Number.isFinite(start) || start <= 0) return null;

  const end = order.status === "Preparing" ? now : order.readyAtMs;

  return Number.isFinite(end) && end > 0 ? end - start : null;
}

function waitLevel(milliseconds) {
  if (!Number.isFinite(milliseconds)) {
    return { label: "Time unavailable", level: "neutral" };
  }

  if (milliseconds >= 10 * 60 * 1000) {
    return { label: "Priority", level: "priority" };
  }

  if (milliseconds >= 5 * 60 * 1000) {
    return { label: "Needs attention", level: "attention" };
  }

  return { label: "On track", level: "on-track" };
}

function orderClockTime(order) {
  const timestamp = order.createdAtMs;

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Time unavailable";
  }

  return new Date(timestamp).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function KitchenTicket({
  order,
  now,
  processing,
  busy,
  onAdvance,
}) {
  const readyOrDone =
    order.status === "Ready" || order.status === "Completed";

  const totalElapsed = orderElapsed(order, now);
  const cookingElapsed = prepElapsed(order, now);
  const attention = waitLevel(totalElapsed);

  const nextStatus = STATUSES[STATUSES.indexOf(order.status) + 1];

  const itemList = Array.isArray(order.items)
    ? order.items
    : [];

  const totalUnits = itemList.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  return (
    <article
      className={`ks-ticket ks-ticket--${order.status.toLowerCase()}`}
    >
      {/* TABLE AND GUEST */}
      <div className="ks-ticket__header">
        <div className="ks-ticket__identification">
          <span className="ks-ticket__eyebrow">
            ORDER #{order.id}
          </span>

          <h3>Table {order.tableNumber}</h3>

          <p className="ks-ticket__guest">
            <strong>{order.customerName || "Guest"}</strong>
            <span> · {orderClockTime(order)}</span>
          </p>
        </div>

        <span
          className={`ks-status ks-status--${order.status.toLowerCase()}`}
        >
          {order.status}
        </span>
      </div>

      {/* FOOD FIRST — MAIN FOCUS */}
      <section
        className="ks-ticket__items"
        aria-label={`Food items for order ${order.id}`}
      >
        <div className="ks-ticket__items-heading">
          <span>TO PREPARE</span>

          <strong>
            {totalUnits} {totalUnits === 1 ? "ITEM" : "ITEMS"}
          </strong>
        </div>

        {itemList.length ? (
          <div className="ks-ticket__item-list">
            {itemList.map((item, index) => (
              <div
                className="ks-ticket__item"
                key={`${order.id}-${item.id ?? index}-${index}`}
              >
                <span className="ks-quantity">
                  {item.quantity}×
                </span>

                <strong className="ks-ticket__itemname">
                  {item.name}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="ks-ticket__no-items">
            No order items received.
          </p>
        )}

        {/* SPECIAL REQUESTS */}
        {order.notes && (
          <div className="ks-kitchen-notes" role="note">
            <strong>⚠ SPECIAL INSTRUCTIONS</strong>
            <p>{order.notes}</p>
          </div>
        )}
      </section>

      {/* COMPACT TIMERS */}
      <div
        className="ks-timers"
        aria-label={`Timers for order ${order.id}`}
      >
        <div className="ks-timer ks-timer--primary">
          <span className="ks-timer__label">
            ◷ {readyOrDone ? "TIME TO READY" : "TOTAL WAIT"}
          </span>

          <strong className="ks-timer__value">
            {formatElapsed(totalElapsed)}
          </strong>

          <span
            className={`ks-timer__health ks-timer__health--${
              readyOrDone ? "neutral" : attention.level
            }`}
          >
            {readyOrDone ? "Stopped" : attention.label}
          </span>
        </div>

        <div className="ks-timer ks-timer--secondary">
          <span className="ks-timer__label">
            PREP TIME
          </span>

          <strong className="ks-timer__value">
            {formatElapsed(cookingElapsed)}
          </strong>

          <span className="ks-timer__caption">
            {order.status === "Pending"
              ? "Not started"
              : order.status === "Preparing"
              ? "Cooking now"
              : "Final time"}
          </span>
        </div>
      </div>

      {/* STATUS ACTION */}
      <div className="ks-ticket__footer">
        <div className="ks-ticket__subtotal">
          <span>SUBTOTAL</span>
          <strong>{formatMoney(order.subtotal)}</strong>
        </div>

        {nextStatus ? (
          <button
            type="button"
            className={`ks-advance ${
              nextStatus === "Completed"
                ? "ks-advance--secondary"
                : ""
            }`}
            disabled={busy}
            onClick={() => onAdvance(order, nextStatus)}
          >
            {processing
              ? "Updating..."
              : `Mark ${nextStatus} →`}
          </button>
        ) : (
          <span className="ks-ticket__completed">
            ✓ Order complete
          </span>
        )}
      </div>
    </article>
  );
}

async function readApiJson(response) {
  let body = {};

  try {
    body = await response.json();
  } catch {
    // The server may return a non-JSON error response.
  }

  if (!response.ok) {
    const error = new Error(
      body.error || `Request failed (${response.status}).`
    );

    error.status = response.status;
    throw error;
  }

  return body;
}

export default function Kitchen() {
  const [auth, setAuth] = useState("checking");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [orders, setOrders] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [boardError, setBoardError] = useState("");
  const [activeFilter, setActiveFilter] = useState("Active");
  const [updatingId, setUpdatingId] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Check staff authentication.
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const result = await readApiJson(
          await fetch("/api/staff/session", {
            credentials: "same-origin",
            cache: "no-store",
          })
        );

        if (!cancelled) {
          setAuth(
            result.authenticated
              ? "signed-in"
              : "signed-out"
          );
        }
      } catch {
        if (!cancelled) {
          setAuth("signed-out");
          setLoginError(
            "Can't reach the server. Check that the backend is running."
          );
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Read kitchen orders.
  const fetchOrders = useCallback(async (showSpinner = false) => {
    if (showSpinner) setFetching(true);

    try {
      const data = await readApiJson(
        await fetch("/api/orders", {
          credentials: "same-origin",
          cache: "no-store",
        })
      );

      setOrders(
        Array.isArray(data.orders) ? data.orders : []
      );

      setBoardError("");
    } catch (error) {
      if (error.status === 401) {
        setOrders([]);
        setAuth("signed-out");
        setLoginError(
          "Your staff session expired. Please sign in again."
        );
      } else {
        setBoardError(
          error.message || "Couldn't refresh orders."
        );
      }
    } finally {
      if (showSpinner) setFetching(false);
    }
  }, []);

  // Refresh kitchen queue every 12 seconds.
  useEffect(() => {
    if (auth !== "signed-in") return;

    fetchOrders(true);

    const interval = window.setInterval(
      () => fetchOrders(),
      12000
    );

    return () => window.clearInterval(interval);
  }, [auth, fetchOrders]);

  // Update timers every second.
  useEffect(() => {
    if (auth !== "signed-in") return;

    const clock = window.setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => window.clearInterval(clock);
  }, [auth]);

  async function signIn(event) {
    event.preventDefault();

    if (loginBusy) return;

    setLoginBusy(true);
    setLoginError("");

    try {
      const result = await readApiJson(
        await fetch("/api/staff/login", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password }),
        })
      );

      if (!result.authenticated) {
        throw new Error("Staff login failed.");
      }

      setPassword("");
      setAuth("signed-in");
    } catch (error) {
      setLoginError(
        error.message ||
          "Sign-in failed. Please try again."
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOut() {
    try {
      await readApiJson(
        await fetch("/api/staff/logout", {
          method: "POST",
          credentials: "same-origin",
        })
      );

      setOrders([]);
      setPassword("");
      setBoardError("");
      setAuth("signed-out");
    } catch (error) {
      setBoardError(
        error.message ||
          "Couldn't sign out. Please try again."
      );
    }
  }

  async function advanceStatus(order, status) {
    if (updatingId !== null) return;

    setUpdatingId(order.id);
    setBoardError("");

    try {
      const result = await readApiJson(
        await fetch(`/api/orders/${order.id}/status`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        })
      );

      if (result.order) {
        setOrders((previous) =>
          previous.map((entry) =>
            entry.id === order.id
              ? result.order
              : entry
          )
        );
      }

      await fetchOrders();
    } catch (error) {
      if (error.status === 401) {
        setAuth("signed-out");
        setOrders([]);
      } else {
        setBoardError(
          error.message ||
            "Couldn't update the order. Please refresh."
        );

        await fetchOrders();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  // Staff session loading screen.
  if (auth === "checking") {
    return (
      <main className="ks-login-page">
        <div
          className="ks-login-card ks-login-card--loading"
          role="status"
        >
          <div className="ks-login-logo">B</div>
          <h1>Opening kitchen...</h1>
          <p>Checking your staff session.</p>
        </div>
      </main>
    );
  }

  // Staff login.
  if (auth === "signed-out") {
    return (
      <main className="ks-login-page">
        <section
          className="ks-login-card"
          aria-labelledby="ks-login-title"
        >
          <div className="ks-login-topline">
            BOWLSTATION / TEAM ACCESS
          </div>

          <div className="ks-login-logo">B</div>

          <h1 id="ks-login-title">
            Welcome back.
          </h1>

          <p>
            Sign in to manage incoming orders and
            kitchen preparation.
          </p>

          <form onSubmit={signIn}>
            <label htmlFor="ks-password">
              Staff password
            </label>

            <input
              id="ks-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Enter staff password"
              required
            />

            {loginError && (
              <p
                className="ks-login-error"
                role="alert"
              >
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loginBusy || !password}
            >
              {loginBusy
                ? "Signing in..."
                : "Open kitchen dashboard →"}
            </button>
          </form>

          <small>
            For authorized BOWLSTATION staff only.
          </small>
        </section>
      </main>
    );
  }

  const active = orders.filter(
    (order) => order.status !== "Completed"
  );

  const pending = orders.filter(
    (order) => order.status === "Pending"
  );

  const ready = orders.filter(
    (order) => order.status === "Ready"
  );

  // Show the oldest active orders first.
  const shown = orders
    .filter((order) =>
      activeFilter === "All"
        ? true
        : activeFilter === "Active"
        ? order.status !== "Completed"
        : order.status === activeFilter
    )
    .sort((a, b) => {
      // Completed orders: newest first.
      if (
        a.status === "Completed" &&
        b.status === "Completed"
      ) {
        return (
          (b.createdAtMs || 0) -
          (a.createdAtMs || 0)
        );
      }

      if (a.status === "Completed") return 1;
      if (b.status === "Completed") return -1;

      return (
        (a.createdAtMs || 0) -
        (b.createdAtMs || 0)
      );
    });

  return (
    <main className="kitchen-page">
      <div className="ks-shell">
        <header className="ks-header">
          <div>
            <p className="ks-eyebrow">
              BOWLSTATION / STAFF WORKSPACE
            </p>

            <h1>
              Kitchen <span>Display</span>
            </h1>

            <p className="ks-header__subtitle">
              Incoming orders, clear prep instructions,
              live wait times.
            </p>
          </div>

          <div className="ks-header__actions">
            <button
              type="button"
              className="ks-button"
              onClick={() => fetchOrders(true)}
              disabled={fetching}
            >
              ↻ {fetching
                ? "Refreshing..."
                : "Refresh orders"}
            </button>

            <button
              type="button"
              className="ks-button ks-button--danger"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <section
          className="ks-metrics"
          aria-label="Kitchen summary"
        >
          <div className="ks-metric">
            <span>ACTIVE ORDERS</span>
            <strong>{active.length}</strong>
          </div>

          <div className="ks-metric">
            <span>WAITING</span>
            <strong>{pending.length}</strong>
          </div>

          <div className="ks-metric">
            <span>READY FOR PICKUP</span>
            <strong>{ready.length}</strong>
          </div>
        </section>

        <div className="ks-board-heading">
          <h2>
            Order Board<span>.</span>
          </h2>

          <p>
            Live timers · Orders refresh every 12 seconds
          </p>
        </div>

        {boardError && (
          <div
            className="ks-board-error"
            role="alert"
          >
            {boardError}
          </div>
        )}

        <div
          className="ks-filters"
          role="group"
          aria-label="Filter kitchen orders"
        >
          {FILTERS.map((filter) => (
            <button
              type="button"
              key={filter}
              className={
                activeFilter === filter
                  ? "ks-filter ks-filter--active"
                  : "ks-filter"
              }
              aria-pressed={activeFilter === filter}
              onClick={() =>
                setActiveFilter(filter)
              }
            >
              {filter}
            </button>
          ))}
        </div>

        {shown.length ? (
          <div className="ks-ticket-grid">
            {shown.map((order) => (
              <KitchenTicket
                key={order.id}
                order={order}
                now={now}
                processing={
                  updatingId === order.id
                }
                busy={
                  updatingId !== null
                }
                onAdvance={advanceStatus}
              />
            ))}
          </div>
        ) : (
          <div className="ks-empty-state">
            <span aria-hidden="true">✓</span>

            <h3>
              {fetching
                ? "Loading orders..."
                : "You're all caught up"}
            </h3>

            <p>
              No orders match this view. New orders
              will appear here automatically.
            </p>
          </div>
        )}

        <footer className="ks-footer">
          Wait-time guide:{" "}
          <strong>0–5 min</strong> on track ·{" "}
          <strong>5–10 min</strong> needs attention ·{" "}
          <strong>10+ min</strong> priority.
          Indicators are guidelines, not guaranteed
          preparation times.
        </footer>
      </div>
    </main>
  );
}
