import { useState, useRef, useEffect, useCallback } from "react";
import { ALL_CHARACTERS, getRank, getNextRank, RANKS, TIER_COLORS, TIER_LABELS } from "./characters";
import ProgressScreen from "./ProgressScreen";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const useLocalStorage = (key, init) => {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  const set = useCallback(v => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  }, [key]);
  return [val, set];
};

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function XPBar({ xp }) {
  const rank = getRank(xp);
  const next = getNextRank(xp);
  const pct = next ? Math.round(((xp - rank.min) / (next.min - rank.min)) * 100) : 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: rank.color, letterSpacing: 1 }}>
          {rank.icon} {rank.name}
        </span>
        <span style={{ fontSize: 12, color: "#7090a0" }}>{xp} XP {next ? `· ${next.min - xp} to ${next.name}` : "· MAX RANK"}</span>
      </div>
      <div style={{ background: "#0a1520", borderRadius: 99, height: 10, border: "1px solid #1a3040", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99,
          background: `linear-gradient(90deg, ${rank.color}, ${rank.color}cc)`,
          width: `${pct}%`, transition: "width 1s cubic-bezier(.4,0,.2,1)",
          boxShadow: `0 0 8px ${rank.color}88`,
        }} />
      </div>
    </div>
  );
}

function CharSlot({ char, unlocked, onPick }) {
  const locked = !unlocked;
  const tc = TIER_COLORS[char.tier];
  return (
    <div onClick={unlocked ? () => onPick(char) : undefined} style={{
      background: locked ? "#070e16" : "linear-gradient(135deg, #0d1e2e, #0a1828)",
      border: `1px solid ${locked ? "#0d1a24" : tc + "55"}`,
      borderRadius: 6, padding: "14px 12px", cursor: locked ? "not-allowed" : "pointer",
      opacity: locked ? 0.55 : 1, transition: "all 0.2s",
      position: "relative", overflow: "hidden",
    }}>
      {!locked && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: tc, opacity: 0.7 }} />}
      <div style={{ fontSize: 26, marginBottom: 6 }}>{locked ? "🔒" : char.emoji}</div>
      <div style={{ fontFamily: "'Bangers', cursive", fontSize: 15, color: locked ? "#2a4050" : "#d0e8f0", letterSpacing: 0.5, marginBottom: 2 }}>
        {locked ? "???" : char.name}
      </div>
      <div style={{ fontSize: 10, color: locked ? "#1a3040" : "#507080", marginBottom: 6 }}>
        {locked ? `Unlock at ${char.unlockXP} XP` : char.show}
      </div>
      <div style={{ fontSize: 9, color: tc, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
        {TIER_LABELS[char.tier]}
      </div>
    </div>
  );
}

function ScorePip({ value, label, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontFamily: "'Bangers', cursive", fontSize: 32, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: "#507080", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── iOS Install Banner ────────────────────────────────────────────────────────
// iOS Safari doesn't fire the beforeinstallprompt event — you have to manually
// tell the user to use Share → Add to Home Screen.
function IOSInstallBanner({ onDismiss }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
      background: "linear-gradient(135deg, #0d1e30, #081828)",
      borderTop: "2px solid #40c0e0",
      padding: "14px 18px 20px",
      display: "flex", alignItems: "flex-start", gap: 12,
      boxShadow: "0 -4px 30px #00000088",
    }}>
      <span style={{ fontSize: 28, flexShrink: 0 }}>🎙️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 17, color: "#40c0e0", letterSpacing: 1, marginBottom: 3 }}>
          ADD TO HOME SCREEN
        </div>
        <div style={{ fontSize: 13, color: "#607080", lineHeight: 1.4 }}>
          Tap <strong style={{ color: "#a0c8d8" }}>Share</strong> then <strong style={{ color: "#a0c8d8" }}>Add to Home Screen</strong> to install Voice Dojo as an app.
        </div>
      </div>
      <button onClick={onDismiss} style={{
        background: "none", border: "none", color: "#304050",
        fontSize: 22, cursor: "pointer", padding: "0 4px", flexShrink: 0,
      }}>✕</button>
    </div>
  );
}

// ── Android / Chrome Install Prompt ──────────────────────────────────────────
function AndroidInstallBanner({ onInstall, onDismiss }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
      background: "linear-gradient(135deg, #0d1e30, #081828)",
      borderTop: "2px solid #40c0e0",
      padding: "14px 18px 20px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 -4px 30px #00000088",
    }}>
      <span style={{ fontSize: 28 }}>🎙️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 17, color: "#40c0e0", letterSpacing: 1, marginBottom: 2 }}>INSTALL VOICE DOJO</div>
        <div style={{ fontSize: 12, color: "#607080" }}>Add to your home screen — plays offline</div>
      </div>
      <button onClick={onDismiss} style={{ background: "none", border: "none", color: "#304050", fontSize: 20, cursor: "pointer" }}>✕</button>
      <button onClick={onInstall} style={{
        background: "linear-gradient(135deg,#1a4060,#0d2840)", border: "2px solid #40c0e0",
        color: "#40c0e0", padding: "8px 14px", fontFamily: "'Bangers', cursive",
        fontSize: 15, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap",
      }}>INSTALL</button>
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ userApiKey, setUserApiKey, demoMode, setDemoMode, debugMode, setDebugMode, onClose }) {
  const [draft, setDraft] = useState(userApiKey || "");
  const [saved, setSaved] = useState(false);
  const save = () => {
    setUserApiKey(draft.trim() || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 998, background: "#060d14ee", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#0a1828", borderBottom: "1px solid #0d2030", padding: "18px 24px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: "#40c0e0", letterSpacing: 1 }}>⚙️ SETTINGS</div>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#507080", fontSize: 22, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 6, padding: "16px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: "#40c0e0", letterSpacing: 1, marginBottom: 12 }}>🛠️ TESTING & DEBUG</div>
          {[
            { label: "Demo Mode", desc: "Bypasses mic — injects pre-written transcripts so you can test the full scoring loop without mic access.", val: demoMode, set: setDemoMode, color: "#40a060" },
            { label: "Debug Overlay", desc: "Shows raw scorer data on your results screen — word accuracy %, phrase detection, confidence, escalation decision.", val: debugMode, set: setDebugMode, color: "#40c0e0" },
          ].map(({ label, desc, val, set, color }) => (
            <div key={label} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#80a8b8", fontWeight: 600, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#405060" }}>{desc}</div>
              </div>
              <button onClick={() => set(!val)} style={{
                flexShrink: 0, width: 48, height: 26, borderRadius: 13,
                background: val ? color : "#0a1520", border: `2px solid ${val ? color : "#1a3040"}`,
                cursor: "pointer", position: "relative", transition: "all 0.2s",
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: "50%", background: val ? "#fff" : "#304050",
                  position: "absolute", top: 2, left: val ? 24 : 2, transition: "left 0.2s",
                }} />
              </button>
            </div>
          ))}
        </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              { icon: "⚡", title: "Local scoring (always free)", desc: "Runs on your device. Checks word accuracy, key phrases, signature vocabulary. Instant, offline, zero cost." },
              { icon: "🎬", title: "AI coaching (when needed)", desc: "When local scoring isn't confident enough — like heavy accents or nuanced deliveries — it escalates to AI for deeper notes. Uses Anthropic API (~$0.001 per call)." },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: "#0a1520", border: "1px solid #0d2030", borderRadius: 4, padding: "12px" }}>
                <div style={{ fontSize: 13, color: "#80a8b8", marginBottom: 4 }}>{icon} <strong>{title}</strong></div>
                <div style={{ fontSize: 12, color: "#405060" }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 6, padding: "16px", marginBottom: 20 }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: "#40c0e0", letterSpacing: 1, marginBottom: 6 }}>🔑 YOUR OWN API KEY</div>
          <div style={{ fontSize: 13, color: "#607080", lineHeight: 1.6, marginBottom: 12 }}>
            Optional. Add your Anthropic API key to route AI scoring through your own account. Leave blank to use the app's built-in AI.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="password" placeholder="sk-ant-..." value={draft} onChange={e => setDraft(e.target.value)}
              style={{ flex: 1, background: "#0a1520", border: "1px solid #1a3040", borderRadius: 4, color: "#80c0d8", padding: "10px 12px", fontSize: 13, fontFamily: "monospace", outline: "none" }} />
            <button onClick={save} style={{ background: "linear-gradient(135deg,#1a4060,#0d2840)", border: "2px solid #40c0e0", color: "#40c0e0", padding: "10px 16px", fontFamily: "'Bangers', cursive", fontSize: 16, cursor: "pointer", borderRadius: 4, letterSpacing: 1, whiteSpace: "nowrap" }}>
              {saved ? "✓ SAVED" : "SAVE"}
            </button>
          </div>
          {userApiKey && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#40a060" }}>✓ Custom key active</span>
              <button onClick={() => { setDraft(""); setUserApiKey(null); }} style={{ background: "none", border: "none", color: "#604040", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Remove</button>
            </div>
          )}
        </div>
        <div style={{ background: "#0a0d08", border: "1px solid #1a2010", borderRadius: 6, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, color: "#405030", lineHeight: 1.6 }}>
            <strong style={{ color: "#507040" }}>Our promise:</strong> Voice Dojo is a one-time purchase. You own it. No usage caps, no subscription, no features locked behind extra payments. AI scoring has a real cost per call — we're transparent about that. The hybrid system uses AI only where it genuinely adds value.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function VoiceDojo() {
  const [xp, setXp]                   = useLocalStorage("vd_xp", 0);
  const [bests, setBests]             = useLocalStorage("vd_bests", {});
  const [totalRuns, setTotalRuns]     = useLocalStorage("vd_runs", 0);
  const [runHistory, setRunHistory]   = useLocalStorage("vd_history", []);
  const [userApiKey, setUserApiKey]   = useLocalStorage("vd_apikey", null);
  const [demoMode, setDemoMode]       = useLocalStorage("vd_demo", false);
  const [debugMode, setDebugMode]     = useLocalStorage("vd_debug", false);
  const [streak, setStreak]           = useLocalStorage("vd_streak", { count: 0, lastDate: null });
  const [installDismissed, setInstallDismissed] = useLocalStorage("vd_install_dismissed", false);

  const [phase, setPhase] = useState("hub");
  const [character, setCharacter] = useState(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [settling, setSettling] = useState(false);
  const [timer, setTimer] = useState(0);
  const [results, setResults] = useState(null);
  const [xpGained, setXpGained] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinDisplay, setSpinDisplay] = useState(null);
  const [showUnlock, setShowUnlock] = useState(null);
  const [tab, setTab]                 = useState("play");
  const [micStatus, setMicStatus]     = useState("unknown");
  const [showSettings, setShowSettings] = useState(false);
  const [scoringStatus, setScoringStatus] = useState("");
  const [lastLocalResult, setLastLocalResult] = useState(null); // for debug overlay
  const [showIOSBanner, setShowIOSBanner] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null); // Android Chrome

  const recogRef = useRef(null);
  const timerRef = useRef(null);
  const spinRef = useRef(null);
  const transcriptRef = useRef("");

  // ── PWA install detection ─────────────────────────────
  useEffect(() => {
    if (installDismissed) return;

    // Android/Chrome: capture the install prompt event
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS: detect Safari on iPhone/iPad not already installed
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandaloneMode = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    if (isIOS && !isInStandaloneMode) {
      // Small delay so the app feels loaded before nudging
      setTimeout(() => setShowIOSBanner(true), 3000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [installDismissed]);

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setInstallDismissed(true);
  };

  const dismissInstall = () => {
    setShowIOSBanner(false);
    setDeferredPrompt(null);
    setInstallDismissed(true);
  };

  const unlockedChars = ALL_CHARACTERS.filter(c => xp >= c.unlockXP);
  const go = (p) => setPhase(p);

  // ── Character spin ────────────────────────────────────
  const spinCharacter = (forceChar) => {
    if (spinning) return;
    const pool = forceChar ? [forceChar] : unlockedChars;
    if (!pool.length) return;
    setSpinning(true);
    go("spin");
    let ticks = 0;
    const maxTicks = forceChar ? 8 : 18;
    const interval = setInterval(() => {
      setSpinDisplay(pool[Math.floor(Math.random() * pool.length)]);
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(interval);
        const chosen = forceChar || pool[Math.floor(Math.random() * pool.length)];
        setCharacter(chosen);
        setLineIndex(Math.floor(Math.random() * chosen.lines.length));
        setSpinDisplay(chosen);
        setSpinning(false);
        setTimeout(() => go("brief"), 600);
      }
    }, forceChar ? 80 : 120);
    spinRef.current = interval;
  };

  // ── Recording ─────────────────────────────────────────
  const startRecording = async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMicStatus("unsupported"); return; }
    setMicStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
      return;
    }
    setTranscript(""); transcriptRef.current = "";
    setTimer(0); setRecording(true);
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    const r = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    r.continuous = true; r.interimResults = true; r.lang = "en-GB";
    r.onresult = e => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      transcriptRef.current = t;
      setTranscript(t);
    };
    r.onerror = (e) => { if (e.error === "not-allowed") setMicStatus("denied"); };
    r.start();
    recogRef.current = r;
  };

  const stopRecording = () => {
    setRecording(false);
    setSettling(true);
    clearInterval(timerRef.current);
    if (recogRef.current) recogRef.current.stop();
    const start = Date.now();
    const poll = setInterval(() => {
      if (transcriptRef.current.trim() || Date.now() - start > 2000) {
        clearInterval(poll);
        setTranscript(transcriptRef.current);
        setSettling(false);
      }
    }, 100);
  };

  // ── Submit: hybrid scoring ────────────────────────────
  const submitPerformance = async () => {
    if (!transcript.trim()) return;
    go("scoring");
    const line = character.lines[lineIndex];
    const prevBest = bests[character.id] || 0;

    // Step 1: always run local scorer first
    setScoringStatus("Analysing your performance…");
    let localResult;
    try {
      const { scoreLocally, calcXP } = await import("./scorer");
      localResult = scoreLocally(character, line, transcript);
      var xpEarned = calcXP(localResult.score, prevBest);
    } catch {
      localResult = { score: 5, confidence: 0, shouldEscalate: true, wordAccuracy: 0.5, keyPhraseScore: 0.5, sigWordScore: 0.5, strengths: ["Good effort."], notes: ["Keep practising."], scoringMethod: "local" };
      var xpEarned = 30;
    }
    setLastLocalResult(localResult);

    let finalResult;

    // Step 2: escalate to AI if confidence is low
    if (localResult.shouldEscalate) {
      setScoringStatus("Getting deeper coaching…");
      try {
        const { escalateToAI } = await import("./escalation");
        const aiResult = await escalateToAI(character, line, transcript, localResult, prevBest, xpEarned, userApiKey);
        finalResult = { ...aiResult, xp_earned: xpEarned, scoringMethod: "ai" };
      } catch {
        // AI failed — use local gracefully
        finalResult = {
          overall: localResult.score,
          character_accuracy: Math.round(localResult.keyPhraseScore * 10),
          commitment: Math.round(localResult.sigWordScore * 10),
          distinctiveness: Math.round(localResult.wordAccuracy * 10),
          verdict: localResult.score >= 7 ? "Solid effort — keep pushing." : "Keep working on it.",
          strengths: localResult.strengths,
          notes: localResult.notes,
          xp_earned: xpEarned,
          scoringMethod: "local",
        };
      }
    } else {
      finalResult = {
        overall: localResult.score,
        character_accuracy: Math.round(localResult.keyPhraseScore * 10),
        commitment: Math.round(localResult.sigWordScore * 10),
        distinctiveness: Math.round(localResult.wordAccuracy * 10),
        verdict: localResult.score >= 8 ? "Strong performance." : localResult.score >= 6 ? "Good — room to push further." : "Keep drilling it.",
        strengths: localResult.strengths,
        notes: localResult.notes,
        xp_earned: xpEarned,
        scoringMethod: "local",
      };
    }

    // Step 3: commit results + record run history + update streak
    const newBest = finalResult.overall > prevBest;
    const newXp = xp + xpEarned;
    const prevRankName = getRank(xp).name;

    const today = new Date().toDateString();
    const lastDate = streak.lastDate;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const newStreak = lastDate === today
      ? streak  // already ran today, don't double-count
      : { count: lastDate === yesterday ? streak.count + 1 : 1, lastDate: today };
    setStreak(newStreak);

    const runRecord = {
      charId: character.id,
      score: finalResult.overall,
      method: finalResult.scoringMethod,
      wordAccuracy: localResult.wordAccuracy,
      ts: Date.now(),
    };

    setResults(finalResult);
    setXpGained(xpEarned);
    setIsNewBest(newBest);
    setTotalRuns(totalRuns + 1);
    // Cap history at 200 entries so localStorage doesn't bloat
    setRunHistory(prev => [...prev, runRecord].slice(-200));
    if (newBest) setBests({ ...bests, [character.id]: finalResult.overall });
    setXp(newXp);
    if (getRank(newXp).name !== prevRankName) {
      const unlocked = ALL_CHARACTERS.find(c => c.unlockXP > xp && c.unlockXP <= newXp);
      if (unlocked) setShowUnlock(unlocked);
    }
    go("results");
  };

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const line = character ? character.lines[lineIndex] : "";

  // ─── RENDER ───────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#060d14", color: "#a0c8d8", fontFamily: "'Nunito', sans-serif", paddingBottom: 80 }}>
      <style>{`
        * { box-sizing: border-box; }
        input[type=range] { accent-color: #40c0e0; }
        @keyframes xpfly { 0%{transform:translateY(0) scale(1);opacity:1} 100%{transform:translateY(-60px) scale(1.4);opacity:0} }
        @keyframes pop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        @keyframes spin-glow { 0%,100%{box-shadow:0 0 20px #40c0e044} 50%{box-shadow:0 0 40px #40c0e0aa} }
        @keyframes bounce { 0%,100%{transform:translateY(0);opacity:.3} 50%{transform:translateY(-6px);opacity:1} }
        @keyframes slideup { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadein { from{opacity:0} to{opacity:1} }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "linear-gradient(180deg,#0a1828 0%,transparent 100%)", padding: "18px 24px 14px", borderBottom: "1px solid #0d2030" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 2, color: "#40c0e0", textShadow: "0 0 20px #40c0e055" }}>
            🎙️ VOICE DOJO
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, color: "#507080" }}>{totalRuns} runs · {unlockedChars.length}/{ALL_CHARACTERS.length} chars</div>
            <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "1px solid #0d2030", color: "#507080", padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 14 }}>⚙️</button>
          </div>
        </div>
        <div style={{ maxWidth: 680, margin: "10px auto 0" }}>
          <XPBar xp={xp} />
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>

        {/* ── TABS ── */}
        {phase === "hub" && (
          <div style={{ display: "flex", gap: 0, margin: "20px 0 0", borderBottom: "1px solid #0d2030" }}>
            {[["play","▶ PLAY"], ["roster","📋 ROSTER"], ["progress","📈 PROGRESS"]].map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none", padding: "10px 14px", cursor: "pointer",
                fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1,
                color: tab === t ? "#40c0e0" : "#2a5060",
                borderBottom: tab === t ? "2px solid #40c0e0" : "2px solid transparent",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}>{label}</button>
            ))}
          </div>
        )}

        {/* ── HUB: PLAY ── */}
        {phase === "hub" && tab === "play" && (
          <div style={{ animation: "slideup .3s ease", paddingTop: 28 }}>

            {/* Demo mode banner */}
            {demoMode && (
              <div style={{ background: "#0a1a10", border: "1px solid #40a06066", borderRadius: 6, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>🤖</span>
                <div style={{ flex: 1, fontSize: 12, color: "#40a060" }}>
                  <strong>Demo mode on</strong> — mic bypassed, pre-written transcripts used. Toggle off in ⚙️ settings.
                </div>
              </div>
            )}

            {/* Streak */}
            {streak.count > 1 && (
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <span style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: "#e0a020", letterSpacing: 1 }}>
                  🔥 {streak.count} day streak
                </span>
              </div>
            )}
            {Object.keys(bests).length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, color: "#304050", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>Your Bests</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(bests).map(([id, score]) => {
                    const c = ALL_CHARACTERS.find(x => x.id === id);
                    if (!c) return null;
                    const col = score >= 8 ? "#e0a020" : score >= 6 ? "#40c0a0" : "#507080";
                    return (
                      <div key={id} onClick={() => spinCharacter(c)} style={{
                        background: "#0a1828", border: `1px solid ${col}44`,
                        borderRadius: 4, padding: "8px 12px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: 18 }}>{c.emoji}</span>
                        <div>
                          <div style={{ fontSize: 12, color: "#80a8b8" }}>{c.name}</div>
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: col, lineHeight: 1 }}>{score}/10</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ textAlign: "center", padding: "20px 0 28px" }}>
              <button onClick={() => spinCharacter()} style={{
                background: "linear-gradient(135deg, #1a4060, #0d2840)",
                border: "2px solid #40c0e0", borderRadius: 8,
                padding: "22px 48px", cursor: "pointer",
                fontFamily: "'Bangers', cursive", fontSize: 32, color: "#40c0e0",
                letterSpacing: 2, animation: "spin-glow 2s infinite",
              }}>
                🎲 ROLL CHARACTER
              </button>
              <div style={{ marginTop: 10, fontSize: 13, color: "#2a5060" }}>
                Random from your {unlockedChars.length} unlocked characters
              </div>
            </div>
            {getNextRank(xp) && (
              <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 6, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "#304050", textTransform: "uppercase", letterSpacing: 2, marginBottom: 8 }}>Next Unlock</div>
                {ALL_CHARACTERS.filter(c => c.unlockXP > xp).slice(0, 2).map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                    <span style={{ fontSize: 20 }}>🔒</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "#2a5060" }}>??? · {c.show}</div>
                      <div style={{ fontSize: 11, color: "#1a3040" }}>Reach {c.unlockXP} XP to unlock</div>
                    </div>
                    <div style={{ fontSize: 11, color: TIER_COLORS[c.tier], textTransform: "uppercase" }}>{TIER_LABELS[c.tier]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── HUB: ROSTER ── */}
        {phase === "hub" && tab === "roster" && (
          <div style={{ animation: "slideup .3s ease", paddingTop: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {ALL_CHARACTERS.map(c => (
                <CharSlot key={c.id} char={c} unlocked={xp >= c.unlockXP} onPick={spinCharacter} />
              ))}
            </div>
          </div>
        )}

        {/* ── HUB: PROGRESS ── */}
        {phase === "hub" && tab === "progress" && (
          <div style={{ animation: "slideup .3s ease" }}>
            <ProgressScreen xp={xp} bests={bests} totalRuns={totalRuns} runHistory={runHistory} />
          </div>
        )}

        {/* ── SPIN ── */}
        {phase === "spin" && (
          <div style={{ textAlign: "center", padding: "60px 0", animation: "slideup .2s ease" }}>
            <div style={{ fontSize: 11, color: "#304050", textTransform: "uppercase", letterSpacing: 3, marginBottom: 24 }}>Rolling character…</div>
            <div style={{ background: "#0a1828", border: "2px solid #40c0e0", borderRadius: 8, padding: "28px 32px", display: "inline-block", animation: "spin-glow 0.5s infinite" }}>
              <div style={{ fontSize: 52, marginBottom: 8 }}>{spinDisplay?.emoji || "🎲"}</div>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 24, color: "#40c0e0", letterSpacing: 1 }}>{spinDisplay?.name || "???"}</div>
            </div>
          </div>
        )}

        {/* ── BRIEF ── */}
        {phase === "brief" && character && (
          <div style={{ animation: "slideup .3s ease", paddingTop: 28 }}>
            <div style={{ fontSize: 11, color: "#304050", textTransform: "uppercase", letterSpacing: 2, marginBottom: 6 }}>Your Character</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <span style={{ fontSize: 44 }}>{character.emoji}</span>
              <div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 30, color: "#d0e8f0", letterSpacing: 1 }}>{character.name}</div>
                <div style={{ fontSize: 13, color: "#407080" }}>{character.show}</div>
              </div>
              {bests[character.id] && (
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase" }}>Your best</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 26, color: "#e0a020" }}>{bests[character.id]}/10</div>
                </div>
              )}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
              <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 5, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Voice & Accent</div>
                <div style={{ color: "#80a8b8", fontSize: 14 }}>{character.accent}</div>
              </div>
              <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 5, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>Director's Notes</div>
                <div style={{ color: "#80a8b8", fontSize: 14 }}>{character.notes}</div>
              </div>
              <div style={{ background: "linear-gradient(135deg,#0d1e30,#081828)", border: "1px solid #1a4060", borderRadius: 5, padding: "18px 20px" }}>
                <div style={{ fontSize: 10, color: "#407080", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Your Line</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, color: "#d0f0ff", letterSpacing: 0.5, lineHeight: 1.4 }}>
                  "{line}"
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#2a5060", marginBottom: 16 }}>Practise it a few times. Get the voice in your head. Then hit record.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { go("hub"); setCharacter(null); }} style={{
                flex: 1, background: "none", border: "1px solid #0d2030", color: "#2a5060",
                padding: "12px", fontFamily: "'Bangers', cursive", fontSize: 18, cursor: "pointer", borderRadius: 5,
              }}>← REROLL</button>
              <button onClick={() => go("record")} style={{
                flex: 2, background: "linear-gradient(135deg,#1a4060,#0d2840)",
                border: "2px solid #40c0e0", color: "#40c0e0",
                padding: "12px", fontFamily: "'Bangers', cursive", fontSize: 22, cursor: "pointer",
                borderRadius: 5, letterSpacing: 1,
              }}>🎙️ RECORD</button>
            </div>
          </div>
        )}

        {/* ── RECORD ── */}
        {phase === "record" && character && (
          <div style={{ animation: "slideup .3s ease", paddingTop: 28 }}>
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#407080" }}>{character.emoji} {character.name}</span>
            </div>
            <div style={{ background: "linear-gradient(135deg,#0d1e30,#081828)", border: "1px solid #1a4060", borderRadius: 6, padding: "18px 20px", marginBottom: 24, textAlign: "center" }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 19, color: "#d0f0ff", letterSpacing: 0.5, lineHeight: 1.5 }}>
                "{line}"
              </div>
            </div>

            {micStatus === "denied" && (
              <div style={{ background: "#1a0808", border: "1px solid #e05050", borderRadius: 5, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: "#e05050", marginBottom: 4 }}>🎤 MIC ACCESS BLOCKED</div>
                <div style={{ fontSize: 13, color: "#904040" }}>Tap the 🔒 or 🎤 icon in your address bar and allow mic access, then reload. On iPhone: Settings → Safari → Microphone → Allow.</div>
              </div>
            )}
            {micStatus === "unsupported" && (
              <div style={{ background: "#1a0808", border: "1px solid #e05050", borderRadius: 5, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: "#e05050", marginBottom: 4 }}>😬 BROWSER NOT SUPPORTED</div>
                <div style={{ fontSize: 13, color: "#904040" }}>Speech recognition needs Chrome or Edge. On iPhone, try Safari.</div>
              </div>
            )}

            <div style={{ textAlign: "center", marginBottom: 24 }}>
              {demoMode ? (
                <>
                  <button onClick={() => {
                    const t = character.demoTranscripts?.[lineIndex] || character.lines[lineIndex].toLowerCase();
                    transcriptRef.current = t;
                    setTranscript(t);
                  }} style={{
                    width: 96, height: 96, borderRadius: "50%",
                    background: "radial-gradient(circle,#1a3020,#0d1a10)",
                    border: "3px solid #40a060", fontSize: 36, cursor: "pointer",
                    boxShadow: "0 0 20px #40a06044",
                  }}>🤖</button>
                  <div style={{ marginTop: 10, fontSize: 13, color: "#40a060" }}>
                    {transcript ? "✓ Demo transcript loaded" : "Tap to inject demo transcript"}
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={recording ? stopRecording : startRecording}
                    disabled={micStatus === "denied" || micStatus === "unsupported" || micStatus === "requesting"}
                    style={{
                      width: 96, height: 96, borderRadius: "50%",
                      background: recording ? "radial-gradient(circle,#6a1010,#3a0808)" : micStatus === "requesting" ? "radial-gradient(circle,#1a3020,#0d1a10)" : "radial-gradient(circle,#0d2840,#08151e)",
                      border: `3px solid ${recording ? "#e05050" : micStatus === "requesting" ? "#40a060" : "#1a4060"}`,
                      fontSize: 36, cursor: (micStatus === "denied" || micStatus === "unsupported" || micStatus === "requesting") ? "not-allowed" : "pointer",
                      transition: "all .2s",
                      boxShadow: recording ? "0 0 30px #e0505066" : "0 0 15px #40c0e022",
                      animation: recording ? "spin-glow 1s infinite" : "none",
                      opacity: (micStatus === "denied" || micStatus === "unsupported") ? 0.4 : 1,
                    }}>
                    {micStatus === "requesting" ? "⏳" : recording ? "⏹" : "🎙️"}
                  </button>
                  <div style={{ marginTop: 10, fontSize: 13, color: recording ? "#e05050" : settling ? "#a07020" : micStatus === "requesting" ? "#40a060" : "#2a5060" }}>
                    {micStatus === "requesting" ? "Requesting mic access…"
                      : recording ? `● REC ${fmt(timer)}`
                      : settling ? "⏳ Processing…"
                      : transcript ? "✓ Ready — submit or record again"
                      : "Tap to record"}
                  </div>
                </>
              )}
            </div>

            {transcript && (
              <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 4, padding: "12px 16px", marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "#1a3040", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Captured</div>
                <div style={{ fontSize: 14, color: "#607080", fontStyle: "italic" }}>{transcript}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { go("brief"); setTranscript(""); setMicStatus("unknown"); }} style={{
                flex: 1, background: "none", border: "1px solid #0d2030", color: "#2a5060",
                padding: "12px", fontFamily: "'Bangers', cursive", fontSize: 16, cursor: "pointer", borderRadius: 5,
              }}>← BACK</button>
              <button onClick={submitPerformance} disabled={recording || settling || !transcript} style={{
                flex: 2,
                background: (!recording && !settling && transcript) ? "linear-gradient(135deg,#1a4060,#0d2840)" : "#070e16",
                border: `2px solid ${(!recording && !settling && transcript) ? "#40c0e0" : "#0d2030"}`,
                color: (!recording && !settling && transcript) ? "#40c0e0" : "#1a3040",
                padding: "12px", fontFamily: "'Bangers', cursive", fontSize: 22,
                cursor: (!recording && !settling && transcript) ? "pointer" : "not-allowed", borderRadius: 5, letterSpacing: 1,
              }}>{settling ? "PROCESSING…" : "SUBMIT →"}</button>
            </div>
          </div>
        )}

        {/* ── SCORING ── */}
        {phase === "scoring" && (
          <div style={{ textAlign: "center", padding: "70px 0", animation: "slideup .3s ease" }}>
            <div style={{ fontSize: 48, marginBottom: 20 }}>🎬</div>
            <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: "#40c0e0", letterSpacing: 2, marginBottom: 8 }}>DIRECTOR IS WATCHING...</div>
            <div style={{ fontSize: 13, color: "#2a5060" }}>{scoringStatus || "Scoring your performance…"}</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 28 }}>
              {[0,1,2].map(i => <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"#40c0e0", animation:`bounce 1.2s ${i*.2}s infinite` }} />)}
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {phase === "results" && results && character && (
          <div style={{ animation: "slideup .3s ease", paddingTop: 20 }}>
            {showUnlock && (
              <div style={{ background: "linear-gradient(135deg,#1a0830,#0d0520)", border: "2px solid #c060e0", borderRadius: 6, padding: "12px 16px", marginBottom: 16, textAlign: "center", animation: "pop .4s ease" }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: "#c060e0", letterSpacing: 1 }}>🔓 UNLOCKED: {showUnlock.name}!</div>
                <div style={{ fontSize: 12, color: "#8040a0", marginTop: 2 }}>New character available to roll</div>
              </div>
            )}
            <div style={{ background: "linear-gradient(135deg,#0d1e30,#081828)", border: "1px solid #1a4060", borderRadius: 8, padding: "20px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 32 }}>{character.emoji}</span>
                <div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, color: "#d0e8f0" }}>{character.name}</div>
                  {isNewBest && <div style={{ fontSize: 12, color: "#e0a020", animation: "pop .4s ease" }}>⭐ NEW PERSONAL BEST!</div>}
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 56, color: results.overall >= 8 ? "#e0a020" : results.overall >= 6 ? "#40c0a0" : "#507080", lineHeight: 1 }}>{results.overall}</div>
                  <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase" }}>/ 10</div>
                </div>
              </div>
              <div style={{ fontFamily: "'Bangers', cursive", fontStyle: "italic", fontSize: 16, color: "#80c0d8", marginBottom: 14, letterSpacing: 0.5 }}>"{results.verdict}"</div>
              <div style={{ display: "flex", borderTop: "1px solid #0d2030", paddingTop: 14, gap: 8 }}>
                <ScorePip value={results.character_accuracy} label="Accuracy" color="#40c0a0" />
                <ScorePip value={results.commitment} label="Commit" color="#e0a020" />
                <ScorePip value={results.distinctiveness} label="Distinct" color="#c060e0" />
              </div>
            </div>
            <div style={{ background: "#080f18", border: "1px solid #0d2030", borderRadius: 6, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: "#40c0e0", animation: "pop .5s ease" }}>+{xpGained} XP</div>
              {isNewBest && <div style={{ fontSize: 12, color: "#407060" }}>Includes +15 personal best bonus</div>}
              <div style={{ marginLeft: "auto" }}><XPBar xp={xp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ background: "#060e10", border: "1px solid #0a2010", borderRadius: 5, padding: "12px" }}>
                <div style={{ fontSize: 10, color: "#205030", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>✓ Worked</div>
                {results.strengths?.map((s, i) => <div key={i} style={{ fontSize: 12, color: "#508060", marginBottom: 4 }}>• {s}</div>)}
              </div>
              <div style={{ background: "#0e0a06", border: "1px solid #201800", borderRadius: 5, padding: "12px" }}>
                <div style={{ fontSize: 10, color: "#503010", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>↗ Work on</div>
                {results.notes?.map((n, i) => <div key={i} style={{ fontSize: 12, color: "#907040", marginBottom: 4 }}>• {n}</div>)}
              </div>
            </div>
            {/* Debug overlay — only shown when debugMode is on */}
            {debugMode && lastLocalResult && (
              <div style={{ background: "#080808", border: "1px solid #203020", borderRadius: 6, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 14, color: "#406040", letterSpacing: 1, marginBottom: 10 }}>⚡ SCORER DEBUG</div>
                {[
                  ["Word accuracy", `${Math.round(lastLocalResult.wordAccuracy * 100)}%`],
                  ["Key phrase score", `${Math.round(lastLocalResult.keyPhraseScore * 100)}%`],
                  ["Signature words", `${Math.round(lastLocalResult.sigWordScore * 100)}%`],
                  ["Phoneme hints", `${Math.round((lastLocalResult.phonemeScore || 0.5) * 100)}%`],
                  ["Confidence", `${Math.round(lastLocalResult.confidence * 100)}%`],
                  ["Escalated to AI", results.scoringMethod === "ai" ? "Yes" : "No"],
                  ["Local score", `${lastLocalResult.score}/10`],
                  ["Final score", `${results.overall}/10`],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#405040", padding: "3px 0", borderBottom: "1px solid #141814" }}>
                    <span>{label}</span><span style={{ color: "#60a060", fontFamily: "monospace" }}>{val}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={() => { setTranscript(""); setResults(null); setXpGained(0); setIsNewBest(false); setShowUnlock(null); setScoringStatus(""); setLastLocalResult(null); go("record"); }} style={{
                background: "linear-gradient(135deg,#1a2a10,#101a08)", border: "2px solid #40a020",
                color: "#60c030", padding: "14px", fontFamily: "'Bangers', cursive",
                fontSize: 20, cursor: "pointer", borderRadius: 5, letterSpacing: 1,
              }}>🔄 GO AGAIN</button>
              <button onClick={() => { setCharacter(null); setTranscript(""); setResults(null); setXpGained(0); setIsNewBest(false); setShowUnlock(null); setScoringStatus(""); setLastLocalResult(null); go("hub"); setTab("play"); }} style={{
                background: "linear-gradient(135deg,#1a4060,#0d2840)", border: "2px solid #40c0e0",
                color: "#40c0e0", padding: "14px", fontFamily: "'Bangers', cursive",
                fontSize: 20, cursor: "pointer", borderRadius: 5, letterSpacing: 1,
              }}>🎲 NEW ROLL</button>
            </div>
          </div>
        )}

      </div>

      {/* ── SETTINGS PANEL ── */}
      {showSettings && (
        <SettingsPanel
          userApiKey={userApiKey}
          setUserApiKey={setUserApiKey}
          demoMode={demoMode}
          setDemoMode={setDemoMode}
          debugMode={debugMode}
          setDebugMode={setDebugMode}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── INSTALL BANNERS ── */}
      {!installDismissed && showIOSBanner && <IOSInstallBanner onDismiss={dismissInstall} />}
      {!installDismissed && deferredPrompt && <AndroidInstallBanner onInstall={handleAndroidInstall} onDismiss={dismissInstall} />}
    </div>
  );
}
