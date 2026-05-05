import { useState, useRef } from "react";
import { ALL_CHARACTERS, getRank, getNextRank, RANKS, TIER_COLORS } from "./characters";

// ─── PERK DEFINITIONS ────────────────────────────────────────────────────────
// Perks that serve the training, not just reward grinding

export const GLOBAL_PERKS = [
  {
    id: "directors_eye",
    name: "Director's Eye",
    icon: "🎬",
    unlockRank: "Extra",
    description: "See your full score breakdown after every run — word accuracy, phrase detection, phoneme hits. The numbers behind the number.",
    flavour: "The director sees everything.",
    type: "transparency",
  },
  {
    id: "rival_ghost",
    name: "Rival Mode",
    icon: "👻",
    unlockRank: "Featured",
    description: "Your personal best becomes a ghost score on each dimension. Every retry is a race against yourself.",
    flavour: "Your worst enemy is your last performance.",
    type: "gameplay",
  },
  {
    id: "veteran_mode",
    name: "Veteran Lens",
    icon: "🔍",
    unlockRank: "Co-Star",
    description: "Once you've hit 10 runs on a character, the scoring gets harder. The director stops being gentle. Growth means raising the bar.",
    flavour: "Praise is for beginners.",
    type: "difficulty",
  },
  {
    id: "line_vault",
    name: "Line Vault",
    icon: "📜",
    unlockRank: "Lead",
    description: "Nail an 8+ on any character and two bonus lines unlock for them. The deeper you go, the more material you get.",
    flavour: "The best lines go to the best actors.",
    type: "content",
  },
  {
    id: "lore_mode",
    name: "The Archive",
    icon: "📖",
    unlockRank: "Legend",
    description: "Full character lore unlocks — voice acting history, original performance notes, what made these voices iconic. Know your craft.",
    flavour: "Every legend has a story.",
    type: "lore",
  },
];

// Per-character mastery milestones
export const CHARACTER_MILESTONES = [
  { runs: 1,  score: 0, label: "First Attempt",   icon: "🎭", reward: "You stepped on stage." },
  { runs: 5,  score: 5, label: "Getting Warm",    icon: "🔥", reward: "Pattern recognition kicking in." },
  { runs: 10, score: 6, label: "Veteran Status",  icon: "⭐", reward: "Veteran Lens activates for this character." },
  { runs: 0,  score: 8, label: "Personal Best 8", icon: "🏆", reward: "Bonus lines unlock (with Line Vault perk)." },
  { runs: 0,  score: 9, label: "Mastery",         icon: "👑", reward: "Character lore fully revealed." },
];

// Character lore fragments — revealed as you improve
const CHARACTER_LORE = {
  troy: [
    { unlockScore: 0, text: "Troy McClure was voiced by Phil Hartman, who gave the character an irresistible sincerity." },
    { unlockScore: 6, text: "Hartman based the voice on B-movie actors of the 1950s — men who genuinely believed they were stars." },
    { unlockScore: 8, text: "The key to Troy is that he's not embarrassed by anything he's been in. That unshakeable confidence is the whole performance." },
  ],
  hutz: [
    { unlockScore: 0, text: "Lionel Hutz was also voiced by Phil Hartman — one of his two iconic Simpsons characters." },
    { unlockScore: 6, text: "Hartman described Hutz as 'a man who has convinced himself he's competent' — the tragedy is he almost believes it." },
    { unlockScore: 8, text: "After Hartman's death in 1998, both Troy and Hutz were retired. They appear only in reruns — which makes nailing them feel like preservation." },
  ],
  bob: [
    { unlockScore: 0, text: "Sideshow Bob is voiced by Kelsey Grammer, who has played the character since 1990." },
    { unlockScore: 6, text: "Grammer was trained at Juilliard. The Shakespearean quality isn't an affectation — it's genuine classical technique applied to cartoon villainy." },
    { unlockScore: 8, text: "The rake scene — arguably the funniest 30 seconds in Simpsons history — works entirely because Grammer plays it with total commitment and zero irony." },
  ],
  skinner: [
    { unlockScore: 0, text: "Principal Skinner is voiced by Harry Shearer, one of the most prolific voice actors in television history." },
    { unlockScore: 6, text: "Shearer plays Skinner as a man whose authority is entirely performative — he's more afraid of the children than they are of him." },
    { unlockScore: 8, text: "The 'Steamed Hams' scene works because Shearer keeps Skinner's dignity completely intact while everything collapses around him." },
  ],
  cbg: [
    { unlockScore: 0, text: "Comic Book Guy is voiced by Hank Azaria, who based him on a real comic book store owner he knew." },
    { unlockScore: 6, text: "The character's full name is Jeff Albertson — a name chosen specifically because he would hate that it's so ordinary." },
    { unlockScore: 8, text: "Azaria slows down dramatically for the character's most pompous pronouncements. The pace is the performance." },
  ],
  willie: [
    { unlockScore: 0, text: "Groundskeeper Willie is voiced by Dan Castellaneta, who also voices Homer Simpson." },
    { unlockScore: 6, text: "Castellaneta based the accent on a broad West Coast Scottish dialect — specifically chosen because it sounds maximally explosive." },
    { unlockScore: 8, text: "The secret to Willie is genuine outrage. He's not performing anger — in Willie's world, everything is a personal affront and he meets it all at full volume." },
  ],
  vader: [
    { unlockScore: 0, text: "Darth Vader's voice is James Earl Jones — one of the most recognisable voices in cinema history." },
    { unlockScore: 6, text: "Jones wasn't credited in the original Star Wars. He felt his contribution was too small. He was wrong." },
    { unlockScore: 8, text: "Jones records his lines alone, in a studio, with no other actors present. The isolation is part of what makes Vader sound so removed from the human world." },
  ],
  arnie: [
    { unlockScore: 0, text: "Schwarzenegger's accent is Austrian — specifically Styrian, a regional dialect with notably hard consonants." },
    { unlockScore: 6, text: "He has never tried to lose the accent, despite decades of elocution coaching being available. It became his instrument." },
    { unlockScore: 8, text: "'I'll be back' was originally scripted as 'I'll come back.' Schwarzenegger changed it because the contraction felt more robotic. He was right." },
  ],
  palpatine: [
    { unlockScore: 0, text: "Emperor Palpatine is played by Ian McDiarmid, a classically trained Scottish stage actor." },
    { unlockScore: 6, text: "McDiarmid described the character as 'someone who enjoys evil the way a gourmet enjoys food' — the relish is genuine." },
    { unlockScore: 8, text: "'Do it' works because of the pause before it. McDiarmid holds the silence until it becomes unbearable, then releases with complete calm." },
  ],
  hannibal: [
    { unlockScore: 0, text: "Anthony Hopkins prepared for Hannibal Lecter by studying recordings of HAL 9000 from 2001: A Space Odyssey." },
    { unlockScore: 6, text: "Hopkins delivers almost every line with a slight upturn at the end — a musical choice that makes even pleasantries feel like questions he already knows the answer to." },
    { unlockScore: 8, text: "The character blinks far less than a normal person. Hopkins made this choice deliberately. It's subtle on screen but you feel it immediately." },
  ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const getCharacterStats = (charId, runHistory) => {
  const runs = runHistory.filter(r => r.charId === charId);
  const best = runs.length ? Math.max(...runs.map(r => r.score)) : 0;
  return { runs: runs.length, best };
};

const isPerkUnlocked = (perk, currentRankName) => {
  const rankIdx = RANKS.findIndex(r => r.name === currentRankName);
  const reqIdx  = RANKS.findIndex(r => r.name === perk.unlockRank);
  return rankIdx >= reqIdx;
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function StatBar({ label, value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: "#506070", textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 11, color: color }}>{value}{max !== 100 ? `/${max}` : "%"}</span>
      </div>
      <div style={{ background: "#0a1520", borderRadius: 99, height: 6, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width 1.2s cubic-bezier(.4,0,.2,1)", boxShadow: `0 0 6px ${color}88` }} />
      </div>
    </div>
  );
}

function PerkNode({ perk, unlocked }) {
  const [expanded, setExpanded] = useState(false);
  const typeColors = { transparency: "#40c0e0", gameplay: "#e0a020", difficulty: "#e05050", content: "#60c0a0", lore: "#c060e0" };
  const col = unlocked ? typeColors[perk.type] : "#1a2a3a";
  return (
    <div onClick={() => setExpanded(e => !e)} style={{
      background: unlocked ? `linear-gradient(135deg, ${col}18, ${col}08)` : "#080e14",
      border: `1px solid ${unlocked ? col + "55" : "#0d1a24"}`,
      borderRadius: 6, padding: "12px 14px", cursor: "pointer",
      transition: "all 0.2s", marginBottom: 8,
      opacity: unlocked ? 1 : 0.5,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20, filter: unlocked ? "none" : "grayscale(1)" }}>{unlocked ? perk.icon : "🔒"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: unlocked ? "#c0d8e8" : "#2a4050", fontWeight: 600 }}>{perk.name}</div>
          <div style={{ fontSize: 10, color: unlocked ? col : "#1a3040", textTransform: "uppercase", letterSpacing: 1 }}>
            {unlocked ? perk.type : `Unlocks at ${perk.unlockRank}`}
          </div>
        </div>
        <span style={{ fontSize: 12, color: "#304050" }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${col}22` }}>
          <div style={{ fontSize: 13, color: unlocked ? "#80a8b8" : "#2a4050", lineHeight: 1.5, marginBottom: 6 }}>{perk.description}</div>
          {unlocked && <div style={{ fontSize: 11, color: col, fontStyle: "italic" }}>"{perk.flavour}"</div>}
        </div>
      )}
    </div>
  );
}

function CharacterProgressCard({ char, stats, bests, runHistory, perksUnlocked }) {
  const [expanded, setExpanded] = useState(false);
  const best = bests[char.id] || 0;
  const runs = stats.runs;
  const tc = TIER_COLORS[char.tier];
  const lore = CHARACTER_LORE[char.id] || [];
  const revealedLore = lore.filter(l => best >= l.unlockScore);
  const lineVaultActive = perksUnlocked.includes("line_vault");
  const archiveActive = perksUnlocked.includes("lore_mode");

  // Milestone progress
  const milestonesHit = CHARACTER_MILESTONES.filter(m =>
    (m.runs === 0 || runs >= m.runs) && (m.score === 0 || best >= m.score)
  );

  return (
    <div style={{
      background: runs > 0 ? "linear-gradient(135deg,#0a1828,#080f18)" : "#070c12",
      border: `1px solid ${runs > 0 ? tc + "44" : "#0d1a24"}`,
      borderRadius: 8, overflow: "hidden", marginBottom: 10,
      opacity: runs > 0 ? 1 : 0.6,
    }}>
      {/* Card header */}
      <div onClick={() => runs > 0 && setExpanded(e => !e)}
        style={{ padding: "14px 16px", cursor: runs > 0 ? "pointer" : "default", display: "flex", alignItems: "center", gap: 12 }}>
        {runs > 0 && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: tc }} />}
        <span style={{ fontSize: 28, filter: runs === 0 ? "grayscale(0.8)" : "none" }}>{char.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 17, color: runs > 0 ? "#d0e8f0" : "#2a4050", letterSpacing: 0.5 }}>{char.name}</div>
          <div style={{ fontSize: 11, color: runs > 0 ? "#507080" : "#1a3040" }}>{char.show}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          {runs > 0 ? (
            <>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 24, color: best >= 8 ? "#e0a020" : best >= 6 ? "#40c0a0" : "#507080", lineHeight: 1 }}>{best}/10</div>
              <div style={{ fontSize: 10, color: "#304050" }}>{runs} run{runs !== 1 ? "s" : ""}</div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: "#1a3040" }}>Not attempted</div>
          )}
        </div>
        {runs > 0 && <span style={{ fontSize: 12, color: "#304050", marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>}
      </div>

      {/* Expanded detail */}
      {expanded && runs > 0 && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #0d2030" }}>

          {/* Score bar */}
          <div style={{ paddingTop: 14, marginBottom: 14 }}>
            <StatBar label="Best Score" value={best} max={10} color={best >= 8 ? "#e0a020" : best >= 6 ? "#40c0a0" : "#507080"} />
            <StatBar label="Runs Completed" value={runs} max={Math.max(20, runs)} color={tc} />
          </div>

          {/* Milestones hit */}
          {milestonesHit.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Milestones</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {milestonesHit.map(m => (
                  <div key={m.label} style={{ background: "#0a1520", border: "1px solid #1a3040", borderRadius: 4, padding: "4px 8px", display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 12 }}>{m.icon}</span>
                    <span style={{ fontSize: 11, color: "#607080" }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent run history */}
          {(() => {
            const charRuns = runHistory.filter(r => r.charId === char.id).slice(-5).reverse();
            return charRuns.length > 0 ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>Recent Runs</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {charRuns.map((run, i) => {
                    const col = run.score >= 8 ? "#e0a020" : run.score >= 6 ? "#40c0a0" : "#507080";
                    return (
                      <div key={i} style={{ flex: 1, background: "#080f18", border: `1px solid ${col}44`, borderRadius: 4, padding: "6px", textAlign: "center" }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, color: col, lineHeight: 1 }}>{run.score}</div>
                        <div style={{ fontSize: 9, color: "#304050", marginTop: 2 }}>{run.method === "ai" ? "AI" : "⚡"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null;
          })()}

          {/* Lore fragments */}
          {archiveActive && revealedLore.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "#504070", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>📖 Archive</div>
              {revealedLore.map((l, i) => (
                <div key={i} style={{ background: "#0a0810", border: "1px solid #1a1028", borderRadius: 4, padding: "10px 12px", marginBottom: 6, fontSize: 12, color: "#806090", lineHeight: 1.5, fontStyle: "italic" }}>
                  {l.text}
                </div>
              ))}
              {lore.length > revealedLore.length && (
                <div style={{ fontSize: 11, color: "#403050", textAlign: "center", padding: "6px" }}>
                  {lore.length - revealedLore.length} more fragment{lore.length - revealedLore.length !== 1 ? "s" : ""} — improve your score to reveal
                </div>
              )}
            </div>
          )}
          {!archiveActive && (
            <div style={{ fontSize: 11, color: "#2a3040", fontStyle: "italic" }}>Reach Legend rank to unlock character lore</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Rank node for the spine ───────────────────────────────────────────────────
function RankNode({ rank, isCurrentOrPast, isCurrent, xp }) {
  const [expanded, setExpanded] = useState(false);
  const perksForRank = GLOBAL_PERKS.filter(p => p.unlockRank === rank.name);
  const xpForNext = isCurrent && getNextRank(xp) ? getNextRank(xp).min - xp : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 0 }}>
      {/* Connector line upward */}
      <div style={{
        width: 2, height: 40,
        background: isCurrentOrPast
          ? `linear-gradient(180deg, ${rank.color}, ${rank.color}44)`
          : "linear-gradient(180deg, #0d2030, #060d14)",
        transition: "background 1s",
      }} />

      {/* Node */}
      <div onClick={() => setExpanded(e => !e)} style={{
        width: isCurrent ? 64 : 52,
        height: isCurrent ? 64 : 52,
        borderRadius: "50%",
        background: isCurrentOrPast
          ? `radial-gradient(circle, ${rank.color}33, ${rank.color}11)`
          : "radial-gradient(circle, #0a1520, #060d14)",
        border: `${isCurrent ? 3 : 2}px solid ${isCurrentOrPast ? rank.color : "#0d2030"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: "all 0.3s",
        boxShadow: isCurrent ? `0 0 24px ${rank.color}66` : isCurrentOrPast ? `0 0 10px ${rank.color}33` : "none",
        zIndex: 2, position: "relative",
        animation: isCurrent ? "nodepulse 2s infinite" : "none",
      }}>
        <span style={{ fontSize: isCurrent ? 24 : 20 }}>{rank.icon}</span>
      </div>

      {/* Label + perk chips */}
      <div style={{ marginTop: 8, marginBottom: 8, textAlign: "center" }}>
        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 15, color: isCurrentOrPast ? rank.color : "#1a3040", letterSpacing: 1 }}>
          {rank.name}
        </div>
        {isCurrent && (
          <div style={{ fontSize: 10, color: "#507080", marginTop: 2 }}>
            {xpForNext > 0 ? `${xpForNext} XP to go` : "MAX"}
          </div>
        )}
        {!isCurrentOrPast && (
          <div style={{ fontSize: 10, color: "#1a3040" }}>{rank.min} XP</div>
        )}
      </div>

      {/* Perks hanging off this rank */}
      {perksForRank.length > 0 && (
        <div style={{ width: "100%", maxWidth: 280, marginBottom: 8 }}>
          {perksForRank.map(p => (
            <PerkNode key={p.id} perk={p} unlocked={isCurrentOrPast} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN PROGRESS SCREEN ────────────────────────────────────────────────────

export default function ProgressScreen({ xp, bests, totalRuns, runHistory = [] }) {
  const [statsExpanded, setStatsExpanded] = useState(false);
  const rank = getRank(xp);
  const currentRankIdx = RANKS.findIndex(r => r.name === rank.name);

  const unlockedPerks = GLOBAL_PERKS
    .filter(p => isPerkUnlocked(p, rank.name))
    .map(p => p.id);

  // Overall stats
  const allScores = runHistory.map(r => r.score).filter(Boolean);
  const avgScore = allScores.length ? (allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : "—";
  const bestEver = allScores.length ? Math.max(...allScores) : 0;
  const aiRuns = runHistory.filter(r => r.method === "ai").length;
  const localRuns = runHistory.filter(r => r.method === "local").length;
  const charsAttempted = [...new Set(runHistory.map(r => r.charId))].length;

  // Characters unlocked vs not
  const unlockedChars = ALL_CHARACTERS.filter(c => xp >= c.unlockXP);
  const lockedChars   = ALL_CHARACTERS.filter(c => xp < c.unlockXP);

  // Reversed RANKS for bottom-to-top render
  const ranksBottomToTop = [...RANKS].reverse();

  return (
    <div style={{ paddingTop: 20, paddingBottom: 40 }}>
      <style>{`
        @keyframes nodepulse { 0%,100%{box-shadow:0 0 20px var(--nc,#40c0e0)44} 50%{box-shadow:0 0 40px var(--nc,#40c0e0)88} }
        @keyframes fadeup { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
      `}</style>

      {/* ── STATS HEADER ─────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg,#0a1828,#080f18)", border: "1px solid #0d2030", borderRadius: 8, padding: "16px", marginBottom: 24, animation: "fadeup .4s ease" }}>
        {/* Summary row — always visible */}
        <div style={{ display: "flex", gap: 0, marginBottom: statsExpanded ? 16 : 0 }}>
          {[
            { label: "Total Runs", value: totalRuns, color: "#40c0e0" },
            { label: "Avg Score", value: avgScore, color: "#e0a020" },
            { label: "Best Ever", value: bestEver ? `${bestEver}/10` : "—", color: "#60c0a0" },
            { label: "Characters", value: `${charsAttempted}/${ALL_CHARACTERS.length}`, color: "#c060e0" },
          ].map(({ label, value, color }, i) => (
            <div key={label} style={{ flex: 1, textAlign: "center", padding: "0 4px", borderRight: i < 3 ? "1px solid #0d2030" : "none" }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 9, color: "#304050", textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Expandable detail */}
        {statsExpanded && (
          <div style={{ animation: "fadeup .25s ease" }}>
            <StatBar label="Word Accuracy (avg)" value={
              runHistory.length ? Math.round(runHistory.filter(r=>r.wordAccuracy).reduce((a,r)=>a+(r.wordAccuracy||0),0)/runHistory.filter(r=>r.wordAccuracy).length*100) : 0
            } max={100} color="#40c0a0" />
            <StatBar label="AI-coached runs" value={aiRuns} max={Math.max(totalRuns,1)} color="#c060e0" />
            <StatBar label="Local-scored runs" value={localRuns} max={Math.max(totalRuns,1)} color="#40c0e0" />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <div style={{ flex: 1, background: "#080f18", border: "1px solid #0d2030", borderRadius: 4, padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Perks Unlocked</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, color: "#40c0e0" }}>{unlockedPerks.length}/{GLOBAL_PERKS.length}</div>
              </div>
              <div style={{ flex: 1, background: "#080f18", border: "1px solid #0d2030", borderRadius: 4, padding: "10px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#304050", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>AI Cost Saved</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, color: "#60c0a0" }}>~${(localRuns * 0.002).toFixed(3)}</div>
              </div>
            </div>
          </div>
        )}

        <button onClick={() => setStatsExpanded(e => !e)} style={{ width: "100%", marginTop: statsExpanded ? 14 : 12, background: "none", border: "1px solid #0d2030", color: "#304050", padding: "6px", borderRadius: 4, cursor: "pointer", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
          {statsExpanded ? "▲ Less" : "▼ More stats"}
        </button>
      </div>

      {/* ── THE STAGE: BOTTOM-TO-TOP GROWTH TREE ─────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "#304050", textTransform: "uppercase", letterSpacing: 2, marginBottom: 20, textAlign: "center" }}>
          ✦ Your Progress ✦
        </div>

        {/* Locked characters — visible at top as destinations */}
        {lockedChars.length > 0 && (
          <div style={{ marginBottom: 16, animation: "fadeup .5s ease" }}>
            <div style={{ fontSize: 10, color: "#1a3040", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, textAlign: "center" }}>
              — Ahead —
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 16 }}>
              {lockedChars.map(c => (
                <div key={c.id} style={{ background: "#070c12", border: "1px solid #0d1a24", borderRadius: 6, padding: "12px 10px", textAlign: "center", opacity: 0.6 }}>
                  <div style={{ fontSize: 24, filter: "grayscale(1)", marginBottom: 4 }}>🔒</div>
                  <div style={{ fontSize: 10, color: "#1a3040", marginBottom: 2 }}>???</div>
                  <div style={{ fontSize: 9, color: TIER_COLORS[c.tier], textTransform: "uppercase", letterSpacing: 1 }}>{c.tier}</div>
                  <div style={{ fontSize: 9, color: "#0d1a24", marginTop: 2 }}>{c.unlockXP} XP</div>
                </div>
              ))}
            </div>
            {/* Downward arrow into the tree */}
            <div style={{ textAlign: "center", color: "#1a3040", fontSize: 20, marginBottom: 8 }}>↓</div>
          </div>
        )}

        {/* The rank spine — bottom to top */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {ranksBottomToTop.map((rank, i) => {
            const rankIdx = RANKS.findIndex(r => r.name === rank.name);
            const isCurrentOrPast = rankIdx <= currentRankIdx;
            const isCurrent = rankIdx === currentRankIdx;

            // Characters that unlock at this rank's XP threshold
            const charsAtThisRank = ALL_CHARACTERS.filter(c => {
              const prevRankMin = rankIdx > 0 ? RANKS[rankIdx - 1].min : 0;
              return c.unlockXP >= prevRankMin && c.unlockXP < rank.min || (rankIdx === 0 && c.unlockXP === 0);
            });

            return (
              <div key={rank.name} style={{ width: "100%", maxWidth: 360, animation: `fadeup ${0.3 + i * 0.08}s ease` }}>
                <RankNode rank={rank} isCurrentOrPast={isCurrentOrPast} isCurrent={isCurrent} xp={xp} />

                {/* Characters branching off this rank */}
                {charsAtThisRank.length > 0 && (
                  <div style={{ marginBottom: 16, paddingLeft: 4 }}>
                    <div style={{ fontSize: 9, color: "#1a3040", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, textAlign: "center" }}>
                      {rankIdx === 0 ? "Starter Characters" : `Unlocked at ${rank.name}`}
                    </div>
                    {charsAtThisRank.map(c => (
                      <CharacterProgressCard
                        key={c.id}
                        char={c}
                        stats={getCharacterStats(c.id, runHistory)}
                        bests={bests}
                        runHistory={runHistory}
                        perksUnlocked={unlockedPerks}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* The floor — where it all started */}
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <div style={{ width: 2, height: 32, background: "linear-gradient(180deg,#40c0e022,transparent)", margin: "0 auto 8px" }} />
            <div style={{ fontSize: 10, color: "#1a3040", textTransform: "uppercase", letterSpacing: 2 }}>The Stage</div>
            <div style={{ fontSize: 20, marginTop: 4 }}>🎙️</div>
          </div>
        </div>
      </div>
    </div>
  );
}
