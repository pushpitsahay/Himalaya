# H I M A L A Y A

A small music player for the H I M A L A Y A Spotify playlist.

This project reads the live playlist data from Spotify's API and lets the browser play tracks using Spotify's player.

## Features

- Reads the latest playlist contents from Spotify
- Shows track metadata such as title, artist, album art, and duration
- Supports next/previous track navigation
- Keeps Spotify credentials on the server, not in the browser

## Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Copy `.env.example` to `.env` and add your `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`.
3. Set the redirect URI to:

   `http://localhost:3000/spotify/callback`

4. Install dependencies:

   `npm install`

5. Start the app:

   `npm start`

6. Open:

   `http://localhost:3000/spotify/login`

7. Authorize the Spotify account that owns or collaborates on the playlist.
8. Open:

   `http://localhost:3000`

## Notes

- The app uses the playlist ID configured in `.env.example` by default.
- If the playlist is not owned by the authorized account, the account must be added as a collaborator or the playlist must be reauthorized.
- For deployment, configure the production callback URL in the Spotify dashboard and set the refresh token as a server environment variable instead of committing it to the repo.