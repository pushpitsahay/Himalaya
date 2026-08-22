# H I M A L A Y A

This version uses the Spotify Web API to read the live contents of the H I M A L A Y A playlist and the Spotify iFrame API to play individual tracks.

Playlist:
https://open.spotify.com/playlist/4IzjPmSdgQVTefQDbfSLXN

## What changed

- Removed browser scraping of `open.spotify.com/embed/...`.
- The server calls Spotify's current `GET /v1/playlists/{id}/items` endpoint.
- Individual track IDs, titles, artists, artwork, URLs and durations are returned to the page.
- Next/Previous now load the actual next/previous Spotify track URI.
- The current track artwork comes directly from Spotify album metadata.
- Playlist results are cached for only 30 seconds, so Spotify playlist edits are picked up without changing the website code.
- The Spotify Client Secret and refresh token stay on the server and are never sent to the browser.

## One-time setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy the Client ID and Client Secret.
3. In the Spotify app settings, add this exact Redirect URI:

   `http://localhost:3000/spotify/callback`

4. Copy `.env.example` to `.env`.
5. Put your Client ID and Client Secret in `.env`.
6. Run:

   `npm install`
   `npm start`

7. Open:

   `http://localhost:3000/spotify/login`

8. Sign in with the Spotify account that owns or collaborates on the H I M A L A Y A playlist and approve playlist access.
9. After the success page appears, open:

   `http://localhost:3000`

The server stores the refresh token in `.spotify-token.json`, which is ignored by Git.

## Important Spotify requirement

Spotify's current playlist-items endpoint only returns playlist contents for playlists owned by the authenticated user or playlists the authenticated user collaborates on. If the H I M A L A Y A playlist is owned by a different Spotify account, authorize the account that owns it or make that account a collaborator where appropriate.

## Deployment

For a deployed server, change `SPOTIFY_REDIRECT_URI` to the exact HTTPS callback URL configured in the Spotify Developer Dashboard. Prefer setting `SPOTIFY_REFRESH_TOKEN` as a server environment variable rather than committing `.spotify-token.json`.
