// ─── DETERMINISTIC SCORER ────────────────────────────────────────────────────
//
// Runs entirely locally. Zero API cost.
// Returns a score object + a confidence value (0–1).
// If confidence < character.voiceRef.confidenceThreshold → escalate to AI.
//
// Scoring breakdown by characterType:
//   "quote"  → word accuracy 50%, key phrases 35%, signature words 15%
//   "voice"  → key phrases 40%, signature words 30%, word accuracy 30%
//   "accent" → key phrases 30%, signature words 35%, word accuracy 20%, phoneme 15%
//
// The scorer is intentionally transparent — every number it produces
// can be explained to the user in plain English.

// ── Text normalisation ────────────────────────────────────────────────────────

const normalise = (str) =>
  str
    .toLowerCase()
    .replace(/['']/g, "")        // smart quotes → nothing (don't → dont)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Levenshtein distance — for fuzzy word matching
const levenshtein = (a, b) => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
};

// Fuzzy word similarity 0–1
const wordSim = (a, b) => {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

// ── Sub-scorers ───────────────────────────────────────────────────────────────

// Word-level accuracy: how much of the target line did they actually say?
// Returns 0–1
const scoreWordAccuracy = (targetNorm, transcriptNorm) => {
  const targetWords    = targetNorm.split(" ").filter(Boolean);
  const transcriptWords = transcriptNorm.split(" ").filter(Boolean);
  if (targetWords.length === 0) return 0;

  // For each target word, find best fuzzy match in transcript
  let totalScore = 0;
  const used = new Set();
  for (const tw of targetWords) {
    let best = 0, bestIdx = -1;
    transcriptWords.forEach((cw, i) => {
      if (used.has(i)) return;
      const s = wordSim(tw, cw);
      if (s > best) { best = s; bestIdx = i; }
    });
    if (best > 0.75) { // threshold for "close enough"
      totalScore += best;
      if (bestIdx >= 0) used.add(bestIdx);
    }
  }

  // Penalise if transcript is massively shorter than target (they stopped early)
  const completionRatio = Math.min(1, transcriptWords.length / (targetWords.length * 0.7));
  return (totalScore / targetWords.length) * completionRatio;
};

// Key phrase detection: did the important bits land?
// Returns 0–1 weighted by phrase importance
const scoreKeyPhrases = (transcriptNorm, keyPhrases) => {
  if (!keyPhrases || keyPhrases.length === 0) return 0.5; // neutral if no phrases defined
  let weightedScore = 0;
  let totalWeight = 0;
  for (const { text, weight } of keyPhrases) {
    totalWeight += weight;
    const phraseNorm = normalise(text);
    // Check for the phrase as a substring (fuzzy-ish via includes)
    if (transcriptNorm.includes(phraseNorm)) {
      weightedScore += weight;
      continue;
    }
    // Partial credit: check individual words of the phrase
    const phraseWords = phraseNorm.split(" ").filter(Boolean);
    let wordsHit = 0;
    for (const pw of phraseWords) {
      if (transcriptNorm.split(" ").some(tw => wordSim(tw, pw) > 0.8)) wordsHit++;
    }
    weightedScore += weight * (wordsHit / phraseWords.length) * 0.6; // partial credit capped at 60%
  }
  return totalWeight > 0 ? weightedScore / totalWeight : 0.5;
};

// Signature word detection: did character-defining vocab appear?
// Returns 0–1
const scoreSignatureWords = (transcriptNorm, signatureWords) => {
  if (!signatureWords || signatureWords.length === 0) return 0.5;
  let hits = 0;
  for (const sw of signatureWords) {
    const swNorm = normalise(sw);
    if (transcriptNorm.split(" ").some(tw => wordSim(tw, swNorm) > 0.75)) hits++;
  }
  return hits / signatureWords.length;
};

// Phoneme hint detection: did accent-specific sounds survive STT normalisation?
// Returns 0–1 (bonus score, 0.5 = neutral / not applicable)
const scorePhonemeHints = (transcriptNorm, phonemeHints) => {
  if (!phonemeHints || phonemeHints.length === 0) return 0.5; // neutral
  let hits = 0;
  for (const hint of phonemeHints) {
    const hNorm = normalise(hint);
    if (transcriptNorm.split(" ").some(tw => wordSim(tw, hNorm) > 0.7)) hits++;
  }
  // For accent characters, hitting phoneme hints is a strong positive signal
  return 0.4 + (hits / phonemeHints.length) * 0.6;
};

// ── Confidence calculation ────────────────────────────────────────────────────
// How sure are we that our score is meaningful?
// Low transcript length = low confidence
// Heavy accent characters naturally get lower confidence
const calcConfidence = (transcriptNorm, targetNorm, characterType, wordAccuracy) => {
  const transcriptWords = transcriptNorm.split(" ").filter(Boolean).length;
  const targetWords = targetNorm.split(" ").filter(Boolean).length;

  // If they barely said anything, we can't be confident
  const lengthConf = Math.min(1, transcriptWords / Math.max(1, targetWords * 0.5));

  // Accent characters are harder to score deterministically
  const typeConf = characterType === "accent" ? 0.7
    : characterType === "voice" ? 0.85
    : 1.0;

  // If word accuracy is very high, we're probably right
  const accuracyConf = wordAccuracy > 0.8 ? 1.0
    : wordAccuracy > 0.5 ? 0.8
    : 0.5;

  return lengthConf * typeConf * accuracyConf;
};

// ── Generate human-readable local coaching notes ─────────────────────────────
// These are shown when we DON'T escalate to AI
const localCoachingNotes = (character, wordAccuracy, keyPhraseScore, sigWordScore, transcriptNorm) => {
  const strengths = [];
  const notes = [];
  const { voiceRef } = character;

  // Strengths
  if (wordAccuracy > 0.8) strengths.push("Strong line accuracy — you got most of the words.");
  if (keyPhraseScore > 0.75) strengths.push("Key phrases landed well.");
  if (sigWordScore > 0.6) strengths.push("Character vocabulary is coming through.");

  // Areas to improve
  if (wordAccuracy < 0.5) notes.push("Focus on the actual line first — get the words solid before worrying about the voice.");
  else if (wordAccuracy < 0.75) notes.push("A few words dropped — try it once just reading along, then perform it.");

  if (keyPhraseScore < 0.5) {
    const missed = voiceRef.keyPhrases
      .filter(kp => !transcriptNorm.includes(normalise(kp.text)))
      .slice(0, 2)
      .map(kp => `"${kp.text}"`);
    if (missed.length > 0) notes.push(`Key moment${missed.length > 1 ? "s" : ""} to nail: ${missed.join(", ")}.`);
  }

  if (sigWordScore < 0.4) notes.push(`Try to land the character's signature vocabulary — words like "${(voiceRef.signatureWords || []).slice(0, 2).join('", "')}".`);

  // Rhythm hints
  if (voiceRef.rhythmHints === "slow" && transcriptNorm.split(" ").length > 0) {
    notes.push("Remember: this character is slow and deliberate. Let every word land before moving on.");
  }

  if (strengths.length === 0) strengths.push("You attempted the line — that's the starting point.");
  if (notes.length === 0) notes.push("Solid effort — push for more character commitment on the next take.");

  return { strengths, notes };
};

// ── Main scorer ───────────────────────────────────────────────────────────────

export const scoreLocally = (character, line, transcript) => {
  const { voiceRef } = character;
  const targetNorm     = normalise(line);
  const transcriptNorm = normalise(transcript);

  if (!transcriptNorm) {
    return {
      score: 0, confidence: 0, shouldEscalate: true,
      wordAccuracy: 0, keyPhraseScore: 0, sigWordScore: 0, phonemeScore: 0.5,
      strengths: [], notes: ["No transcript captured — try again with your mic closer."],
      scoringMethod: "local",
    };
  }

  // Run sub-scorers
  const wordAccuracy   = scoreWordAccuracy(targetNorm, transcriptNorm);
  const keyPhraseScore = scoreKeyPhrases(transcriptNorm, voiceRef.keyPhrases);
  const sigWordScore   = scoreSignatureWords(transcriptNorm, voiceRef.signatureWords);
  const phonemeScore   = scorePhonemeHints(transcriptNorm, voiceRef.phonemeHints);

  // Weighted overall by character type
  let overall;
  if (voiceRef.characterType === "quote") {
    overall = (wordAccuracy * 0.50) + (keyPhraseScore * 0.35) + (sigWordScore * 0.15);
  } else if (voiceRef.characterType === "voice") {
    overall = (wordAccuracy * 0.30) + (keyPhraseScore * 0.40) + (sigWordScore * 0.30);
  } else { // accent
    overall = (wordAccuracy * 0.20) + (keyPhraseScore * 0.30) + (sigWordScore * 0.35) + (phonemeScore * 0.15);
  }

  // Map 0–1 float to 1–10 int (with some floor to avoid harsh 1s)
  const score = Math.max(1, Math.min(10, Math.round(overall * 9) + 1));

  const confidence = calcConfidence(transcriptNorm, targetNorm, voiceRef.characterType, wordAccuracy);
  const shouldEscalate = confidence < voiceRef.confidenceThreshold;

  const { strengths, notes } = localCoachingNotes(
    character, wordAccuracy, keyPhraseScore, sigWordScore, transcriptNorm
  );

  return {
    score,
    confidence,
    shouldEscalate,
    wordAccuracy,
    keyPhraseScore,
    sigWordScore,
    phonemeScore,
    strengths,
    notes,
    scoringMethod: "local",
  };
};

// ── XP calculation (shared, used by both paths) ───────────────────────────────
export const calcXP = (score, prevBest) => {
  const base = 20 + (score * 8);
  const newBestBonus = score > prevBest ? 15 : 0;
  return Math.min(120, base + newBestBonus);
};
