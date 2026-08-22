export default async function handler(req, res) {
    try {
        if (req.method !== "GET") {
            return res.status(405).json({
                error: "Method not allowed"
            });
        }

        const apiKey = process.env.YOUTUBE_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "YOUTUBE_API_KEY is not configured"
            });
        }

        const title = String(req.query.title || "").trim();
        const artist = String(req.query.artist || "").trim();

        if (!title) {
            return res.status(400).json({
                error: "Missing song title"
            });
        }

        /*
         * Search YouTube only when Spotify playback needs
         * a fallback. We deliberately do NOT search the
         * entire playlist when the page loads.
         */
        const query = [title, artist]
            .filter(Boolean)
            .join(" ");

        const params = new URLSearchParams({
            part: "snippet",
            q: query,
            type: "video",
            maxResults: "5",
            videoEmbeddable: "true",
            videoSyndicated: "true",
            key: apiKey
        });

        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/search?${params.toString()}`
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("YouTube API error:", data);

            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "YouTube search failed"
            });
        }

        const items = Array.isArray(data.items)
            ? data.items
            : [];

        if (!items.length) {
            return res.status(404).json({
                error: "No embeddable YouTube video found",
                query
            });
        }

        const video = items[0];

        return res.status(200).json({
            videoId: video.id.videoId,
            title: video.snippet.title,
            channel: video.snippet.channelTitle,
            query
        });

    } catch (error) {
        console.error("YouTube fallback error:", error);

        return res.status(500).json({
            error: "YouTube fallback failed"
        });
    }
}