# YouTube Monk Mode

A Chrome extension that strips YouTube down to just the parts you actually came for. No mouse needed in Phase 2.

Two modes, switchable from the extension popup.

---

## Mark-I: Blindfold

YouTube still exists. The temptation doesn't.

A cleaned-up version of YouTube that removes anything designed to keep you scrolling.

**What it does:**
- Redirects the home page → Subscriptions (no algorithmic feed)
- Blocks the History page entirely
- Removes Shorts, end-screen suggestion cards, and sidebar recommendations
- Hides comments, like/share/download buttons (Save stays)
- Forces theatre mode on every video automatically
- Adds a small **screen-time clock** next to the search bar
  - Pauses automatically when you switch tabs
  - Has its own toggle button for **auto-pause**: if turned on, the video itself pauses when you tab away (handy for video content — left off by default since many people use YouTube for background music/audio)

You can still navigate freely to Subscriptions, Saved, Watch Later, and Library. Everything else is out of reach.

---

## Mark-II: Handcuff

YouTube, but you operate it like a terminal.

The entire YouTube interface is hidden and replaced with a full-screen command-line UI. There is no mouse interaction — every action is a keyboard command.

**Layout:**
- **Command bar** (top) — a fake shell prompt (`monk@youtube ~/feed ❯`) where you type commands
- **Left sidebar** — quick nav shortcuts (`~/feed`, `~/trending`, `~/subscriptions`, `~/library`) and session stats
- **Main panel** — search results as a numbered grid, or the video player when something's playing
- **Right panel** — a neofetch-style system info block, "now playing" card, and a keybinding cheat sheet
- **Status bar** (bottom) — tmux-style strip showing system state and hotkey reminders

**Commands:**
```
search [query]      search YouTube
play [01]            play by index number
pause / resume       video control
seek [1:30]          jump to timestamp
speed [0.5–2.0]       playback speed
volume [0–100]       set volume
back                 return to results
fullscreen           toggle fullscreen
trending             jump to trending
```

**Keyboard shortcuts:**
```
/            focus command bar
j / k        navigate result grid
enter        play focused video
space        pause / resume
esc          back to results
f            fullscreen
[ / ]        seek -10s / +10s
< / >        speed -0.25 / +0.25
- / +        volume -10 / +10
↑ / ↓        command history
tab          autocomplete
?            help overlay
q            quit
```

---

## How it actually works (no APIs, no cost)

Nothing here calls the YouTube Data API. Everything is read directly from what YouTube itself already loads on the page.

- **Search results** are pulled by fetching YouTube's search results page and parsing the `ytInitialData` JSON that YouTube embeds in its own HTML — the same data YouTube's React-like frontend uses to render its results.
- **Thumbnails, titles, channel names, durations** all come from that same JSON, just reformatted into the terminal-style grid.
- **The Blindfold clock and layout fixes** work by watching the DOM with a `MutationObserver` and hiding/rearranging YouTube's existing elements directly.

This keeps the extension completely free with no quota limits, since it's just reading and restyling what's already there instead of going through a billed API.

---

## File structure

```
yt-monk-mode/
├── manifest.json   — extension config, permissions, declares all files
├── content.js      — the brain: builds both modes, parses commands,
│                     scrapes YouTube's own page data, controls the video
├── style.css       — hides YouTube's native UI, styles both modes
├── popup.html      — the extension popup (mode switcher)
└── popup.js        — handles mode switching + reloading the YouTube tab
```

---

## Installation

1. Unzip the downloaded folder
2. Open Chrome → go to `chrome://extensions`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** → select the unzipped folder
5. Click the extension icon → pick a mode

---

## Known limitation

Some videos block third-party embedding by the uploader's choice (YouTube error 152). Mark-II's player currently routes through YouTube's embed player, which respects that restriction — those specific videos may show "video unavailable" inside Handcuff mode even though they play fine on youtube.com directly. A fix using YouTube's own page-rendered player (instead of the embed) is in progress.

---

## Roadmap

- **Mark-III** (concept): network-level recommendation blocking, watch-time limits, autoplay interception

---

Built as a personal experiment in digital restraint.
