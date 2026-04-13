import parseTTMLToLyrics from './ttml-parser.js';
import { settingsManager } from './settings-manager.js';

const SPICY_API_URL = 'https://api.spicylyrics.org';
const SPICY_VERSION = '2.8.0';
const DEFAULT_MUSIXMATCH_TOKEN = '260407cedd74339c647cfc2ad6fac02ab1f32910a5a18725c97acc';

/** Source label mapping */
const SOURCE_LABELS = {
  spl: 'Spicy Lyrics Community',
  aml: 'Apple Music',
  spt: 'Spotify',
  spicy: 'Spicy AMLL Player',
  spotify: 'Spotify',
  lrclib: 'LRCLIB',
  netease: 'Netease',
  musixmatch: 'Musixmatch',
  genius: 'Genius',
  apple: 'Apple Music',
};

function resolveSourceLabel(source, sourceDisplayName) {
  if (sourceDisplayName?.trim()) return sourceDisplayName.trim();
  if (source && SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  if (source?.trim()) return source.trim();
  return 'Spicy AMLL Player';
}

// ═══════════════════════════════════════════════
// Helpers & Utilities
// ═══════════════════════════════════════════════

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Proxy fetch to bypass CORS for specific providers */
async function proxiedFetch(url, options = {}) {
  const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  return fetch(proxiedUrl, options);
}

// ═══════════════════════════════════════════════
// Spotify Search
// ═══════════════════════════════════════════════

let cachedSpotifyToken = null;

async function getSpotifyAccessToken() {
  if (cachedSpotifyToken) return cachedSpotifyToken;
  try {
    const targetUrl = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
    const res = await proxiedFetch(targetUrl, { credentials: 'omit' });
    if (res.ok) {
      const data = await res.json();
      if (data.accessToken) {
        cachedSpotifyToken = data.accessToken;
        return data.accessToken;
      }
    }
  } catch (e) {
    console.log('[TTMLRetriever] Spotify token error:', e.message);
  }
  return null;
}

async function searchSpotifyTrack(songName, artistName, albumName) {
  try {
    const token = await getSpotifyAccessToken();
    const query = encodeURIComponent(`track:${songName} artist:${artistName}`);
    const url = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=5`;
    
    if (token) {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const tracks = data?.tracks?.items;
        if (tracks && tracks.length > 0) {
          return tracks[0].id;
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

// Musixmatch Provider
// ═══════════════════════════════════════════════

async function fetchFromMusixmatch(songName, artistName, albumName, durationMs) {
  const token = settingsManager.get("musixmatchToken") || DEFAULT_MUSIXMATCH_TOKEN;
  const durationSec = durationMs / 1000;
  
  try {
    const baseUrl = "https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get";
    const params = new URLSearchParams({
      format: "json",
      namespace: "lyrics_richsynched",
      subtitle_format: "mxm",
      app_id: "web-desktop-app-v1.0",
      q_track: songName,
      q_artist: artistName,
      q_album: albumName || "",
      q_duration: durationSec,
      usertoken: token
    });

    const res = await proxiedFetch(`${baseUrl}?${params}`);
    if (!res.ok) return null;
    
    const data = await res.json();
    const macroCalls = data?.message?.body?.macro_calls;
    if (!macroCalls) return null;

    // Check for richsync (word sync)
    const ignoreWordSync = settingsManager.get("ignoreMusixmatchWordSync");
    const richsync = macroCalls["track.richsync.get"]?.message?.body?.richsync?.richsync_body;
    if (richsync && !ignoreWordSync) {
       // Note: Full RichSync parsing would be integrated here if ported from reference
    }

    // Fallback to subtitle (line sync)
    const subtitle = macroCalls["track.subtitles.get"]?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body;
    if (subtitle) {
      const lines = JSON.parse(subtitle);
      const content = lines.map((l, i) => ({
        Type: "Vocal",
        Text: l.text,
        StartTime: l.time.total,
        EndTime: (i < lines.length - 1) ? lines[i+1].time.total : l.time.total + 4
      }));
      return {
        lyricsData: { Type: "Line", StartTime: content[0].StartTime, Content: content },
        source: "musixmatch",
        sourceDisplayName: "Musixmatch"
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Netease Provider
// ═══════════════════════════════════════════════

async function fetchFromNetease(songName, artistName) {
  try {
    const searchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(songName + " " + artistName)}&type=1&limit=1`;
    const searchRes = await proxiedFetch(searchUrl);
    if (!searchRes.ok) return null;
    
    const searchData = await searchRes.json();
    const songId = searchData?.result?.songs?.[0]?.id;
    if (!songId) return null;

    const lyricsUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
    const lyricsRes = await proxiedFetch(lyricsUrl);
    if (!lyricsRes.ok) return null;

    const data = await lyricsRes.json();
    const lrc = data?.lrc?.lyric;
    if (!lrc) return null;

    // Use our existing parseLRC logic
    const lines = parseLRC(lrc, 240000); // 4 min duration fallback
    if (lines) {
      return {
        lyricsData: lines,
        source: "netease",
        sourceDisplayName: "NetEase"
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════
// LRCLIB
// ═══════════════════════════════════════════════

async function fetchFromLRCLIB(songName, artistName, albumName, durationSec) {
  try {
    const params = new URLSearchParams({
      track_name: songName,
      artist_name: artistName,
      album_name: albumName || '',
      duration: String(Math.round(durationSec)),
    });

    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'x-user-agent': 'spicy-amll-player/1.0' },
    });

    if (!res.ok) return null;
    const body = await res.json();
    return processLRCLIBResponse(body, durationSec * 1000);
  } catch (err) {
    return null;
  }
}

function processLRCLIBResponse(body, durationMs) {
  if (body?.syncedLyrics) {
    const lines = parseLRC(body.syncedLyrics, durationMs);
    if (lines) return { lyricsData: lines, source: 'lrclib', sourceDisplayName: 'LRCLIB' };
  }
  if (body?.plainLyrics) {
    const staticLines = body.plainLyrics.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(Text => ({ Text }));
    if (staticLines.length > 0) return { lyricsData: { Type: 'Static', Lines: staticLines }, source: 'lrclib', sourceDisplayName: 'LRCLIB' };
  }
  return null;
}

function parseLRC(lrcText, durationMs) {
  const rows = lrcText.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const lines = [];
  rows.forEach(row => {
    const matches = Array.from(row.matchAll(/\[([0-9:.]+)\]/g));
    const text = row.replace(/\[[0-9:.]+\]/g, '').trim();
    if (!text || !matches.length) return;
    matches.forEach(match => {
      const ts = parseTimestamp(match[1]);
      if (ts !== null) lines.push({ text, startTimeMs: ts });
    });
  });
  if (!lines.length) return null;
  lines.sort((a, b) => a.startTimeMs - b.startTimeMs);
  const content = lines.map((line, i) => ({
    Type: 'Vocal',
    Text: line.text,
    StartTime: line.startTimeMs / 1000,
    EndTime: i < lines.length - 1 ? lines[i + 1].startTimeMs / 1000 : Math.max(line.startTimeMs / 1000 + 4, durationMs / 1000),
    OppositeAligned: false,
  }));
  return { Type: 'Line', StartTime: content[0]?.StartTime || 0, Content: content };
}

function parseTimestamp(ts) {
  const parts = ts.trim().split(':');
  if (parts.length < 2) return null;
  const minutes = parseInt(parts[0], 10);
  const seconds = parseFloat(parts[1]);
  return Math.round((minutes * 60 + seconds) * 1000);
}

// ═══════════════════════════════════════════════
// Spicy AMLL Player API
// ═══════════════════════════════════════════════

async function fetchFromSpicyAPI(songId) {
  try {
    const token = await getSpotifyAccessToken();
    const res = await fetch(`${SPICY_API_URL}/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'spicylyrics-version': SPICY_VERSION,
        'SpicyLyrics-WebAuth': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify({
        queries: [{ operation: 'lyrics', variables: { id: songId, auth: 'SpicyLyrics-WebAuth' } }],
        client: { version: SPICY_VERSION }
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.queries?.[0]?.result;
    if (!result || result.httpStatus !== 200) return null;

    let lyricsData = result.data;
    if (typeof lyricsData === 'string') {
        lyricsData = parseTTMLToLyrics(lyricsData);
    }

    if (lyricsData?.Type) {
      const source = lyricsData.source || 'spicy';
      return {
        lyricsData,
        source,
        sourceDisplayName: resolveSourceLabel(source, lyricsData.sourceDisplayName)
      };
    }
  } catch (err) {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════

export async function retrieveTTML(songName, artistName, albumName, durationSec = 0) {
  const order = settingsManager.get("lyricsSourceOrder") || DEFAULT_LYRICS_SOURCE_ORDER;
  const disabled = new Set(settingsManager.get("disabledLyricsSources") || []);
  const activeOrder = order.filter(p => !disabled.has(p));

  console.log(`[TTMLRetriever] Sequential lookup: ${activeOrder.join(" -> ")}`);

  for (const providerId of activeOrder) {
    console.log(`[TTMLRetriever] Attempting ${providerId}...`);
    let result = null;

    try {
      if (providerId === "spicy" || providerId === "apple") {
        const spotifyId = await searchSpotifyTrack(songName, artistName, albumName);
        if (spotifyId) result = await fetchFromSpicyAPI(spotifyId);
      } else if (providerId === "musixmatch") {
        result = await fetchFromMusixmatch(songName, artistName, albumName, durationSec * 1000);
      } else if (providerId === "netease") {
        result = await fetchFromNetease(songName, artistName);
      } else if (providerId === "lrclib") {
        result = await fetchFromLRCLIB(songName, artistName, albumName, durationSec);
      }
      
      if (result) {
        console.log(`[TTMLRetriever] ✓ Found lyrics via ${providerId}`);
        return result;
      }
    } catch (e) {
      console.warn(`[TTMLRetriever] ${providerId} failed:`, e);
    }
  }

  console.log('[TTMLRetriever] ✗ No lyrics found from any source');
  return null;
}
