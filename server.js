import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

/**
 * Helper: fetch all pages of Roblox API results
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
 * Helper: batch fetch prices for many passes
 */
async function fetchPricesBatch(passIds) {
  const url = "https://economy.roproxy.com/v2/assets/details";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIds: passIds }),
    });

    if (!res.ok) {
      console.error(`❌ Failed batch price fetch: ${res.status} ${res.statusText}`);
      return {};
    }

    const data = await res.json();
    const prices = {};
    data.forEach((d) => {
      prices[d.AssetId] = d.PriceInRobux ?? null;
    });
    return prices;
  } catch (err) {
    console.error("❌ Error in batch price fetch:", err);
    return {};
  }
}

/**
 * Helper: fetch description for a single pass
 */
async function fetchDescription(passId) {
  const url = `https://api.roproxy.com/marketplace/productinfo?assetId=${passId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.Description || null;
  } catch (err) {
    console.error(`❌ Error fetching description for ${passId}:`, err);
    return null;
  }
}

// ✅ Root test route
app.get("/", (req, res) => {
  res.send("✅ Server is running! Use /gamepasses/:userId to fetch ALL gamepasses.");
});

// ✅ Main route
app.get("/gamepasses/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Step 1: Fetch ALL games owned by user
    const gamesUrl = `https://games.roproxy.com/v2/users/${userId}/games?limit=50`;
    const games = await fetchAllPages(gamesUrl);

    if (games.length === 0) {
      return res.json({ userId, passes: [] });
    }

    let passes = [];

    // Step 2: For each game, fetch passes
    for (const game of games) {
      const gameId = game.id;
      const passesUrl = `https://games.roproxy.com/v1/games/${gameId}/game-passes?limit=50`;
      const gamePasses = await fetchAllPages(passesUrl);

      if (gamePasses.length > 0) {
        // Collect raw passes first
        passes = passes.concat(
          gamePasses.map((p) => ({
            id: p.id,
            name: p.name,
            gameId,
            gameName: game.name,
          }))
        );
      }
    }

    // Step 3: Fetch prices in batches (50 at a time)
    const prices = {};
    for (let i = 0; i < passes.length; i += 50) {
      const batchIds = passes.slice(i, i + 50).map((p) => p.id);
      Object.assign(prices, await fetchPricesBatch(batchIds));
    }

    // Step 4: Fetch descriptions in parallel
    const descriptions = await Promise.all(
      passes.map(async (p) => ({
        id: p.id,
        description: await fetchDescription(p.id),
      }))
    );
    const descMap = {};
    descriptions.forEach((d) => {
      descMap[d.id] = d.description;
    });

    // Step 5: Merge everything
    const finalPasses = passes.map((p) => ({
      ...p,
      description: descMap[p.id] || null,
      price: prices[p.id] ?? null,
    }));

    res.json({ userId, passes: finalPasses });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
