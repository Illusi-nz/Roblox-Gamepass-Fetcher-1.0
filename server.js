import express from "express";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "2mb" }));

// -------------------------
// Persistent cache
// -------------------------
const CACHE_FILE = "./cache.json";
const cache = new Map();
const CACHE_TTL = 7 * 60 * 1000; // 7 minutes

function saveCacheToDisk() {
  const obj = {};
  for (const [k, v] of cache.entries()) {
    obj[k] = v;
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf8");
  console.log("💾 Cache saved to disk");
}

function loadCacheFromDisk() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = fs.readFileSync(CACHE_FILE, "utf8");
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        cache.set(k, v);
      }
      console.log(`📂 Loaded ${cache.size} cache entries from disk`);
    } catch (e) {
      console.error("⚠️ Failed to load cache file:", e);
    }
  }
}

function setCache(key, value) {
  cache.set(key, { ...value, expires: Date.now() + CACHE_TTL });
  saveCacheToDisk();
}

function getCache(key) {
  const c = cache.get(key);
  if (!c) return null;
  if (Date.now() > c.expires) {
    cache.delete(key);
    saveCacheToDisk();
    return null;
  }
  return c;
}

// -------------------------
// Helper: fetch all pages
// -------------------------
async function fetchAllPages(url) {
  let results = [];
  let cursor = null;
  do {
    const fullUrl = cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url;
    const res = await fetch(fullUrl);
    if (!res.ok) {
      console.error(`❌ Failed request: ${res.status} ${res.statusText}`);
      break;
    }
    const data = await res.json();
    if (data?.data?.length) results = results.concat(data.data);
    cursor = data.nextPageCursor || null;
  } while (cursor);
  return results;
}

// -------------------------
// GET: all passes for user
// -------------------------
app.get("/gamepasses/:userId", async (req, res) => {
  const { userId } = req.params;

  const cached = getCache(userId);
  if (cached) {
    console.log(`⚡ Cache hit for user ${userId} (passes: ${cached.passes.length})`);
    return res.json(cached);
  }

  try {
    const gamesUrl = `https://games.roproxy.com/v2/users/${userId}/games?limit=50`;
    const games = await fetchAllPages(gamesUrl);

    let passes = [];
    for (const game of games) {
      const passesUrl = `https://games.roproxy.com/v1/games/${game.id}/game-passes?limit=50`;
      const gamePasses = await fetchAllPages(passesUrl);

      passes = passes.concat(
        gamePasses.map((p) => ({
          id: p.id,
          name: p.name,
          gameId: game.id,
          gameName: game.name,
          description: null,
          price: null,
        }))
      );
    }

    const result = { userId, passes };
    setCache(userId, result);
    console.log(`🗂️ Cached base data for user ${userId} (passes: ${passes.length})`);
    res.json(result);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// -------------------------
// POST: bulk enrich cache
// -------------------------
app.post("/update-passes", (req, res) => {
  const { userId, passes } = req.body || {};

  if (!userId || !Array.isArray(passes)) {
    return res.status(400).json({ error: "Missing userId or passes array" });
  }

  const cached = getCache(userId);
  if (!cached) {
    // 🚫 Option 1: require GET first
    return res.status(404).json({ error: "No cached passes for this userId — call GET first" });
  }

  const index = new Map(cached.passes.map((p) => [String(p.id), p]));
  let updatedCount = 0;

  for (const upd of passes) {
    const pass = index.get(String(upd.id));
    if (!pass) continue;

    if ("description" in upd) pass.description = upd.description;
    if ("price" in upd) pass.price = upd.price;

    updatedCount++;
  }

  setCache(userId, cached);
  console.log(`🔄 Bulk update for user ${userId}: ${updatedCount} passes enriched`);
  res.json({ ok: true, updated: updatedCount, total: cached.passes.length });
});

// -------------------------
loadCacheFromDisk();
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
