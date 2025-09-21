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

// ✅ Root test route
app.get("/", (req, res) => {
  res.send("✅ Server is running! Use /gamepasses/:userId to fetch ALL gamepasses.");
});

// ✅ Main route
app.get("/gamepasses/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Step 1: Fetch ALL games owned by user
    const gamesUrl = `https://games.roblox.com/v2/users/${userId}/games?limit=50`;
    const games = await fetchAllPages(gamesUrl);

    if (games.length === 0) {
      return res.json({ userId, passes: [] });
    }

    let passes = [];

    // Step 2: For each game, fetch ALL its passes
    for (const game of games) {
      const gameId = game.id;
      const passesUrl = `https://games.roblox.com/v1/games/${gameId}/game-passes?limit=50`;
      const gamePasses = await fetchAllPages(passesUrl);

      if (gamePasses.length > 0) {
        passes = passes.concat(
          gamePasses.map((p) => ({
            id: p.id,
            name: p.name,
            gameId,
          }))
        );
      }
    }

    res.json({ userId, passes });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
