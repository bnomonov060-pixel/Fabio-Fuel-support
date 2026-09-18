const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// =========================
// ENV
// =========================

const BOT_TOKEN = process.env.BOT_TOKEN;
const SAMSARA_TOKEN = process.env.SAMSARA_TOKEN;
const GROUP_ID = process.env.GROUP_ID;

// Low fuel threshold
const THRESHOLD = Number(
  process.env.THRESHOLD || 50
);

// Check every 30 seconds
const CHECK_INTERVAL = 30 * 1000;

// =========================
// FUEL SETTINGS
// =========================

// Used only for calculation
// Not shown in Telegram message
const DEFAULT_TANK_GALLONS = 120;

// Average fuel economy
const DEFAULT_MPG = 7;

// =========================
// CHECK ENV
// =========================

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}

if (!SAMSARA_TOKEN) {
  console.log("❌ SAMSARA_TOKEN missing");
  process.exit(1);
}

if (!GROUP_ID) {
  console.log("❌ GROUP_ID missing");
  process.exit(1);
}

// =========================
// TELEGRAM BOT
// =========================

const bot = new TelegramBot(
  BOT_TOKEN,
  {
    polling: true,
  }
);

console.log("🚀 FuelBot Started");

// =========================
// ALERT CACHE
// =========================

// Prevent duplicate alerts
const alerted = {};

// =========================
// COMMANDS
// =========================

bot.onText(
  /\/start/,
  async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "✅ FuelBot Active"
    );
  }
);

bot.onText(
  /\/ping/,
  async (msg) => {
    await bot.sendMessage(
      msg.chat.id,
      "🏓 Pong"
    );
  }
);

bot.onText(
  /\/check/,
  async (msg) => {

    await bot.sendMessage(
      msg.chat.id,
      "⏳ Manual check started..."
    );

    await checkFuel();

    await bot.sendMessage(
      msg.chat.id,
      "✅ Check completed"
    );
  }
);

// =========================
// FETCH VEHICLES
// =========================

async function fetchVehicles() {

  try {

    const response =
      await axios.get(
        "https://api.samsara.com/fleet/vehicles/stats",
        {
          headers: {
            Authorization:
              `Bearer ${SAMSARA_TOKEN}`,
          },

          params: {
            types:
              "fuelPercents,gps",
          },

          timeout: 20000,
        }
      );

    return (
      response.data?.data || []
    );

  } catch (error) {

    console.log(
      "❌ SAMSARA ERROR:",
      error.response?.data ||
      error.message
    );

    return [];
  }
}

// =========================
// GET FUEL
// =========================

function getFuel(vehicle) {

  // Object format
  if (
    vehicle?.fuelPercent &&
    vehicle.fuelPercent.value != null
  ) {

    return vehicle
      .fuelPercent
      .value;
  }

  // Array format
  if (
    Array.isArray(
      vehicle?.fuelPercents
    ) &&
    vehicle.fuelPercents.length > 0
  ) {

    const latest =
      vehicle.fuelPercents.sort(
        (a, b) =>
          new Date(b.time) -
          new Date(a.time)
      )[0];

    return (
      latest?.value ??
      null
    );
  }

  return null;
}

// =========================
// CALCULATE FUEL RANGE
// =========================

function calculateFuelRange(
  fuelPercent
) {

  // Remaining gallons
  const gallonsRemaining =
    DEFAULT_TANK_GALLONS *
    (fuelPercent / 100);

  // Estimated miles
  const estimatedMiles =
    gallonsRemaining *
    DEFAULT_MPG;

  return {

    gallonsRemaining:
      Math.round(
        gallonsRemaining * 10
      ) / 10,

    estimatedMiles:
      Math.round(
        estimatedMiles
      ),
  };
}

// =========================
// SEND LOW FUEL ALERT
// =========================

async function sendAlert(
  name,
  fuel,
  vehicle
) {

  try {

    // =========================
    // GPS
    // =========================

    let lat = "Unknown";
    let lon = "Unknown";

    if (
      vehicle?.gps &&
      vehicle.gps.latitude != null &&
      vehicle.gps.longitude != null
    ) {

      lat =
        vehicle.gps.latitude;

      lon =
        vehicle.gps.longitude;
    }

    // =========================
    // FUEL CALCULATION
    // =========================

    const range =
      calculateFuelRange(
        fuel
      );

    const gallonsRemaining =
      range.gallonsRemaining;

    const estimatedMiles =
      range.estimatedMiles;

    // =========================
    // STATUS
    // =========================

    const status =
      vehicle?.gps
        ? "ACTIVE"
        : "UNKNOWN";

    // =========================
    // UPDATED TIME
    // =========================

    const updated =
      new Date().toLocaleString();

    // =========================
    // TELEGRAM MESSAGE
    // =========================

    const text =
`🚨 LOW FUEL ALERT

🚛 Unit: ${name}

⛽ Fuel: ${fuel}%

🛢 Fuel Remaining: ${gallonsRemaining} gallons left 🛢️

📊 Fuel Economy: ${DEFAULT_MPG} MPG

🛣 Estimated Range: ${estimatedMiles} miles

📍 GPS: ${lat}, ${lon}

🚦 Status: ${status}

⚠️ Immediate refuel recommended

🕒 Updated: ${updated}

FuelBot Monitoring System`;

    // =========================
    // SEND MESSAGE
    // =========================

    await bot.sendMessage(
      GROUP_ID,
      text
    );

    console.log(
      `✅ ALERT SENT: ${name} | ` +
      `${fuel}% | ` +
      `${gallonsRemaining} gallons | ` +
      `${estimatedMiles} miles`
    );

  } catch (error) {

    console.log(
      "❌ TELEGRAM ERROR:",
      error.response?.data ||
      error.message
    );
  }
}

// =========================
// MAIN FUEL CHECKER
// =========================

async function checkFuel() {

  console.log(
    "⏳ Checking fuel..."
  );

  const vehicles =
    await fetchVehicles();

  console.log(
    `🚚 Vehicles found: ${vehicles.length}`
  );

  // =========================
  // LOOP THROUGH TRUCKS
  // =========================

  for (
    const vehicle of vehicles
  ) {

    try {

      // =========================
      // VEHICLE INFO
      // =========================

      const id =
        vehicle.id;

      const name =
        vehicle.name ||
        "Unknown Unit";

      // =========================
      // GET FUEL
      // =========================

      const fuel =
        getFuel(vehicle);

      // =========================
      // NO FUEL DATA
      // =========================

      if (fuel == null) {

        console.log(
          `⚠️ ${name}: no fuel data`
        );

        continue;
      }

      // =========================
      // ROUND FUEL %
      // =========================

      const fuelRounded =
        Math.round(fuel);

      // =========================
      // CALCULATE RANGE
      // =========================

      const range =
        calculateFuelRange(
          fuelRounded
        );

      console.log(
        `⛽ ${name}: ` +
        `${fuelRounded}% | ` +
        `${range.gallonsRemaining} gallons | ` +
        `${range.estimatedMiles} miles`
      );

      // =========================
      // LOW FUEL ALERT
      // =========================

      if (
        fuelRounded <=
        THRESHOLD
      ) {

        // Send only once
        if (!alerted[id]) {

          await sendAlert(
            name,
            fuelRounded,
            vehicle
          );

          alerted[id] = true;

          // Anti-flood delay
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                1500
              )
          );
        }

      } else {

        // Reset alert
        // Once fuel goes above threshold
        alerted[id] = false;
      }

    } catch (err) {

      console.log(
        "❌ VEHICLE ERROR:",
        err.message
      );
    }
  }

  console.log(
    "✅ Check finished"
  );
}

// =========================
// SAFE MONITORING LOOP
// =========================

async function startMonitoring() {

  while (true) {

    try {

      await checkFuel();

    } catch (err) {

      console.log(
        "❌ MONITOR ERROR:",
        err.message
      );
    }

    console.log(
      "⏳ Waiting 30 seconds..."
    );

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          CHECK_INTERVAL
        )
    );
  }
}

// =========================
// START BOT
// =========================

startMonitoring();