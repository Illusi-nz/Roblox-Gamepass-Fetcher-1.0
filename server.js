import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = 3000;

/**
 * Helper: fetch all pages of results
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
    if (data.data) results = results.concat(data.data);

    cursor = data.nextPageCursor || null;
  } while (cursor);

  return results;
}

// ✅ Main route: get ALL games + ALL passes for a user
app.get("/gamepasses/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    // Step 1: Fetch ALL games owned by this user
    const gamesUrl = `https://games.roproxy.com/v2/users/${userId}/games?limit=50`;
    const games = await fetchAllPages(gamesUrl);

    if (games.length === 0) {
      return res.json({ userId, passes: [] });
    }

    let passes = [];

    // Step 2: For each game, fetch ALL passes
    for (const game of games) {
      const passesUrl = `https://games.roproxy.com/v1/games/${game.id}/game-passes?limit=50`;
      const gamePasses = await fetchAllPages(passesUrl);

      // Step 3: Fetch details for each pass in parallel
      const detailedPasses = await Promise.all(
        gamePasses.map(async (p) => {
          return {
            id: p.id,
            name: p.name,
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
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
