import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

/**
 * Fetch all pages of Roblox API results
 */
async function fetchAllPages(url) {
  let results = [];
  let cursor = null;

  do {
    const fullUrl = cursor ? `${url}&cursor=${cursor}` : url;
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

/**
 * Fetch gamepass details (safe: only works for actual passes)
 */
async function fetchPassDetails(passId) {
  const url = `https://games.roproxy.com/v1/game-passes/${passId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`⚠️ Failed fetch for ${passId}: ${res.status}`);
      return { description: null, price: null };
    }

    const data = await res.json();

    // "NotFound" or deleted passes
    if (data.errors || !data.product) {
      console.warn(`⚠️ ${passId} is not a valid gamepass`);
      return { description: null, price: null };
    }

    return {
      description: data.description || null,
      price: data.product?.priceInRobux ?? null,
    };
  } catch (err) {
    console.error(`❌ Error fetching ${passId}:`, err);
    return { description: null, price: null };
  }
}

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Server is running! Use /gamepasses/:userId to fetch ALL gamepasses.");
});

// ✅ Main route
app.get("/gamepasses/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Get all games for user
    const gamesUrl = `https://games.roproxy.com/v2/users/${userId}/games?limit=50`;
    const games = await fetchAllPages(gamesUrl);

    if (games.length === 0) {
      return res.json({ userId, passes: [] });
    }

    let passes = [];

    // 2. For each game, fetch its passes
    for (const game of games) {
      const passesUrl = `https://games.roproxy.com/v1/games/${game.id}/game-passes?limit=50`;
      const gamePasses = await fetchAllPages(passesUrl);

      // 3. Fetch details for each pass
      const detailedPasses = await Promise.all(
        gamePasses.map(async (p) => {
          const details = await fetchPassDetails(p.id);
          return {
            id: p.id,
            name: p.name,
            description: details.description,
            price: details.price,
            gameId: game.id,
            gameName: game.name,
          };
        })
      );

      passes = passes.concat(detailedPasses);
    }

    res.json({ userId, passes });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ✅ Start server
app.listen(PORT, () =>
  console.log(`🚀 Server listening on http://localhost:${PORT}`)
);
