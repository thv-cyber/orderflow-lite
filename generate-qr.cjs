
const QRCode = require("qrcode");
const fs = require("node:fs/promises");
const path = require("node:path");

const TOTAL_TABLES = 20;

// The website address is supplied when running the script.
// That way we can generate local testing codes now
// and production codes when the app is deployed.
const websiteAddress = process.argv[2];

if (!websiteAddress) {
  console.error(`
Please provide the website address.

Example:
node generate-qr.cjs http://192.168.1.50:5173

Use your computer's actual local IP address.
  `);

  process.exit(1);
}

let baseUrl;

try {
  baseUrl = new URL(websiteAddress);

  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS are supported.");
  }

  // Always link to the customer menu, not /kitchen.
  baseUrl.pathname = "/";
  baseUrl.search = "";
  baseUrl.hash = "";
} catch {
  console.error("Please enter a valid http:// or https:// address.");
  process.exit(1);
}

const publicFolder = path.join(__dirname, "public");
const qrFolder = path.join(publicFolder, "qr");

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });
}

// Create the unique URL for one table
function getTableUrl(table) {
  const url = new URL(baseUrl.toString());
  url.searchParams.set("table", String(table));
  return url.toString();
}

// Build one printable card
function makeCard(table) {
  const number = String(table).padStart(2, "0");
  const url = getTableUrl(table);

  return `
    <article class="table-card">
      <div class="card-top">
        <div class="brand">
          <span class="brand-icon">B</span>
          <span>BOWLSTATION</span>
        </div>

        <span class="service-label">DINE IN</span>
      </div>

      <div class="table-info">
        <span>YOU'RE SITTING AT</span>
        <h2>TABLE ${number}</h2>
        <p>Hungry? Your menu is one scan away.</p>
      </div>

      <div class="qr-area">
        <img
          src="qr/table-${number}.png"
          alt="QR code for Table ${number}"
          width="180"
          height="180"
        />
        <span>SCAN TO ORDER</span>
      </div>

      <div class="card-bottom">
        <p>
          Browse the menu. Build your order.
          We'll take it from there.
        </p>

        <a href="${escapeHtml(url)}">
          OPEN MENU ↗
        </a>
      </div>
    </article>
  `;
}

// Create a complete printable HTML page
function makeHtml(cards) {
  const escapedSite = escapeHtml(baseUrl.toString());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>BOWLSTATION — Table QR Codes</title>

  <style>
    :root {
      font-family: Arial, Helvetica, sans-serif;
      color: #172b4c;
      background: #eef3fb;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 26px 5%;
      background: #173c9b;
      color: white;
    }

    .page-header h1 {
      margin: 0 0 6px;
      font-size: 26px;
    }

    .page-header p {
      margin: 0;
      color: #dce5fb;
      font-size: 13px;
    }

    .print-button {
      flex-shrink: 0;
      padding: 13px 20px;
      border: 0;
      border-radius: 9px;
      background: #ffdd48;
      color: #173c9b;
      font-weight: 800;
      cursor: pointer;
    }

    .info {
      max-width: 1300px;
      margin: 22px auto;
      padding: 0 22px;
      color: #617594;
      font-size: 13px;
      overflow-wrap: anywhere;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 22px;
      max-width: 1300px;
      margin: auto;
      padding: 12px 22px 60px;
    }

    .table-card {
      overflow: hidden;
      border: 2px solid #173c9b;
      border-radius: 16px;
      background: #ffffff;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 15px;
      background: #173c9b;
      color: #ffffff;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }

    .brand-icon {
      display: grid;
      place-items: center;
      width: 27px;
      height: 27px;
      border-radius: 7px;
      background: #ffdd48;
      color: #173c9b;
      font-size: 17px;
      font-weight: 900;
    }

    .service-label {
      color: #ffdd48;
      font-size: 9px;
      font-weight: 800;
      white-space: nowrap;
    }

    .table-info {
      padding: 21px 15px 5px;
      text-align: center;
    }

    .table-info > span {
      color: #7087aa;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
    }

    .table-info h2 {
      margin: 7px 0;
      font-size: 36px;
      color: #173c9b;
      letter-spacing: -1.5px;
    }

    .table-info p {
      margin: 0;
      color: #71829b;
      font-size: 12px;
    }

    .qr-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin: 15px auto;
    }

    .qr-area img {
      display: block;
      width: 180px;
      height: 180px;
      max-width: 90%;
    }

    .qr-area span {
      padding: 10px 16px;
      border-radius: 7px;
      background: #ffdd48;
      color: #173c9b;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1px;
    }

    .card-bottom {
      padding: 0 20px 19px;
      text-align: center;
    }

    .card-bottom p {
      color: #7387a3;
      font-size: 11px;
      line-height: 1.6;
    }

    .card-bottom a {
      display: inline-block;
      padding: 9px 11px;
      color: #173c9b;
      font-size: 11px;
      font-weight: 800;
    }

    @media (max-width: 850px) {
      .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 540px) {
      .cards {
        grid-template-columns: 1fr;
        max-width: 380px;
      }

      .page-header {
        flex-direction: column;
        align-items: flex-start;
      }
    }

    @media print {
      @page {
        size: letter;
        margin: 10mm;
      }

      html,
      body {
        background: white;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      .page-header,
      .info {
        display: none;
      }

      .cards {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        padding: 0;
        max-width: none;
      }

      .table-card {
        border-radius: 0;
      }

      .table-info {
        padding-top: 12px;
      }

      .table-info h2 {
        font-size: 28px;
      }

      .qr-area {
        margin: 8px auto;
      }

      .qr-area img {
        width: 135px;
        height: 135px;
      }

      .card-bottom {
        padding-bottom: 12px;
      }
    }
  </style>
</head>

<body>
  <header class="page-header">
    <div>
      <h1>BOWLSTATION / TABLE CODES</h1>
      <p>
        20 unique QR codes for our fictional restaurant.
      </p>
    </div>

    <button
      class="print-button"
      type="button"
      onclick="window.print()"
    >
      PRINT TABLE CARDS
    </button>
  </header>

  <p class="info">
    These codes currently open:
    <strong>${escapedSite}</strong>.
    Regenerate them if your website address changes.
  </p>

  <main class="cards">
    ${cards.join("\n")}
  </main>
</body>
</html>`;
}

async function generate() {
  await fs.mkdir(qrFolder, { recursive: true });

  const cards = [];

  for (let table = 1; table <= TOTAL_TABLES; table++) {
    const number = String(table).padStart(2, "0");

    const imagePath = path.join(
      qrFolder,
      `table-${number}.png`
    );

    // Create a high-contrast, scannable QR code
    await QRCode.toFile(imagePath, getTableUrl(table), {
      errorCorrectionLevel: "H",
      width: 420,
      margin: 4,
      color: {
        dark: "#102C77",
        light: "#FFFFFFFF",
      },
    });

    cards.push(makeCard(table));

    console.log(
      `Table ${number} → ${getTableUrl(table)}`
    );
  }

  // Save a printable page in Vite's public folder
  const htmlPath = path.join(
    publicFolder,
    "table-qr-codes.html"
  );

  await fs.writeFile(
    htmlPath,
    makeHtml(cards),
    "utf8"
  );

  console.log(`
SUCCESS! Created ${TOTAL_TABLES} table QR codes.

Images:
public/qr/

Printable page:
public/table-qr-codes.html

Open your Vite site at:
/table-qr-codes.html
  `);
}

generate().catch((error) => {
  console.error("QR code generation failed:", error);
  process.exit(1);
});
