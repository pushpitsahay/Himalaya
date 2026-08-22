/* ---------------- Clock ---------------- */
const clockEl = document.getElementById("clock");
const dateEl = document.getElementById("date");

function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString(undefined, { hour12: false });
    dateEl.textContent = now.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
tickClock();
setInterval(tickClock, 1000);

/* ---------------- Live "online" presence ----------------
   Real presence tracking without a backend: every open tab writes a
   heartbeat to localStorage; entries older than STALE_MS are dropped. */
const PRESENCE_KEY = "himalaya.presence";
const HEARTBEAT_MS = 2000;
const STALE_MS = 6000;
const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const onlineEl = document.getElementById("online-count");

function readPresence() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PRESENCE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function heartbeat() {
    const now = Date.now();
    const presence = readPresence();
    presence[sessionId] = now;

    for (const [id, seen] of Object.entries(presence)) {
        if (typeof seen !== "number" || now - seen > STALE_MS) delete presence[id];
    }

    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
    onlineEl.textContent = Object.keys(presence).length;
}

heartbeat();
setInterval(heartbeat, HEARTBEAT_MS);
window.addEventListener("storage", (e) => {
    if (e.key === PRESENCE_KEY) {
        const now = Date.now();
        onlineEl.textContent = Object.values(readPresence()).filter(
            (seen) => now - seen <= STALE_MS
        ).length;
    }
});
window.addEventListener("beforeunload", () => {
    const presence = readPresence();
    delete presence[sessionId];
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(presence));
});

/* ---------------- To-Do list ---------------- */
const TASKS_KEY = "himalaya.tasks";
const listEl = document.getElementById("task-list");
const emptyEl = document.getElementById("empty-state");
const doneCountEl = document.getElementById("done-count");
const totalCountEl = document.getElementById("total-count");
const barEl = document.getElementById("todo-bar");
const bodyEl = document.querySelector(".todo-body");

let tasks = loadTasks();

function loadTasks() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TASKS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveTasks() {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function updateCounters() {
    const done = tasks.filter((t) => t.done).length;
    totalCountEl.textContent = tasks.length;
    doneCountEl.textContent = done;
    barEl.style.width = tasks.length ? `${(done / tasks.length) * 100}%` : "0%";
    bodyEl.classList.toggle("empty", tasks.length === 0);
    emptyEl.classList.toggle("hidden", tasks.length > 0);
}

function buildTaskItem(task) {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.title = "Mark as completed";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "task-text";
    input.value = task.text;
    input.placeholder = "Click to enter the task name";
    input.maxLength = 200;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-btn";
    del.title = "Delete task";
    del.textContent = "\u2716";

    checkbox.addEventListener("change", () => {
        task.done = checkbox.checked;
        li.classList.toggle("done", task.done);
        saveTasks();
        updateCounters();
    });

    input.addEventListener("input", () => {
        task.text = input.value;
        saveTasks();
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
        }
    });

    del.addEventListener("click", () => {
        tasks = tasks.filter((t) => t.id !== task.id);
        li.remove();
        saveTasks();
        updateCounters();
    });

    li.append(checkbox, input, del);
    return li;
}

function renderTasks() {
    listEl.replaceChildren(...tasks.map(buildTaskItem));
    updateCounters();
}

document.getElementById("add-task").addEventListener("click", () => {
    const task = { id: crypto.randomUUID(), text: "", done: false };
    tasks.push(task);
    const li = buildTaskItem(task);
    listEl.appendChild(li);
    saveTasks();
    updateCounters();
    li.querySelector(".task-text").focus();
    listEl.scrollTop = listEl.scrollHeight;
});

renderTasks();

/* ---------------- Music player ----------------
   The playlist is read from the server through Spotify's Web API.
   The browser never receives the Spotify Client Secret or refresh token.
   Playlist ID: 4IzjPmSdgQVTefQDbfSLXN (H I M A L A Y A)
*/
const PLAYLIST_API = "/api/playlist";
const SPOTIFY_LOGIN = "/spotify/login";

const coverEl = document.getElementById("cover");
const titleEl = document.getElementById("track-title");
const artistEl = document.getElementById("track-artist");
const seek = document.getElementById("seek");
const currentTimeEl = document.getElementById("current-time");
const durationEl = document.getElementById("duration");
const playBtn = document.getElementById("play");
const playIcon = document.getElementById("play-icon");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const embedTarget = document.getElementById("spotify-embed-target");

const PLAY_PATH = "M8 5v14l11-7z";
const PAUSE_PATH = "M7 5h4v14H7zm6 0h4v14h-4z";
const DEFAULT_COVER = "https://image-cdn-ak.spotifycdn.com/image/ab67706c0000da849afe0ae7de6cc60a0d10b203";

const formatTime = (s) =>
    !Number.isFinite(s) ? "0:00" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

let tracks = [];
let currentIndex = -1;
let spotifyApi = null;
let controller = null;
let pending = null;
let isLoadingTrack = false;
let autoplayTimer = 0;
let lastPlaybackUri = "";
let lastAutoAdvanceAt = 0;

window.onSpotifyIframeApiReady = (api) => {
    spotifyApi = api;
    if (pending) {
        const { uri, autoplay } = pending;
        pending = null;
        createOrLoadSpotify(uri, autoplay);
    }
};

function setPlaying(playing) {
    playIcon.firstElementChild.setAttribute("d", playing ? PAUSE_PATH : PLAY_PATH);
    playBtn.title = playing ? "Pause" : "Play";
    playBtn.setAttribute("aria-label", playBtn.title);
}

function showLabels(track) {
    titleEl.textContent = track.title || "Unknown track";
    artistEl.textContent = track.artist || "Spotify";
    coverEl.src = track.cover || DEFAULT_COVER;
    coverEl.alt = `${track.title || "Track"} cover`;
}

function showPlayerError(message, login = false) {
    titleEl.textContent = message;
    artistEl.textContent = login ? "Connect Spotify once to continue" : "Spotify";
    coverEl.src = DEFAULT_COVER;
    coverEl.alt = "Spotify playlist cover";

    if (login) {
        artistEl.style.cursor = "pointer";
        artistEl.title = "Connect Spotify";
        artistEl.onclick = () => { window.location.href = SPOTIFY_LOGIN; };
    }
}

function createOrLoadSpotify(uri, autoplay) {
    if (!spotifyApi) {
        pending = { uri, autoplay };
        return;
    }

    clearTimeout(autoplayTimer);

    if (!controller) {
        spotifyApi.createController(
            embedTarget,
            { uri, width: "100%", height: 80 },
            (ctrl) => {
                controller = ctrl;

                ctrl.addListener("ready", () => {
                    if (pending) return;
                    if (autoplay) {
                        // This is called after the user has clicked Play/Next,
                        // so it is allowed by browser autoplay policies.
                        ctrl.play();
                    }
                });

                ctrl.addListener("playback_started", (event) => {
                    lastPlaybackUri = event?.data?.playingURI || lastPlaybackUri;
                    setPlaying(true);
                });

                ctrl.addListener("playback_update", (event) => {
                    const data = event.data || {};
                    const position = Number(data.position || 0);
                    const duration = Number(data.duration || 0);
                    const isPaused = Boolean(data.isPaused);
                    const playingURI = data.playingURI || lastPlaybackUri;

                    if (playingURI) lastPlaybackUri = playingURI;

                    seek.max = duration / 1000 || 0;
                    seek.value = Math.min(position / 1000, Number(seek.max) || 0);
                    currentTimeEl.textContent = formatTime(position / 1000);
                    durationEl.textContent = formatTime(duration / 1000);
                    setPlaying(!isPaused);

                    // Some browsers/embeds do not reliably emit an "ended"
                    // event. Detect the final 0.5 seconds and advance once.
                    if (
                        duration > 0 &&
                        position >= duration - 500 &&
                        !isPaused &&
                        Date.now() - lastAutoAdvanceAt > 1500 &&
                        !isLoadingTrack
                    ) {
                        lastAutoAdvanceAt = Date.now();
                        loadTrack(currentIndex + 1, true);
                    }
                });

                if (autoplay) {
                    autoplayTimer = window.setTimeout(() => ctrl.play(), 700);
                }
            }
        );
        return;
    }

    isLoadingTrack = true;
    setPlaying(false);
    controller.loadEntity(uri);

    // loadEntity changes the content of the existing Embed. Give it a moment
    // to initialize, then explicitly start playback for Next/Previous/Play.
    autoplayTimer = window.setTimeout(() => {
        if (autoplay && controller) controller.play();
        isLoadingTrack = false;
    }, 650);
}

function loadTrack(index, autoplay) {
    if (!tracks.length) return;

    currentIndex = (index + tracks.length) % tracks.length;
    const track = tracks[currentIndex];
    showLabels(track);
    createOrLoadSpotify(track.uri, autoplay);
}

async function buildPlaylist() {
    try {
        const response = await fetch(PLAYLIST_API, { cache: "no-store" });
        const data = await response.json();

        if (response.status === 401) {
            showPlayerError("Connect Spotify", true);
            return;
        }

        if (!response.ok) {
            throw new Error(data?.error || "Unable to load playlist.");
        }

        tracks = Array.isArray(data.tracks) ? data.tracks : [];

        if (!tracks.length) {
            showPlayerError("No songs in playlist");
            return;
        }

        loadTrack(0, false);
    } catch (error) {
        console.error("Spotify playlist error:", error);
        showPlayerError("Spotify playlist unavailable");
    }
}

playBtn.addEventListener("click", () => {
    if (!tracks.length) return;

    if (!controller) {
        loadTrack(currentIndex === -1 ? 0 : currentIndex, true);
        return;
    }

    controller.togglePlay();
});

prevBtn.addEventListener("click", () => {
    if (tracks.length) loadTrack(currentIndex - 1, true);
});

nextBtn.addEventListener("click", () => {
    if (tracks.length) loadTrack(currentIndex + 1, true);
});

seek.addEventListener("input", () => {
    if (controller) controller.seek(Number(seek.value));
});

buildPlaylist();
