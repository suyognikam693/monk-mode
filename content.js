(function () {
  'use strict';

  // ─── Load mode from storage, then boot ───────────────────────────────────
  chrome.storage.local.get({ mode: 'blindfold' }, ({ mode }) => {
    if (mode === 'handcuff') bootHandcuff();
    else bootBlindFold();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — BLINDFOLD
  // ═══════════════════════════════════════════════════════════════════════════
  function bootBlindFold() {
    const path = location.pathname;

    // Redirect home → subscriptions
    if (path === '/') { location.replace('/feed/subscriptions'); return; }

    // Block history
    if (path.includes('feed/history')) {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.innerHTML = `<div style="font-family:monospace;display:flex;flex-direction:column;
          align-items:center;justify-content:center;height:100vh;background:#000;color:#00c853;gap:12px;">
          <div style="font-size:11px;letter-spacing:.2em;color:#333;">MONK MODE</div>
          <div style="font-size:20px;">History is off.</div>
          <a href="/feed/subscriptions" style="margin-top:12px;font-size:11px;color:#00c853;
            text-decoration:none;border:1px solid #00c853;padding:8px 20px;border-radius:3px;">
            → SUBSCRIPTIONS</a></div>`;
      });
      return;
    }

    // Dynamic DOM cleaner
    const obs = new MutationObserver(() => {
      document.getElementById('related')?.remove();
      document.querySelectorAll('ytd-reel-shelf-renderer,.ytp-ce-element,ytd-comments').forEach(e => e.remove());
      if (location.pathname === '/watch') applyWatchLayout();
    });
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true });
      injectClock();
    });

    // Tab visibility → clock pause + optional autopause
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        pauseClock();
        chrome.storage.local.get({ autoPause: false }, ({ autoPause }) => {
          if (autoPause) document.querySelector('video')?.pause();
        });
      } else resumeClock();
    });
  }

  // ─── Blindfold helpers ────────────────────────────────────────────────────
  let clockInterval = null, elapsedSecs = 0, clockEl = null;

  function injectClock() {
    const wait = setInterval(() => {
      const end = document.querySelector('#end');
      if (!end || document.getElementById('monk-clock')) return;
      clearInterval(wait);
      const w = document.createElement('div');
      w.id = 'monk-clock';
      w.innerHTML = `<span id="monk-time">00:00</span>
        <button id="monk-ap" title="Auto-pause on tab switch">⏸</button>`;
      end.insertBefore(w, end.firstChild);
      clockEl = document.getElementById('monk-time');
      document.getElementById('monk-ap').addEventListener('click', () => {
        chrome.storage.local.get({ autoPause: false }, ({ autoPause }) => {
          const next = !autoPause;
          chrome.storage.local.set({ autoPause: next });
          document.getElementById('monk-ap').classList.toggle('on', next);
        });
      });
      resumeClock();
    }, 400);
  }

  function resumeClock() {
    if (clockInterval || !clockEl) return;
    clockInterval = setInterval(() => {
      elapsedSecs++;
      if (clockEl) clockEl.textContent = fmt(elapsedSecs);
    }, 1000);
  }
  function pauseClock() { clearInterval(clockInterval); clockInterval = null; }
  function fmt(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  }
  function p(n) { return String(n).padStart(2, '0'); }

  function applyWatchLayout() {
    chrome.storage.local.get({ theatreMode: true }, ({ theatreMode }) => {
      if (theatreMode) {
        const player = document.querySelector('#movie_player');
        if (player && !document.querySelector('ytd-watch-flexy[theater]')) {
          document.querySelector('.ytp-size-button')?.click();
        }
      }
    });
    document.querySelectorAll('#top-level-buttons-computed > *').forEach(btn => {
      const txt = (btn.innerText + (btn.getAttribute('aria-label') || '')).toLowerCase();
      btn.style.display = (txt.includes('save') || txt.includes('ask')) ? '' : 'none';
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — HANDCUFF
  // ═══════════════════════════════════════════════════════════════════════════
  function bootHandcuff() {
    // Hide YouTube immediately
    const hideStyle = document.createElement('style');
    hideStyle.id = 'monk-hide';
    hideStyle.textContent = 'body > * { display: none !important; } body { background: #000 !important; }';
    (document.head || document.documentElement).appendChild(hideStyle);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initHandcuff);
    } else {
      initHandcuff();
    }
  }

  // ─── Handcuff state ───────────────────────────────────────────────────────
  let hState = {
    view: 'search',       // 'search' | 'player'
    results: [],          // extracted video cards
    focused: 0,           // keyboard cursor index
    cmdHistory: [],
    historyIdx: -1,
    currentVideo: null,
  };
  const _sessionStart = Date.now();
  const saved = sessionStorage.getItem('monk-session');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      hState.results = s.results || [];
      // Restore currentVideo so now-playing & progress work after autoplay reload
      if (s.currentVideo) hState.currentVideo = s.currentVideo;
    } catch(e) {}
  }

  function initHandcuff() {
    if (!document.body) return;
    // Build the full terminal UI
    document.body.style.cssText = 'margin:0;padding:0;background:#000;overflow:hidden;';

    const calStyle = document.createElement('style');
    calStyle.id = 'monk-cal-style';
    calStyle.textContent = `
      #monk-ascii-cal {
        font-family: monospace;
        font-size: 11px;
        color: #444;
        padding: 10px 8px 6px;
        line-height: 1.5;
        border-top: 1px solid #1a1a1a;
      }
      #monk-ascii-cal .cal-month {
        color: #00c853;
        font-size: 10px;
        letter-spacing: .15em;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      #monk-ascii-cal .cal-grid {
        white-space: pre;
        color: #333;
        font-size: 10px;
        line-height: 1.55;
      }
      #monk-ascii-cal .cal-grid b {
        color: #00c853;
        font-weight: bold;
      }
      #monk-ascii-cal .cal-dow {
        margin-top: 6px;
        color: #555;
        font-size: 10px;
        letter-spacing: .2em;
      }
      #monk-ascii-cal .cal-date {
        font-size: 26px;
        color: #00c853;
        line-height: 1.1;
        letter-spacing: .05em;
      }
      #monk-ascii-cal .cal-date b { font-weight: 900; }
      #monk-ascii-cal .cal-time {
        font-size: 16px;
        color: #00c853;
        letter-spacing: .08em;
        margin-top: 2px;
      }
      #monk-ascii-cal .cal-time b { font-weight: 900; }
      #monk-ascii-cal .cal-sec { color: #2a6e3a; font-size: 13px; }
    `;
    document.head.appendChild(calStyle);

    const app = document.createElement('div');
    app.id = 'monk-app';
    app.innerHTML = buildShell();
    document.body.appendChild(app);

    // Restore YouTube's elements (hidden by CSS, we'll control video ourselves)
    document.getElementById('monk-hide')?.remove();

    // Move YouTube's actual page into a hidden container so video works
    const ytContainer = document.createElement('div');
    ytContainer.id = 'monk-yt-bg';
    ytContainer.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0.01;z-index:-1;';
    document.body.appendChild(ytContainer);

    // Re-show original YT body children inside hidden container
    Array.from(document.body.children).forEach(el => {
      if (el.id !== 'monk-app' && el.id !== 'monk-yt-bg') {
        try {
          ytContainer.appendChild(el);
        } catch (e) {
          console.warn('Could not move YouTube element:', el, e);
        }
      }
    });

    bindHandcuffEvents();
    updateStatusBar();
    setInterval(updateStatusBar, 1000);

    // Catch YouTube SPA autoplay navigations (yt-navigate-finish fires when
    // YouTube's own router moves to a new /watch page without a full reload)
    document.addEventListener('yt-navigate-finish', () => {
      if (location.pathname === '/watch') {
        const urlVideoId = new URLSearchParams(location.search).get('v');
        if (urlVideoId && hState.currentVideo && urlVideoId !== hState.currentVideo.id) {
          // Autoplay moved to a new video
          const domTitle = document.title.replace(' - YouTube', '').trim();
          hState.currentVideo = { id: urlVideoId, title: domTitle, channel: '', duration: '' };
          updateNowPlaying(hState.currentVideo);
          // Re-attach progress polling to the (possibly new) video element
          _stopProgressInterval();
          const v = getVideo();
          if (v) {
            _progressInterval = setInterval(() => _updateProgressFromVideo(v), 500);
          }
        }
      }
    });

    // If we're on a watch page, auto-enter player mode
    if (location.pathname === '/watch') {
      setTimeout(() => enterPlayerMode(), 3000);
    } else {
      // Auto-load subscriptions feed if we're on the feed page
      if (location.pathname === '/feed/subscriptions' || location.pathname === '/') {
        setTimeout(() => {
          showPromptOutput('> loading subscriptions feed...');
          fetchSubscriptionsFeed();
        }, 2000);
      } else {
        showPromptOutput('> Type a command to begin. Press [?] for help.');
      }
    }
  }

  // ─── Build HTML shell ─────────────────────────────────────────────────────
  function buildShell() {
    return `
    <div id="monk-shell">

      <!-- COMMAND BAR -->
      <div id="monk-cmdbar">
        <span id="monk-prompt"><span class="p-user">monk@youtube</span> <span class="p-path">~/feed</span> <span class="p-arrow">❯</span></span>
        <input id="monk-input" type="text" autocomplete="off" spellcheck="false" placeholder="" />
        <div id="monk-autocomplete"></div>
      </div>

      <!-- BODY -->
      <div id="monk-body">

        <!-- LEFT SIDEBAR -->
        <div id="monk-sidebar">
          <div class="sb-user">root@handcuff</div>
          <div class="sb-divider"></div>
          <div class="sb-nav">
            <div class="sb-item active" data-cmd="cd ~/feed">~/feed</div>
            <div class="sb-item" data-cmd="cd ~/subscriptions">~/subscriptions</div>
          </div>
          <div class="sb-divider"></div>
          <div id="monk-ascii-cal"></div>
          <div style="flex:1"></div>
        </div>

        <!-- MAIN CONTENT -->
        <div id="monk-main">
          <div id="monk-output"></div>
          <div id="monk-grid"></div>
          <div id="monk-player-wrap" style="display:none">
            <div id="monk-player-meta"></div>
            <div id="monk-player-area">
              <video id="monk-video" controls></video>
            </div>
            <div id="monk-progress-wrap">
              <div id="monk-progress-bar"><div id="monk-progress-fill"></div></div>
              <div id="monk-progress-text">00:00 / 00:00 · 1.0x · vol 100</div>
            </div>
          </div>
        </div>

        <!-- RIGHT PANEL -->
        <div id="monk-right">
          <div id="monk-neofetch">
            <div class="neo-art">


                 =#@@@@@@@@@@@+-
                 %@@  @@@@@@@@@*
                 %@@@@@@@@@@@@@*
                 %@@@@@@@@@@@@@*
                %@@@@@@
                %@@@@@@@@@@%.  
 =@:         -+@@@@@@%        
 =@*-     =*%@@@@@@@@@**+.     
 =@@@#  .#@@@@@@@@@@@@-%%..
 =@@@@@@@@@@@@@@@@@@@%         
  -@@@@@@@@@@@@@@@@@@@% 
  .%@@@@@@@@@@@@@@@@+ 
    :=@@@@@@@@@@@@@=:  
      .:#@@@@@@@@@#:.
       .:@@@@-=@@#. 
         :@@#   .%#  
         :@#=.  .%%=.</div>
            <div class="neo-info">
              <div class="neo-title">user@handcuff</div>
              <div class="neo-line">──────────────</div>
              <div class="neo-item"><span class="neo-key">OS:</span> Monk Mode II</div>
              <div class="neo-item"><span class="neo-key">WM:</span> Handcuff</div>
              <div class="neo-item"><span class="neo-key">Shell:</span> monksh v2.1</div>
              <div class="neo-item"><span class="neo-key">Term:</span> youtube</div>
              <div class="neo-item"><span class="neo-key">Uptime:</span> <span id="neo-uptime">0m</span></div>
            </div>
          </div>

          <div id="monk-nowplaying">
            <div class="np-label">NOW PLAYING</div>
            <div id="np-content" class="np-idle">[IDLE]<br><span>select a video to begin</span></div>
          </div>

          <div id="monk-keybinds">
            <div class="kb-label">KEYBINDINGS</div>
            <div class="kb-grid">
              <span class="kb-key">[ / ]</span><span class="kb-desc">focus command bar</span>
              <span class="kb-key">[ j/k ]</span><span class="kb-desc">navigate grid</span>
              <span class="kb-key">[ enter ]</span><span class="kb-desc">play selection</span>
              <span class="kb-key">[ space ]</span><span class="kb-desc">pause / resume</span>
              <span class="kb-key">[ esc ]</span><span class="kb-desc">back to feed</span>
              <span class="kb-key">[ f ]</span><span class="kb-desc">fullscreen</span>
              <span class="kb-key">[ [ / ] ]</span><span class="kb-desc">seek ±10s</span>
              <span class="kb-key">[ < / > ]</span><span class="kb-desc">speed ±0.25</span>
              <span class="kb-key">[ - / + ]</span><span class="kb-desc">volume ±10</span>
              <span class="kb-key">[ q ]</span><span class="kb-desc">terminate session</span>
            </div>
          </div>
        </div>

      </div><!-- /body -->

      <!-- STATUS BAR -->
      <div id="monk-statusbar">
        <span id="sb-system">[SYSTEM READY] · KERNEL: monksh-2.1 · MEM: handcuff</span>
        <span class="sb-spacer"></span>
        <span class="sb-tag" id="sb-home">[G] HOME</span>
        <span class="sb-tag active" id="sb-search-tag">[S] SEARCH</span>
        <span class="sb-tag" id="sb-cmd-tag">[/] CMD</span>
        <span class="sb-tag" id="sb-help-tag">[?] HELP</span>
      </div>

    </div><!-- /shell -->

    <!-- HELP OVERLAY -->
    <div id="monk-help-overlay" style="display:none">
      <div id="monk-help-box">
        <div class="help-title">KEYBOARD REFERENCE</div>
        <div class="help-grid">
          <span class="hk">/</span><span class="hd">focus command bar</span>
          <span class="hk">j / k</span><span class="hd">navigate results</span>
          <span class="hk">Enter</span><span class="hd">play focused video</span>
          <span class="hk">Space</span><span class="hd">pause / resume</span>
          <span class="hk">f</span><span class="hd">fullscreen toggle</span>
          <span class="hk">Esc</span><span class="hd">back to results</span>
          <span class="hk">[ / ]</span><span class="hd">seek −10s / +10s</span>
          <span class="hk">&lt; / &gt;</span><span class="hd">speed −0.25 / +0.25</span>
          <span class="hk">- / +</span><span class="hd">volume −10 / +10</span>
          <span class="hk">↑ / ↓</span><span class="hd">command history</span>
          <span class="hk">Tab</span><span class="hd">autocomplete</span>
          <span class="hk">?</span><span class="hd">this screen</span>
          <span class="hk">q</span><span class="hd">quit / close</span>
        </div>
        <div class="help-commands">
          <div class="help-title" style="margin-top:12px">COMMANDS</div>
          <div class="help-grid">
            <span class="hk">search [query]</span><span class="hd">search youtube</span>
            <span class="hk">cd ~/feed</span><span class="hd">load subscriptions feed</span>
            <span class="hk">play [01]</span><span class="hd">play by index</span>
            <span class="hk">pause / resume</span><span class="hd">video control</span>
            <span class="hk">seek [1:30]</span><span class="hd">jump to timestamp</span>
            <span class="hk">speed [0.5–2]</span><span class="hd">playback speed</span>
            <span class="hk">volume [0–100]</span><span class="hd">set volume</span>
            <span class="hk">back</span><span class="hd">return to results</span>
            <span class="hk">fullscreen</span><span class="hd">toggle fullscreen</span>
          </div>
        </div>
      </div>
    </div>
    `;
  }

  // ─── Command autocomplete data ────────────────────────────────────────────
  const COMMANDS = [
    { cmd: 'search ', desc: 'search youtube' },
    { cmd: 'play ', desc: 'play by index number' },
    { cmd: 'pause', desc: 'pause video' },
    { cmd: 'resume', desc: 'resume video' },
    { cmd: 'seek ', desc: 'jump to timestamp e.g. seek 1:30' },
    { cmd: 'speed ', desc: 'set playback speed e.g. speed 1.5' },
    { cmd: 'volume ', desc: 'set volume 0-100' },
    { cmd: 'back', desc: 'return to results' },
    { cmd: 'fullscreen', desc: 'toggle fullscreen' },
  ];

  // ─── Bind all events ──────────────────────────────────────────────────────
  function bindHandcuffEvents() {
    const input = document.getElementById('monk-input');

    // Focus input on / key or clicking anywhere
    document.addEventListener('keydown', handleGlobalKey);
    document.getElementById('monk-app').addEventListener('click', e => {
      if (!e.target.closest('#monk-grid') && !e.target.closest('#monk-right') &&
          !e.target.closest('#monk-sidebar') && !e.target.closest('#monk-help-overlay')) {
        input.focus();
      }
    });

    input.addEventListener('keydown', handleInputKey);
    input.addEventListener('input', handleAutocomplete);

    // Sidebar nav items
    document.querySelectorAll('.sb-item').forEach(item => {
      item.addEventListener('click', () => {
        const cmd = item.dataset.cmd;
        if (cmd) { input.value = cmd; executeCommand(cmd); }
      });
    });

    // ASCII calendar — update immediately and every second
    renderAsciiCal();
    setInterval(renderAsciiCal, 1000);

    // Progress updates — handled dynamically by _progressInterval when playing
    // But keep the placeholder video element listener as fallback
    const video = document.getElementById('monk-video');
    if (video) {
      video.addEventListener('timeupdate', updateProgress);
      video.addEventListener('ended', () => showPromptOutput('> [stream ended]'));
    }

    input.focus();
  }

  // ─── Global keydown (when input not focused) ──────────────────────────────
  function handleGlobalKey(e) {
    const input = document.getElementById('monk-input');
    const focused = document.activeElement === input;
    const overlay = document.getElementById('monk-help-overlay');

    // ? toggle help
    if (e.key === '?' && !focused) {
      e.preventDefault();
      overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
      return;
    }

    if (overlay.style.display !== 'none') {
      if (e.key === 'Escape' || e.key === '?') overlay.style.display = 'none';
      return;
    }

    // / to focus input
    if (e.key === '/' && !focused) { e.preventDefault(); input.focus(); return; }

    if (focused) return; // let input handle it

    const video = document.getElementById('monk-video');

    switch (e.key) {
      case 'j': moveFocus(1); break;
      case 'k': moveFocus(-1); break;
      case 'Enter':
        if (hState.view === 'search' && hState.results.length) playVideo(hState.focused);
        break;
      case ' ':
        e.preventDefault();
        if (video) { video.paused ? video.play() : video.pause(); updateNowPlaying(); }
        break;
      case 'f':
        e.preventDefault();
        if (video) { document.fullscreenElement ? document.exitFullscreen() : video.requestFullscreen(); }
        break;
      case 'Escape':
        if (hState.view === 'player') exitPlayerMode();
        break;
      case '[':
        if (video) video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      case ']':
        if (video) video.currentTime = Math.min(video.duration, video.currentTime + 10);
        break;
      case '<':
        if (video) { video.playbackRate = Math.max(0.25, +(video.playbackRate - 0.25).toFixed(2)); updateProgress(); }
        break;
      case '>':
        if (video) { video.playbackRate = Math.min(3, +(video.playbackRate + 0.25).toFixed(2)); updateProgress(); }
        break;
      case '-':
        if (video) { video.volume = Math.max(0, +(video.volume - 0.1).toFixed(1)); updateProgress(); }
        break;
      case '+':
      case '=':
        if (video) { video.volume = Math.min(1, +(video.volume + 0.1).toFixed(1)); updateProgress(); }
        break;
      case 'q':
        window.close();
        break;
    }
  }

  // ─── Input keydown ────────────────────────────────────────────────────────
  function handleInputKey(e) {
    const input = document.getElementById('monk-input');
    const ac = document.getElementById('monk-autocomplete');

    if (e.key === 'Enter') {
      const cmd = input.value.trim();
      if (!cmd) return;
      hState.cmdHistory.unshift(cmd);
      hState.historyIdx = -1;
      input.value = '';
      ac.style.display = 'none';
      executeCommand(cmd);
    } else if (e.key === 'Escape') {
      input.blur();
      ac.style.display = 'none';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hState.historyIdx < hState.cmdHistory.length - 1) {
        hState.historyIdx++;
        input.value = hState.cmdHistory[hState.historyIdx];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hState.historyIdx > 0) {
        hState.historyIdx--;
        input.value = hState.cmdHistory[hState.historyIdx];
      } else {
        hState.historyIdx = -1;
        input.value = '';
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const first = ac.querySelector('.ac-item');
      if (first) { input.value = first.dataset.cmd; ac.style.display = 'none'; }
    }
  }

  // ─── Autocomplete ─────────────────────────────────────────────────────────
  function handleAutocomplete() {
    const input = document.getElementById('monk-input');
    const ac = document.getElementById('monk-autocomplete');
    const val = input.value.toLowerCase();
    if (!val) { ac.style.display = 'none'; return; }

    const matches = COMMANDS.filter(c => c.cmd.toLowerCase().startsWith(val));
    if (!matches.length) { ac.style.display = 'none'; return; }

    ac.innerHTML = matches.slice(0, 6).map(m =>
      `<div class="ac-item" data-cmd="${m.cmd}">
        <span class="ac-cmd">${m.cmd.trim()}</span>
        <span class="ac-desc">${m.desc}</span>
      </div>`
    ).join('');

    ac.querySelectorAll('.ac-item').forEach(item => {
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = item.dataset.cmd;
        ac.style.display = 'none';
        input.focus();
      });
    });

    ac.style.display = 'block';
  }

  // ─── Command executor ─────────────────────────────────────────────────────
  function executeCommand(raw) {
    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    updatePromptPath(cmd);

    switch (cmd) {
      case 'search':
        if (!args) { showPromptOutput('> usage: search [query]'); return; }
        doSearch(args);
        break;
      case 'play':
        const idx = parseInt(args, 10);
        if (isNaN(idx)) { showPromptOutput('> usage: play [index] e.g. play 03'); return; }
        playVideo(idx);
        break;
      case 'pause':
        getVideo()?.pause();
        showPromptOutput('> paused.');
        break;
      case 'resume':
        getVideo()?.play();
        showPromptOutput('> resumed.');
        break;
      case 'back':
        exitPlayerMode();
        break;
      case 'seek': {
        const v = getVideo();
        if (!v) { showPromptOutput('> no video playing.'); return; }
        const t = parseTimestamp(args);
        if (t === null) { showPromptOutput('> usage: seek 1:30 or seek 90'); return; }
        v.currentTime = t;
        showPromptOutput(`> seeked to ${fmt(Math.floor(t))}`);
        break;
      }
      case 'speed': {
        const v = getVideo();
        if (!v) { showPromptOutput('> no video playing.'); return; }
        const s = parseFloat(args);
        if (isNaN(s) || s < 0.25 || s > 3) { showPromptOutput('> usage: speed [0.25–3.0]'); return; }
        v.playbackRate = s;
        showPromptOutput(`> speed set to ${s}x`);
        updateProgress();
        break;
      }
      case 'volume': {
        const v = getVideo();
        if (!v) { showPromptOutput('> no video playing.'); return; }
        const vol = parseInt(args, 10);
        if (isNaN(vol) || vol < 0 || vol > 100) { showPromptOutput('> usage: volume [0–100]'); return; }
        v.volume = vol / 100;
        showPromptOutput(`> volume set to ${vol}`);
        updateProgress();
        break;
      }
      case 'fullscreen': {
        const v = getVideo();
        if (!v) { showPromptOutput('> no video playing.'); return; }
        document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen();
        break;
      }
      case 'trending':
        showPromptOutput('> trending removed. use: search [query]');
        break;
      case 'cd':
        handleCd(args);
        break;
      case '?':
      case 'help':
        document.getElementById('monk-help-overlay').style.display = 'flex';
        break;
      case 'clear':
        document.getElementById('monk-output').innerHTML = '';
        break;
      default:
        showPromptOutput(`> command not found: ${cmd}. Type ? for help.`);
    }
  }

  function handleCd(path) {
    const map = {
      '~/feed': '/feed/subscriptions',
      '~/subscriptions': '/feed/subscriptions',
    };
    if (map[path]) {
      showPromptOutput('> loading subscriptions feed...');
      fetchSubscriptionsFeed();
    } else {
      showPromptOutput(`> no such directory: ${path}`);
    }
  }

  // ─── Subscriptions feed loader ────────────────────────────────────────────
  function fetchSubscriptionsFeed() {
    // Read ytInitialData directly from the already-loaded YT page in the hidden
    // background container — this has auth baked in, unlike fetch() which
    // doesn't send session cookies in the extension context.
    const tryParseFromDOM = () => {
      // ytInitialData is set as a global on the YT page
      const ytBg = document.getElementById('monk-yt-bg');
      const win = ytBg?.contentWindow;

      // First try: grab from the live window object of the bg frame (if iframe)
      let data = null;
      try { data = win?.ytInitialData; } catch(e) {}

      // Second try: grab from the current page's own window (we're on /feed/subscriptions)
      if (!data) {
        try { data = window.ytInitialData; } catch(e) {}
      }

      // Third try: parse from the script tags in the current document
      if (!data) {
        for (const script of document.querySelectorAll('script')) {
          const t = script.textContent || '';
          if (t.includes('ytInitialData')) {
            const m = t.match(/ytInitialData\s*=\s*(\{.+?\});\s*(?:\/\/|<|window\[)/s)
                   || t.match(/ytInitialData\s*=\s*(\{[\s\S]+\})\s*;/);
            if (m) { try { data = JSON.parse(m[1]); break; } catch(e) {} }
          }
        }
      }

      return data ? parseSubscriptionsFeedData(data) : [];
    };

    const results = tryParseFromDOM();
    if (results.length) {
      hState.results = results;
      hState.focused = 0;
      renderGrid(results, 'subscriptions');
      showPromptOutput(`> ${results.length} latest videos from subscriptions · j/k navigate · enter to play`);
      updatePromptPath('~/subscriptions');
      document.querySelectorAll('.sb-item').forEach(el => {
        el.classList.toggle('active', el.dataset.cmd === 'cd ~/subscriptions' || el.dataset.cmd === 'cd ~/feed');
      });
    } else {
      showPromptOutput('> no videos found. make sure you are on youtube.com and signed in.');
      showPromptOutput('> tip: navigate to youtube.com/feed/subscriptions first, then reload.');
    }
  }

  function parseSubscriptionsFeedData(data) {
    try {
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
      const feedTab = tabs.find(t => t?.tabRenderer?.selected) || tabs[0];
      const sections = feedTab?.tabRenderer?.content?.richGridRenderer?.contents || [];
      const videos = [];
      for (const section of sections) {
        const item = section?.richItemRenderer?.content?.videoRenderer
                  || section?.richItemRenderer?.content?.reelItemRenderer;
        if (!item) continue;
        const id = item.videoId;
        const title = item.title?.runs?.[0]?.text || item.headline?.runs?.[0]?.text || 'Untitled';
        const channel = item.ownerText?.runs?.[0]?.text || item.shortBylineText?.runs?.[0]?.text || '';
        const duration = item.lengthText?.simpleText || '';
        const thumb = item.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
        const live = item.badges?.some(b => b.metadataBadgeRenderer?.label === 'LIVE') || false;
        if (id) videos.push({ id, title, channel, duration, thumb, live });
        if (videos.length >= 20) break;
      }
      return videos;
    } catch(e) { return []; }
  }

  // ─── Search: scrape YouTube's DOM ─────────────────────────────────────────
  function doSearch(query) {
    showPromptOutput(`> search ${query}`);
    showPromptOutput(`> fetching results...`);

    // Navigate YouTube to the search URL (hidden in background)
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

    // Use fetch to get the page HTML, parse results from it
    fetch(searchUrl)
      .then(r => r.text())
      .then(html => {
        const results = parseYouTubeSearchHTML(html);
        if (!results.length) {
          showPromptOutput('> no results found. try another query.');
          return;
        }
        hState.results = results;
        hState.focused = 0;
        renderGrid(results, query);
        showPromptOutput(`> ${results.length} results for "${query}" · j/k navigate · enter to play`);
      })
      .catch(() => {
        // Fallback: navigate and scrape live DOM
        showPromptOutput('> loading results from page...');
        navigateAndScrape(query);
      });
  }

  function parseYouTubeSearchHTML(html) {
    // Extract ytInitialData JSON from the page
    const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s) ||
                  html.match(/ytInitialData\s*=\s*({.+?});\s*(?:\/\/|<)/s);
    if (!match) return [];

    try {
      const data = JSON.parse(match[1]);
      const contents = data?.contents?.twoColumnSearchResultsRenderer
        ?.primaryContents?.sectionListRenderer?.contents;
      if (!contents) return [];

      const videos = [];
      for (const section of contents) {
        const items = section?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const v = item?.videoRenderer;
          if (!v) continue;
          const id = v.videoId;
          const title = v.title?.runs?.[0]?.text || 'Untitled';
          const channel = v.ownerText?.runs?.[0]?.text || v.shortBylineText?.runs?.[0]?.text || '';
          const duration = v.lengthText?.simpleText || '';
          const thumb = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
          const live = v.badges?.some(b => b.metadataBadgeRenderer?.label === 'LIVE') || false;
          if (id) videos.push({ id, title, channel, duration, thumb, live });
          if (videos.length >= 16) break;
        }
        if (videos.length >= 16) break;
      }
      return videos;
    } catch (e) {
      return [];
    }
  }

  function navigateAndScrape(query) {
    // Fallback: show guidance
    showPromptOutput('> use search [query] to search again if results are empty.');
  }

  // ─── Render video grid ────────────────────────────────────────────────────
  function renderGrid(videos, query) {
    hState.view = 'search';
    const grid = document.getElementById('monk-grid');
    const playerWrap = document.getElementById('monk-player-wrap');
    playerWrap.style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = videos.map((v, i) => `
      <div class="monk-card ${i === 0 ? 'focused' : ''}" data-index="${i}" tabindex="-1">
        <div class="card-thumb-wrap">
          <img class="card-thumb" src="${v.thumb}" alt="" loading="lazy" />
          ${v.live ? '<span class="card-live">LIVE</span>' : ''}
          <span class="card-dur">${v.duration}</span>
        </div>
        <div class="card-info">
          <div class="card-title"><span class="card-idx">[${String(i).padStart(2,'0')}]</span> ${escHtml(v.title)}</div>
          <div class="card-meta">${escHtml(v.channel)}</div>
        </div>
      </div>
    `).join('');

    // Click to focus (visual only — no mouse play)
    grid.querySelectorAll('.monk-card').forEach(card => {
      card.addEventListener('click', () => {
        const idx = parseInt(card.dataset.index);
        moveFocusTo(idx);
      });
      card.addEventListener('dblclick', () => {
        playVideo(parseInt(card.dataset.index));
      });
    });

    updatePromptPath('~/results');
  }

  // ─── Focus navigation ─────────────────────────────────────────────────────
  function moveFocus(delta) {
    if (!hState.results.length) return;
    moveFocusTo(Math.max(0, Math.min(hState.results.length - 1, hState.focused + delta)));
  }

  function moveFocusTo(idx) {
    const cards = document.querySelectorAll('.monk-card');
    cards[hState.focused]?.classList.remove('focused');
    hState.focused = idx;
    const card = cards[idx];
    card?.classList.add('focused');
    card?.scrollIntoView({ block: 'nearest' });
  }

  // ─── Play video ───────────────────────────────────────────────────────────
  function playVideo(idx) {
    const video = hState.results[idx];
    if (!video) { showPromptOutput(`> index [${idx}] not found.`); return; }

    hState.currentVideo = video;

    // Clear reload key to force a fresh reload for this play session
    sessionStorage.removeItem(`monk-reloaded-${video.id}`);

    showPromptOutput(`> play [${String(idx).padStart(2,'0')}] ${video.title}`);
    enterPlayerMode(video);
  }

  function enterPlayerMode(video) {
    if (!video && location.pathname === '/watch') {
      // Coming from a direct watch URL or autoplay — extract from URL + DOM
      // Prefer session-restored currentVideo but update ID from URL
      const urlVideoId = new URLSearchParams(location.search).get('v');
      if (hState.currentVideo && urlVideoId && hState.currentVideo.id !== urlVideoId) {
        // Autoplay moved to a new video — update currentVideo with new ID
        // Try to get title from YT DOM
        const domTitle = document.title.replace(' - YouTube', '').trim();
        hState.currentVideo = { id: urlVideoId, title: domTitle || hState.currentVideo.title, channel: hState.currentVideo.channel, duration: '' };
      } else if (!hState.currentVideo) {
        video = extractCurrentVideoFromDOM();
      }
      if (!video) video = hState.currentVideo;
    }
    if (!video) return;

    hState.view = 'player';
    hState.currentVideo = video;

    document.getElementById('monk-grid').style.display = 'none';
    document.getElementById('monk-player-wrap').style.display = 'flex';

    // Update meta bar
    document.getElementById('monk-player-meta').textContent =
      `[${video.title}] · ${video.channel || ''} · ${video.duration || ''}`;

    // Navigate YT's own player to this video and steal the native <video>
    loadVideoIntoPlayer(video.id);

    updateNowPlaying(video);
    updatePromptPath(`~/watch/${video.id}`);
  }

  // ── Core: navigate the real YT page to the watch URL, then steal its <video> ──
  let _progressInterval = null;

  function loadVideoIntoPlayer(videoId) {
    const playerArea = document.getElementById('monk-player-area');

    // Stop any progress interval left over from a previously playing video
    _stopProgressInterval();

    // Show a loading placeholder in our terminal UI
    playerArea.innerHTML = `
      <div id="monk-loading" style="
        display:flex;align-items:center;justify-content:center;
        width:100%;height:100%;color:#00c853;font-family:monospace;font-size:13px;
        flex-direction:column;gap:8px;letter-spacing:.1em;">
        <div id="monk-loading-spinner" style="font-size:20px;">⠋</div>
        <div>LOADING STREAM...</div>
        <div style="color:#444;font-size:11px;">navigating player</div>
      </div>`;

    // Animate spinner
    const spinFrames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    let spinIdx = 0;
    const spinTimer = setInterval(() => {
      const el = document.getElementById('monk-loading-spinner');
      if (el) el.textContent = spinFrames[spinIdx++ % spinFrames.length];
    }, 80);

    // Navigate the hidden YT background page to the watch URL
    const ytBg = document.getElementById('monk-yt-bg');
    if (!ytBg) {
      clearInterval(spinTimer);
      showPromptOutput('> error: yt background container missing');
      return;
    }

    // Only navigate if we're not already on this exact watch page.
    // A full `window.location.href` assignment reloads the whole tab and
    // destroys this script's context (and the poll below). If we're
    // already on /watch?v=<videoId> (e.g. re-entering player mode after
    // initHandcuff's auto-enter on a direct watch URL), skip navigation
    // entirely and just poll for the existing <video> element — otherwise
    // we'd trigger a second reload that races the first and breaks polling.
    const currentVideoId = new URLSearchParams(location.search).get('v');
    const alreadyOnVideo = location.pathname === '/watch' && currentVideoId === videoId;

    if (!alreadyOnVideo) {
      // Save session before reload
      const cv = hState.currentVideo;
      sessionStorage.setItem('monk-session', JSON.stringify({
        results: hState.results,
        currentVideo: cv ? { id: cv.id, title: cv.title, channel: cv.channel, duration: cv.duration } : null,
      }));
      window.location.href = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
      return;
    }
    // We're on the right /watch page, but this may be the first (cold) load
    // where YouTube's player hasn't initialized yet. Force one extra reload
    // so the SECOND load starts polling against an already-warm page.
    

    // Poll for the real <video> inside YouTube's #movie_player
    let attempts = 0;
    const maxAttempts = 200; // up to ~20s

    const poll = setInterval(() => {
      attempts++;

      // Find YT's actual video element (not our placeholder)
      const moviePlayer = document.querySelector('#movie_player') ||
                          ytBg.querySelector('#movie_player');
      const ytVideo = moviePlayer?.querySelector('video') ||
                      document.querySelector('video.html5-main-video') ||
                      document.querySelector('video[src]') ||
                      (() => {
                        // Broader search
                        for (const v of document.querySelectorAll('video')) {
                          if (v.src || v.currentSrc || v.querySelector('source')) return v;
                        }
                        return null;
                      })();

      if (ytVideo && (ytVideo.readyState >= 1 || ytVideo.src || ytVideo.currentSrc)) {
        clearInterval(poll);
        clearInterval(spinTimer);
        _attachNativeVideo(ytVideo, playerArea, videoId);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        clearInterval(spinTimer);
        // Final fallback: steal whatever video exists on the page
        const anyVideo = document.querySelector('video');
        if (anyVideo) {
          _attachNativeVideo(anyVideo, playerArea, videoId);
        } else {
          playerArea.innerHTML = `<div style="color:#ff4444;font-family:monospace;padding:20px;text-align:center;">
            > stream error: player not found<br>
            <span style="color:#555;font-size:11px;">try: search [query] → play [n]</span>
          </div>`;
          showPromptOutput('> error: could not acquire video element after 8s');
        }
      }
    }, 100);
  }

  function _attachNativeVideo(ytVideo, playerArea, videoId) {
    sessionStorage.removeItem(`monk-reloaded-${videoId}`);
    // Detach YT's video from wherever it is and move it into our player area
    // We do NOT clone — we move the real element so playback continues
    playerArea.innerHTML = ''; // clear loading state

    // Wrap the video so we can style it
    const wrapper = document.createElement('div');
    wrapper.id = 'monk-video-wrapper';
    wrapper.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;position:relative;';

    // Style the real video element to fill our container
    ytVideo.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;display:block;';
    ytVideo.id = 'monk-video'; // rename so getVideo() finds it
    ytVideo.controls = false;  // we handle controls ourselves
    ytVideo.autoplay = true;

    // Hide YouTube's own controls overlay (the .ytp-chrome-bottom bar etc.)
    const moviePlayer = ytVideo.closest('#movie_player') || document.querySelector('#movie_player');
    if (moviePlayer) {
      // Hide YT UI chrome, keep just the video
      const ytStyle = document.createElement('style');
      ytStyle.id = 'monk-yt-ui-hide';
      ytStyle.textContent = `
        .ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top,
        .ytp-gradient-bottom, .ytp-ce-element, .ytp-endscreen-content,
        .ytp-cards-teaser, .ytp-suggested-action, .annotation,
        .ytp-pause-overlay, .ytp-bezel-wrapper { display:none !important; }
      `;
      document.head.appendChild(ytStyle);

      // Move the whole movie_player into our wrapper (preserves video stream)
      moviePlayer.style.cssText = 'width:100%;height:100%;position:relative;background:#000;';
      wrapper.appendChild(moviePlayer);
    } else {
      wrapper.appendChild(ytVideo);
    }

    playerArea.appendChild(wrapper);

    // Ensure it's playing
    ytVideo.play().catch(() => {});

    // Wire progress updates to OUR progress bar
    _stopProgressInterval();
    _progressInterval = setInterval(() => {
      _updateProgressFromVideo(ytVideo);
    }, 500);

    ytVideo.addEventListener('ended', () => {
      showPromptOutput('> [stream ended]');
      _stopProgressInterval();
    });

    showPromptOutput(`> ▶ playing · use space/[/]/+/-/f for controls`);
    updateNowPlaying(hState.currentVideo);
  }

  function _stopProgressInterval() {
    if (_progressInterval) { clearInterval(_progressInterval); _progressInterval = null; }
  }

  function _updateProgressFromVideo(v) {
    if (!v) return;
    const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
    const fill = document.getElementById('monk-progress-fill');
    if (fill) fill.style.width = pct + '%';
    const el = document.getElementById('monk-progress-text');
    if (el) el.textContent = `${fmt(Math.floor(v.currentTime))} / ${fmt(Math.floor(v.duration || 0))} · ${v.playbackRate}x · vol ${Math.round(v.volume * 100)}`;
    const npBar = document.getElementById('np-bar-fill');
    const npTime = document.getElementById('np-time');
    if (npBar && v.duration) {
      const filled = Math.round((v.currentTime / v.duration) * 16);
      npBar.textContent = '█'.repeat(filled) + '░'.repeat(16 - filled);
    }
    if (npTime) npTime.textContent = `${fmt(Math.floor(v.currentTime))} / ${fmt(Math.floor(v.duration || 0))}`;
  }

  function exitPlayerMode() {
    _stopProgressInterval();
    hState.view = 'search';
    hState.currentVideo = null;

    // Restore movie_player back to YT's hidden bg container
    const moviePlayer = document.getElementById('movie_player');
    const ytBg = document.getElementById('monk-yt-bg');
    if (moviePlayer && ytBg) {
      moviePlayer.style.cssText = '';
      ytBg.appendChild(moviePlayer);
    }

    // Remove our custom YT UI hide style
    document.getElementById('monk-yt-ui-hide')?.remove();

    const video = document.querySelector('#monk-video');
    if (video) {
      video.pause();
      video.id = ''; // un-rename so it doesn't confuse things
    }

    document.getElementById('monk-player-wrap').style.display = 'none';
    document.getElementById('monk-grid').style.display = 'grid';
    document.getElementById('monk-player-area').innerHTML = '<video id="monk-video" controls></video>';
    updateNowPlaying(null);
    updatePromptPath('~/results');
    showPromptOutput('> back to results');
  }

  function extractCurrentVideoFromDOM() {
    const bg = document.getElementById('monk-yt-bg');
    const title = bg?.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
                  document.title.replace(' - YouTube', '');
    const videoId = new URLSearchParams(location.search).get('v');
    return videoId ? { id: videoId, title, channel: '', duration: '' } : null;
  }

  // ─── Progress bar ─────────────────────────────────────────────────────────
  function updateProgress() {
    const v = getVideo();
    if (!v) return;
    _updateProgressFromVideo(v);
  }

  function getVideo() {
    return document.getElementById('monk-video') ||
           document.querySelector('#monk-player-area video') ||
           document.querySelector('#movie_player video') ||
           document.querySelector('video.html5-main-video');
  }

  // ─── Now playing panel ────────────────────────────────────────────────────
  function updateNowPlaying(video) {
  const v = video || hState.currentVideo;
  const el = document.getElementById('np-content');
  if (!el) return;
  if (!v) {
    el.className = 'np-idle';
    el.innerHTML = '[IDLE]<br><span>select a video to begin</span>';
    return;
  }
  el.className = 'np-active';
  el.innerHTML = `
    <div class="np-title">${escHtml(v.title)}</div>
    <div class="np-channel">${escHtml(v.channel || '')}</div>
    <div class="np-bar" id="np-bar-fill">░░░░░░░░░░░░░░░░</div>
    <div id="np-time" style="font-size:10px;color:#555;margin-top:2px;">--:-- / --:--</div>
  `;
}

  // ─── ASCII calendar ───────────────────────────────────────────────────────
  function renderAsciiCal() {
    const el = document.getElementById('monk-ascii-cal');
    if (!el) return;
    const now = new Date();
    const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const dow  = days[now.getDay()];
    const mon  = months[now.getMonth()];
    const date = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const hh   = String(now.getHours()).padStart(2, '0');
    const mm   = String(now.getMinutes()).padStart(2, '0');
    const ss   = String(now.getSeconds()).padStart(2, '0');

    // Build a small month grid
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let grid = 'Su Mo Tu We Th Fr Sa\n';
    let d = 1;
    for (let row = 0; row < 6; row++) {
      let line = '';
      for (let col = 0; col < 7; col++) {
        const cell = row * 7 + col;
        if (cell < firstDay || d > daysInMonth) {
          line += '   ';
        } else {
          const isTd = d === now.getDate();
          line += (isTd ? `<b>${String(d).padStart(2,' ')}</b>` : String(d).padStart(2,' ')) + ' ';
          d++;
        }
      }
      grid += line.trimEnd() + '\n';
      if (d > daysInMonth) break;
    }

    el.innerHTML = `
      <div class="cal-month">${mon} ${year}</div>
      <div class="cal-grid">${grid.trimEnd()}</div>
      <div class="cal-dow">${dow}</div>
      <div class="cal-date"><b>${date}</b></div>
      <div class="cal-time"><b>${hh}:${mm}</b><span class="cal-sec">:${ss}</span></div>
    `;
  }

  // ─── Status bar ───────────────────────────────────────────────────────────
  function updateStatusBar() {
    const neoUptime = document.getElementById('neo-uptime');
    if (neoUptime) {
      const up = Math.floor((Date.now() - _sessionStart) / 1000);
      neoUptime.textContent = up < 3600
        ? `${Math.floor(up/60)}m ${up%60}s`
        : `${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m`;
    }
  }

  function updatePromptPath(path) {
    const el = document.querySelector('#monk-prompt .p-path');
    if (el) el.textContent = path;
  }

  // ─── Output log ───────────────────────────────────────────────────────────
  function showPromptOutput(text) {
    const out = document.getElementById('monk-output');
    if (!out) return;
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
    // Keep max 50 lines
    while (out.children.length > 50) out.removeChild(out.firstChild);
  }

  // ─── Utils ────────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function parseTimestamp(str) {
    if (!str) return null;
    if (/^\d+$/.test(str)) return parseInt(str);
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

})();