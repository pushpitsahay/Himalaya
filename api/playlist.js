const PLAYLIST_ID =
  process.env.SPOTIFY_PLAYLIST_ID || "4IzjPmSdgQVTefQDbfSLXN";

function basicAuth() {
  return Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
}

async function getAccessToken() {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error_description || "Spotify token refresh failed."
    );
  }

  return data.access_token;
}

function normalizeTrack(item) {
  const track = item?.item;

  if (!track || track.type !== "track" || track.is_local) {
    return null;
  }

  return {
    id: track.id,
    uri: track.uri,
    url:
      track.external_urls?.spotify ||
      `https://open.spotify.com/track/${track.id}`,
    title: track.name || "Unknown track",
    artist:
      track.artists?.map((artist) => artist?.name).filter(Boolean).join(", ") ||
      "Unknown artist",
    cover: track.album?.images?.[0]?.url || "",
    album: track.album?.name || "",
    duration: Number(track.duration_ms || 0),
  };
}

export async function GET() {
  try {
    if (
      !process.env.SPOTIFY_CLIENT_ID ||
      !process.env.SPOTIFY_CLIENT_SECRET ||
      !process.env.SPOTIFY_REFRESH_TOKEN
    ) {
      return Response.json(
        {
          error: "Spotify environment variables are not configured.",
        },
        { status: 500 }
      );
    }

    const accessToken = await getAccessToken();

    let url = new URL(
      `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/items`
    );

    url.searchParams.set("limit", "50");

    const tracks = [];
    let playlistTotal = 0;

    while (url) {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return Response.json(
          {
            error:
              data?.error?.message ||
              "Spotify playlist request failed.",
          },
          { status: response.status }
        );
      }

      playlistTotal = Number(data.total || playlistTotal || 0);

      for (const item of data.items || []) {
        const track = normalizeTrack(item);

        if (track) {
          tracks.push(track);
        }
      }

      url = data.next ? new URL(data.next) : null;
    }

    return Response.json(
      {
        playlist: {
          id: PLAYLIST_ID,
          name: "H I M A L A Y A",
          url: `https://open.spotify.com/playlist/${PLAYLIST_ID}`,
          total: playlistTotal,
        },
        tracks,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    console.error("Spotify playlist error:", error);

    return Response.json(
      {
        error: error.message || "Unable to load Spotify playlist.",
      },
      { status: 500 }
    );
  }
}