// Cloud Leaderboard — Supabase backend for Jake's Arcade
// This file is shared by all games and the landing page.

const SUPABASE_URL = 'https://eiyfziozloomhilvawfv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpeWZ6aW96bG9vbWhpbHZhd2Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjA1MjksImV4cCI6MjA4Njc5NjUyOX0.QOpZbycNm51iTYVidwiwMG2xW3aNryCem6eZl4OMALo';

// Fire-and-forget POST — saves a score to the cloud.
// Returns the promise but callers don't need to await it.
function cloudSaveScore(game, playerName, score, meta) {
  return fetch(SUPABASE_URL + '/rest/v1/scores', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      game: game,
      player_name: playerName,
      score: score,
      meta: meta || {}
    })
  }).catch(function () { /* silent — cloud is best-effort */ });
}

// GET top entries for a game from the cloud.
// orderBy: column to sort by, e.g. 'score' (always descending).
// Returns array of { player_name, score, meta } or null on failure.
function cloudLoadLeaderboard(game, limit) {
  var url = SUPABASE_URL + '/rest/v1/scores'
    + '?game=eq.' + encodeURIComponent(game)
    + '&order=score.desc,created_at.asc'
    + '&limit=' + (limit || 50);

  return fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  })
  .then(function (r) { return r.ok ? r.json() : null; })
  .catch(function () { return null; });
}

// Merge local and cloud leaderboard arrays.
// Each entry must have at least { name, score }.
// dedupeByName: if true, keep only the highest score per player name (for Tank Wars etc.)
// compareFn: custom sort function. Defaults to score DESC.
// Returns merged + sorted + top-10 array.
function mergeLeaderboards(local, cloud, options) {
  var opts = options || {};
  var limit = opts.limit || 10;
  var dedupeByName = opts.dedupeByName || false;

  // Normalize cloud entries to match local shape
  var cloudNorm = (cloud || []).map(function (e) {
    return {
      name: e.player_name || e.name || 'PLAYER',
      score: e.score || 0,
      floor: (e.meta && e.meta.floor) || e.floor,
      gold: (e.meta && e.meta.gold) || e.gold,
      rooms: (e.meta && e.meta.rooms) || e.rooms,
      time: (e.meta && e.meta.time) || e.time,
      wave: (e.meta && e.meta.wave) || e.wave,
      date: e.date || (e.created_at ? new Date(e.created_at).getTime() : 0)
    };
  });

  var all = (local || []).concat(cloudNorm);

  // Deduplicate: same name + same score = duplicate
  var seen = {};
  var unique = [];
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    var key = (e.name || '').toUpperCase() + '|' + e.score;
    if (dedupeByName) {
      key = (e.name || '').toUpperCase();
    }
    if (!seen[key]) {
      seen[key] = e;
      unique.push(e);
    } else if (dedupeByName && e.score > seen[key].score) {
      // Keep the higher score
      var idx = unique.indexOf(seen[key]);
      unique[idx] = e;
      seen[key] = e;
    }
  }

  // Sort
  var compareFn = opts.compareFn || function (a, b) { return b.score - a.score; };
  unique.sort(compareFn);

  return unique.slice(0, limit);
}

// Convenience: fetch cloud leaderboard, merge with localStorage, save back.
// Existing game code reads from localStorage, so after this runs the next
// render frame automatically picks up merged data.
function cloudMergeAndSave(cloudGameId, localStorageKey, options, onMerged) {
  cloudLoadLeaderboard(cloudGameId, 50).then(function (cloud) {
    if (!cloud || cloud.length === 0) return;
    var local = [];
    try { local = JSON.parse(localStorage.getItem(localStorageKey) || '[]'); } catch (e) {}
    var merged = mergeLeaderboards(local, cloud, options);
    try { localStorage.setItem(localStorageKey, JSON.stringify(merged)); } catch (e) {}
    if (onMerged) onMerged(merged);
  });
}
