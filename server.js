import express from "express";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Load secrets from .env. Never put these values in script.js or index.html.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 3000);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${PORT}/spotify/callback`;
const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID || "4IzjPmSdgQVTefQDbfSLXN";
const TOKEN_FILE = path.join(__dirname, ".spotify-token.json");
const SCOPES = "playlist-read-private playlist-read-collaborative";

let accessToken = process.env.SPOTIFY_ACCESS_TOKEN || "";
let accessTokenExpiresAt = 0;
let refreshToken = process.env.SPOTIFY_REFRESH_TOKEN || "";
let playlistCache = { expiresAt: 0, data: null };

app.use(express.static(__dirname));

function requireSpotifyConfig() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error(
            "Spotify is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env."
        );
    }
}

async function loadStoredToken() {
    if (refreshToken) return;

    try {
        const raw = await fs.readFile(TOKEN_FILE, "utf8");
        const saved = JSON.parse(raw);
        refreshToken = saved.refresh_token || "";
    } catch {
        // No token yet. The user can authorize at /spotify/login.
    }
}

async function saveRefreshToken(token) {
    refreshToken = token;
    await fs.writeFile(
        TOKEN_FILE,
        JSON.stringify({ refresh_token: token }, null, 2),
        { mode: 0o600 }
    );
}

function spotifyBasicAuth() {
    return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

async function refreshAccessToken() {
    requireSpotifyConfig();
    await loadStoredToken();

    if (!refreshToken) {
        const error = new Error("Spotify authorization is required. Open /spotify/login first.");
        error.code = "SPOTIFY_AUTH_REQUIRED";
        throw error;
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            Authorization: `Basic ${spotifyBasicAuth()}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken
        })
    });

    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.error_description || "Spotify token refresh failed.");
        error.code = "SPOTIFY_AUTH_FAILED";
        throw error;
    }

    accessToken = data.access_token;
    accessTokenExpiresAt = Date.now() + Math.max(30, Number(data.expires_in || 3600) - 60) * 1000;

    // Spotify may rotate the refresh token. Keep the new one if returned.
    if (data.refresh_token && data.refresh_token !== refreshToken) {
        await saveRefreshToken(data.refresh_token);
    }

    return accessToken;
}

async function getAccessToken() {
    if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
    return refreshAccessToken();
}

async function spotifyFetch(url, options = {}, retry = true) {
    const token = await getAccessToken();
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 401 && retry) {
        accessToken = "";
        accessTokenExpiresAt = 0;
        await refreshAccessToken();
        return spotifyFetch(url, options, false);
    }

    return response;
}

function normalizeTrack(item) {
    const track = item?.item;
    if (!track || track.type !== "track" || track.is_local) return null;

    const artists = Array.isArray(track.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean)
        : [];

    return {
        id: track.id,
        uri: track.uri,
        url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        title: track.name || "Unknown track",
        artist: artists.join(", ") || "Unknown artist",
        cover: track.album?.images?.[0]?.url || "",
        album: track.album?.name || "",
        duration: Number(track.duration_ms || 0)
    };
}

async function fetchPlaylist() {
    const now = Date.now();
    if (playlistCache.data && now < playlistCache.expiresAt) return playlistCache.data;

    let url = new URL(`https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/items`);
    url.searchParams.set("limit", "50");
    url.searchParams.set("fields", "items(item(id,type,uri,name,artists(name),album(name,images),external_urls,duration_ms,is_local)),next,total");

    const tracks = [];
    let playlistTotal = 0;

    while (url) {
        const response = await spotifyFetch(url.toString());
        const data = await response.json();

        if (!response.ok) {
            const error = new Error(data?.error?.message || "Spotify playlist request failed.");
            error.status = response.status;
            throw error;
        }

        playlistTotal = Number(data.total || playlistTotal || 0);
        for (const item of data.items || []) {
            const normalized = normalizeTrack(item);
            if (normalized) tracks.push(normalized);
        }

        url = data.next ? new URL(data.next) : null;
    }

    const result = {
        playlist: {
            id: PLAYLIST_ID,
            name: "H I M A L A Y A",
            url: `https://open.spotify.com/playlist/${PLAYLIST_ID}`,
            total: playlistTotal
        },
        tracks,
        fetchedAt: new Date().toISOString()
    };

    // Short cache so Spotify playlist edits are picked up without redeploying.
    playlistCache = {
        data: result,
        expiresAt: Date.now() + 30_000
    };

    return result;
}

// Start the one-time Spotify OAuth authorization.
app.get("/spotify/login", (req, res) => {
    try {
        requireSpotifyConfig();
    } catch (error) {
        return res.status(500).send(`<h2>Spotify setup required</h2><p>${error.message}</p>`);
    }

    const state = crypto.randomBytes(24).toString("hex");
    res.cookieState = state;

    // This is intentionally simple for this small personal site. For a public,
    // multi-user application, store state server-side in a session/cookie.
    app.locals.spotifyState = state;

    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state
    });

    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

app.get("/spotify/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) return res.status(400).send(`<h2>Spotify authorization cancelled</h2><p>${error}</p>`);
    if (!code || !state || state !== app.locals.spotifyState) {
        return res.status(400).send("Invalid Spotify authorization state.");
    }

    try {
        requireSpotifyConfig();

        const response = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: {
                Authorization: `Basic ${spotifyBasicAuth()}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI
            })
        });

        const data = await response.json();
        if (!response.ok || !data.refresh_token) {
            throw new Error(data.error_description || "Spotify did not return a refresh token.");
        }

        await saveRefreshToken(data.refresh_token);
        accessToken = data.access_token || "";
        accessTokenExpiresAt = Date.now() + Math.max(30, Number(data.expires_in || 3600) - 60) * 1000;
        playlistCache = { expiresAt: 0, data: null };
        app.locals.spotifyState = null;

        res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Spotify Connected</title></head><body style="font-family:system-ui;padding:40px;background:#101010;color:white"><h2>Spotify connected ✓</h2><p>Your H I M A L A Y A playlist is now connected.</p><p>You can close this tab and open the Himalaya page.</p></body></html>`);
    } catch (error) {
        res.status(500).send(`<h2>Spotify authorization failed</h2><pre>${String(error.message).replace(/[<>&]/g, "")}</pre>`);
    }
});

app.get("/api/spotify/status", async (req, res) => {
    try {
        await loadStoredToken();
        res.json({ connected: Boolean(refreshToken), playlistId: PLAYLIST_ID });
    } catch {
        res.json({ connected: false, playlistId: PLAYLIST_ID });
    }
});

app.get("/api/playlist", async (req, res) => {
    try {
        const data = await fetchPlaylist();
        res.setHeader("Cache-Control", "no-store");
        res.json(data);
    } catch (error) {
        const status = error.code === "SPOTIFY_AUTH_REQUIRED" ? 401 : (error.status || 500);
        res.status(status).json({
            error: error.message,
            authorizationUrl: "/spotify/login"
        });
    }
});

app.listen(PORT, () => {
    console.log(`Himalaya is running at http://localhost:${PORT}`);
    console.log(`Spotify login: http://localhost:${PORT}/spotify/login`);
    console.log(`Playlist: https://open.spotify.com/playlist/${PLAYLIST_ID}`);
});
