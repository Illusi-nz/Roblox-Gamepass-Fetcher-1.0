import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

app.use(express.json()); // ✅ allow JSON POST bodies

// -------------------------
// Simple in-memory cache
// -------------------------
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function setCache(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL });
}

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expires) {
    cache.delete(key); // expired
    return null;
  }
  return cached.value;
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
    if (data.data) {
      results = results.concat(data.data);
    }

    cursor = data.nextPageCursor || null;
  } while (cursor);

  return results;
}

// -------------------------
// Route: get ALL passes for user
// -------------------------
app.get("/gamepasses/:userId", async (req, res) => {
  const { userId } = req.params;

  // ✅ Check cache
  const cached = getCache(userId);
  if (cached) {
    console.log(`⚡ Cache hit for user ${userId}`);
    return res.json(cached);
  }

  try {
    // Step 1: Fetch ALL games owned by this user
    const gamesUrl = `https://games.roproxy.com/v2/users/${userId}/games?limit=50`;
    const games = await fetchAllPages(gamesUrl);

    if (games.length === 0) {
      const result = { userId, passes: [] };
      setCache(userId, result);
      return res.json(result);
    }

    let passes = [];

    // Step 2: For each game, fetch ALL passes
    for (const game of games) {
      const passesUrl = `https://games.roproxy.com/v1/games/${game.id}/game-passes?limit=50`;
      const gamePasses = await fetchAllPages(passesUrl);

      const detailedPasses = gamePasses.map((p) => ({
        id: p.id,
        name: p.name,
        gameId: game.id,
        gameName: game.name,
        description: null, // initially empty
        price: null,       // initially empty
      }));

      passes = passes.concat(detailedPasses);
    }

    const result = { userId, passes };

    // ✅ Save to cache
    setCache(userId, result);

    res.json(result);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// -------------------------
// Route: update pass info
// -------------------------
app.post("/update-pass", (req, res) => {
  const { userId, passes } = req.body;

  if (!userId || !Array.isArray(passes)) {
    return res.status(400).json({ error: "Missing userId or passes array" });
  }

  const cached = getCache(userId);
  if (cached) {
    for (const updated of passes) {
      const pass = cached.passes.find((p) => p.id === updated.id);
      if (pass) {
        if (updated.description) pass.description = updated.description;
        if (updated.price) pass.price = updated.price;
      }
    }
    setCache(userId, cached); // refresh TTL
    console.log(`🔄 Updated ${passes.length} passes for user ${userId}`);
  }

  res.json({ ok: true });
});

// -------------------------
// Start server
// -------------------------
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
