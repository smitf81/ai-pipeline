// ─── CHARACTER DATABASE ───────────────────────────────────────────────────────
//
// Each character has:
//   lines[]          — target lines to perform
//   demoTranscripts  — realistic STT output for each line, used in demo mode
//   accent           — human-readable accent description
//   notes            — director coaching notes
//   voiceRef         — machine-readable reference for the deterministic scorer:
//     characterType    — "quote"|"voice"|"accent" — changes scoring weights
//     rhythmHints      — "slow"|"fast"|"variable"
//     keyPhrases[]     — must-land phrases, weighted by importance
//     signatureWords[] — character-defining vocabulary
//     phonemeHints[]   — accent-specific sounds to look for in STT output
//     confidenceThreshold — below this, escalate to AI

export const ALL_CHARACTERS = [

  // ── STARTER ──────────────────────────────────────────────────────────────────
  {
    id: "troy",
    name: "Troy McClure",
    show: "The Simpsons",
    emoji: "🎬",
    unlockXP: 0,
    tier: "starter",
    accent: "Cheesy 1950s Hollywood leading man. Broad, self-satisfied, slightly desperate.",
    notes: "Lead with 'Hi, I'm Troy McClure!' — the name always gets TWO syllables of relish. Huge confident smile in the voice. Slightly too much enthusiasm.",
    demoTranscripts: [
      "hi i'm troy mcclure you may remember me from such films as the verdict was mail fraud and dial m for murderousness",
      "hi i'm troy mcclure you might remember me from such educational films as locker room towel fights the blinding of larry driscoll",
      "hi i'm troy mcclure and i'm here to tell you about the simpsons new helper monkey",
    ],
    lines: [
      "Hi, I'm Troy McClure! You may remember me from such films as 'The Verdict Was Mail Fraud' and 'Dial M for Murderousness.'",
      "Hi, I'm Troy McClure! You might remember me from such educational films as 'Locker Room Towel Fights: The Blinding of Larry Driscoll.'",
      "Hi, I'm Troy McClure. And I'm here to tell you about the Simpsons' new helper monkey.",
    ],
    voiceRef: {
      characterType: "quote",
      rhythmHints: "variable",
      keyPhrases: [
        { text: "hi im troy mcclure", weight: 3 },
        { text: "you may remember me", weight: 2 },
        { text: "you might remember me", weight: 2 },
        { text: "such films as", weight: 2 },
        { text: "such educational films", weight: 2 },
      ],
      signatureWords: ["remember", "films", "troy", "mcclure", "educational"],
      phonemeHints: [],
      confidenceThreshold: 0.55,
    },
  },

  {
    id: "hutz",
    name: "Lionel Hutz",
    show: "The Simpsons",
    emoji: "⚖️",
    unlockXP: 0,
    tier: "starter",
    accent: "Shifty American ambulance chaser. Oozing false confidence over total incompetence.",
    notes: "He sounds like he's selling something he knows is faulty. Start confident, wobble mid-sentence, recover badly. Nasal. Slightly sweaty energy.",
    demoTranscripts: [
      "i move for a bad court thingy you know like a dismissal or whatever",
      "mr simpson this is the most blatant case of fraudulent advertising since my suit against the film the neverending story",
      "well he's had it in for me ever since i kinda ran over his dog well replace the word kinda with repeatedly and the word dog with son",
    ],
    lines: [
      "I move for a bad court thingy. You know, like a dismissal or whatever.",
      "Mr. Simpson, this is the most blatant case of fraudulent advertising since my suit against the film 'The Neverending Story.'",
      "Well, he's had it in for me ever since I kinda ran over his dog. Well, replace the word 'kinda' with 'repeatedly,' and the word 'dog' with 'son.'",
    ],
    voiceRef: {
      characterType: "quote",
      rhythmHints: "variable",
      keyPhrases: [
        { text: "bad court thingy", weight: 3 },
        { text: "dismissal or whatever", weight: 2 },
        { text: "blatant case", weight: 2 },
        { text: "replace the word", weight: 3 },
        { text: "kinda", weight: 2 },
      ],
      signatureWords: ["thingy", "whatever", "kinda", "repeatedly", "fraudulent"],
      phonemeHints: [],
      confidenceThreshold: 0.55,
    },
  },

  // ── BRONZE ───────────────────────────────────────────────────────────────────
  {
    id: "bob",
    name: "Sideshow Bob",
    show: "The Simpsons",
    emoji: "🔪",
    unlockXP: 100,
    tier: "bronze",
    accent: "Classically trained British Shakespearean. Villainy delivered with exquisite enunciation.",
    notes: "Kelsey Grammer smoothness. Every word is savoured. The menace is in the politeness. Elongate vowels. Never rush.",
    demoTranscripts: [
      "i'll be back you can't keep the democrats out of the white house forever and when they get in i'm back baby",
      "bart i must know how you keep foiling me is it some sort of device",
      "rakes i stepped on so many rakes",
    ],
    lines: [
      "I'll be back. You can't keep the Democrats out of the White House forever, and when they get in, I'm back, baby!",
      "Bart, I must know how you keep foiling me. Is it some sort of... DEVICE?",
      "Rakes. I stepped on... so many rakes.",
    ],
    voiceRef: {
      characterType: "voice",
      rhythmHints: "slow",
      keyPhrases: [
        { text: "ill be back", weight: 2 },
        { text: "foiling me", weight: 3 },
        { text: "device", weight: 3 },
        { text: "so many rakes", weight: 3 },
        { text: "white house forever", weight: 2 },
      ],
      signatureWords: ["rakes", "device", "foiling", "forever", "exquisite"],
      phonemeHints: ["rakes", "device"],
      confidenceThreshold: 0.65,
    },
  },

  {
    id: "skinner",
    name: "Principal Skinner",
    show: "The Simpsons",
    emoji: "🏫",
    unlockXP: 100,
    tier: "bronze",
    accent: "Repressed middle-management American. Officious, slightly panicked, perpetually defeated.",
    notes: "Nasal and tightly wound. He's always one incident from a breakdown. The formality is a thin shell over absolute chaos. Crack at emotional moments.",
    demoTranscripts: [
      "i've been wrong before i thought i was wrong once but i was mistaken",
      "no it's the children who are wrong",
      "ugh i've got to stop leaving my cue cards around where the children can find them",
    ],
    lines: [
      "I've been wrong before. I thought I was wrong once, but I was mistaken.",
      "No, it's THE CHILDREN who are wrong.",
      "Ugh, I've got to stop leaving my cue cards around where the children can find them.",
    ],
    voiceRef: {
      characterType: "quote",
      rhythmHints: "variable",
      keyPhrases: [
        { text: "wrong before", weight: 2 },
        { text: "i was mistaken", weight: 3 },
        { text: "the children who are wrong", weight: 3 },
        { text: "cue cards", weight: 3 },
      ],
      signatureWords: ["mistaken", "children", "wrong", "cue", "cards"],
      phonemeHints: [],
      confidenceThreshold: 0.55,
    },
  },

  // ── SILVER ───────────────────────────────────────────────────────────────────
  {
    id: "cbg",
    name: "Comic Book Guy",
    show: "The Simpsons",
    emoji: "📚",
    unlockXP: 300,
    tier: "silver",
    accent: "Nasal, pompous American nerd. Vast vocabulary deployed for trivial complaints.",
    notes: "SLOW and deliberate. Every syllable deserves its moment. Maximum condescension. He is the authority on everything. Breathe loudly between sentences.",
    demoTranscripts: [
      "last night's itchy and scratchy was without a doubt the worst episode ever",
      "oh loneliness and cheeseburgers are a dangerous mix",
      "your powers of deduction are exceptional i simply can't allow you to waste them here",
    ],
    lines: [
      "Last night's Itchy and Scratchy was, without a doubt, the worst episode ever.",
      "Oh, loneliness and cheeseburgers are a dangerous mix.",
      "Your powers of deduction are exceptional. I simply can't allow you to waste them here.",
    ],
    voiceRef: {
      characterType: "voice",
      rhythmHints: "slow",
      keyPhrases: [
        { text: "worst episode ever", weight: 3 },
        { text: "without a doubt", weight: 2 },
        { text: "loneliness and cheeseburgers", weight: 3 },
        { text: "powers of deduction", weight: 3 },
        { text: "simply cant allow", weight: 2 },
      ],
      signatureWords: ["worst", "ever", "loneliness", "cheeseburgers", "deduction", "exceptional"],
      phonemeHints: [],
      confidenceThreshold: 0.6,
    },
  },

  {
    id: "willie",
    name: "Groundskeeper Willie",
    show: "The Simpsons",
    emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    unlockXP: 300,
    tier: "silver",
    accent: "Broad Scottish. Explosive, aggrieved, physically intense.",
    notes: "Everything is a battle cry. Roll those Rs hard. Start low and ERUPT. He has genuine passion — for Scotland, for his job, for his many grievances.",
    demoTranscripts: [
      "back to scotland willie hears ye willie doesn't care",
      "get yer haggis eating kilt wearing bagpipe blowing selves out of me sight",
      "och tis no place for a wee bairn but then again what is",
    ],
    lines: [
      "BAAAACK TO SCOTLAND! Willie hears ye. Willie doesn't care.",
      "Get yer haggis-eating, kilt-wearing, bagpipe-blowing selves out of me sight!",
      "Och, 'tis no place for a wee bairn. But then again, what is?",
    ],
    voiceRef: {
      characterType: "accent",
      rhythmHints: "variable",
      keyPhrases: [
        { text: "back to scotland", weight: 3 },
        { text: "willie hears ye", weight: 3 },
        { text: "haggis", weight: 3 },
        { text: "wee bairn", weight: 3 },
        { text: "out of me sight", weight: 2 },
      ],
      signatureWords: ["scotland", "haggis", "bairn", "yer", "och", "willie", "kilt"],
      phonemeHints: ["och", "wee", "bairn", "yer", "ye"],
      confidenceThreshold: 0.7,
    },
  },

  // ── GOLD ─────────────────────────────────────────────────────────────────────
  {
    id: "vader",
    name: "Darth Vader",
    show: "Star Wars",
    emoji: "🌑",
    unlockXP: 600,
    tier: "gold",
    accent: "Deep, measured, resonant American. Every word carries the weight of the dark side.",
    notes: "Breathe. Audibly. Between. Sentences. James Earl Jones depth — chest voice only, nothing nasal. Slow and inevitable. You are not angry, you are certain.",
    demoTranscripts: [
      "no i am your father",
      "i find your lack of faith disturbing",
      "the force is strong with this one",
    ],
    lines: [
      "No. I am your father.",
      "I find your lack of faith disturbing.",
      "The force is strong with this one.",
    ],
    voiceRef: {
      characterType: "quote",
      rhythmHints: "slow",
      keyPhrases: [
        { text: "i am your father", weight: 3 },
        { text: "lack of faith", weight: 3 },
        { text: "disturbing", weight: 2 },
        { text: "force is strong", weight: 3 },
      ],
      signatureWords: ["father", "disturbing", "faith", "force", "strong"],
      phonemeHints: [],
      confidenceThreshold: 0.55,
    },
  },

  {
    id: "arnie",
    name: "Arnold Schwarzenegger",
    show: "Various Films",
    emoji: "💪",
    unlockXP: 600,
    tier: "gold",
    accent: "Austrian-American. Hard consonants, flattened vowels, machine-like delivery.",
    notes: "Every T is a hammer strike. Commit to the Austrian vowels. Robotic rhythm. Never rush. The accent IS the performance.",
    demoTranscripts: [
      "i'll be back",
      "come with me if you want to live",
      "get to the choppa",
    ],
    lines: [
      "I'll be back.",
      "Come with me if you want to live.",
      "Get to the choppa!",
    ],
    voiceRef: {
      characterType: "accent",
      rhythmHints: "slow",
      keyPhrases: [
        { text: "ill be back", weight: 3 },
        { text: "come with me", weight: 2 },
        { text: "want to live", weight: 2 },
        { text: "get to the choppa", weight: 3 },
        { text: "choppa", weight: 3 },
      ],
      signatureWords: ["back", "choppa", "live"],
      phonemeHints: ["choppa", "chopper"],
      confidenceThreshold: 0.7,
    },
  },

  // ── PLATINUM ─────────────────────────────────────────────────────────────────
  {
    id: "palpatine",
    name: "Emperor Palpatine",
    show: "Star Wars",
    emoji: "⚡",
    unlockXP: 1000,
    tier: "platinum",
    accent: "Rasping, theatrical American. Ancient evil with impeccable diction.",
    notes: "Ian McDiarmid's creak — start almost whispery, then build. The delight is genuine. He LOVES this. Savour every word like it's the finest meal you've ever had.",
    demoTranscripts: [
      "do it kill him",
      "good good let the hate flow through you",
      "everything is proceeding as i have foreseen",
    ],
    lines: [
      "Do it. Kill him.",
      "Good. Good. Let the hate flow through you.",
      "Everything is proceeding as I have foreseen.",
    ],
    voiceRef: {
      characterType: "quote",
      rhythmHints: "slow",
      keyPhrases: [
        { text: "do it", weight: 3 },
        { text: "kill him", weight: 3 },
        { text: "good good", weight: 3 },
        { text: "hate flow through you", weight: 3 },
        { text: "as i have foreseen", weight: 3 },
      ],
      signatureWords: ["kill", "hate", "foreseen", "proceeding", "good"],
      phonemeHints: [],
      confidenceThreshold: 0.55,
    },
  },

  {
    id: "hannibal",
    name: "Hannibal Lecter",
    show: "Silence of the Lambs",
    emoji: "🍷",
    unlockXP: 1000,
    tier: "platinum",
    accent: "Mid-Atlantic with a trace of European. Precise, cultured, dangerously still.",
    notes: "Anthony Hopkins stillness — no wasted movement in the voice. Silences are weapons. The politeness makes it worse. Breathe in before the most unsettling parts.",
    demoTranscripts: [
      "a census taker once tried to test me i ate his liver with some fava beans and a nice chianti",
      "i do wish we could chat longer but i'm having an old friend for dinner",
      "clever girl but you're still in the dark",
    ],
    lines: [
      "A census taker once tried to test me. I ate his liver with some fava beans and a nice Chianti.",
      "I do wish we could chat longer, but I'm having an old friend for dinner.",
      "Clever girl. But you're still in the dark.",
    ],
    voiceRef: {
      characterType: "voice",
      rhythmHints: "slow",
      keyPhrases: [
        { text: "fava beans", weight: 3 },
        { text: "nice chianti", weight: 3 },
        { text: "census taker", weight: 2 },
        { text: "old friend for dinner", weight: 3 },
        { text: "clever girl", weight: 3 },
      ],
      signatureWords: ["liver", "chianti", "fava", "census", "dinner", "clever"],
      phonemeHints: ["chianti", "fava"],
      confidenceThreshold: 0.65,
    },
  },

];

export const RANKS = [
  { name: "Bit Part",  min: 0,    icon: "🎭", color: "#888" },
  { name: "Extra",     min: 100,  icon: "🎬", color: "#a0b0c0" },
  { name: "Featured",  min: 300,  icon: "⭐", color: "#70c0a0" },
  { name: "Co-Star",   min: 600,  icon: "🌟", color: "#60a0e0" },
  { name: "Lead",      min: 1000, icon: "🏆", color: "#e0a020" },
  { name: "Legend",    min: 1800, icon: "👑", color: "#e06080" },
];

export const getRank     = (xp) => [...RANKS].reverse().find(r => xp >= r.min) || RANKS[0];
export const getNextRank = (xp) => RANKS.find(r => r.min > xp);

export const TIER_COLORS = { starter: "#60c0a0", bronze: "#c08040", silver: "#a0b0c0", gold: "#e0a020", platinum: "#c060e0" };
export const TIER_LABELS = { starter: "STARTER", bronze: "BRONZE", silver: "SILVER", gold: "GOLD", platinum: "PLATINUM" };
