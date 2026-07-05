// state.js - Tennis Tournament Manager State & Core Logic

const STORAGE_KEY = 'tennis_tournament_state';

// Initial default state configuration
const DEFAULT_EVENTS = [
  "男子單打 (Men's Singles)",
  "女子單打 (Women's Singles)",
  "混合雙打 (Mixed Doubles)"
];

// Helper to generate unique IDs
function generateId() {
  return 'id_' + Math.random().toString(36).substr(2, 9);
}

// Check if a player is in a match right now or ended one within 30 minutes
export function checkPlayerRestConflict(player, matches, targetTime = Date.now()) {
  if (!player.lastMatchEndedAt) return { conflict: false, remainingMin: 0 };
  
  // Check if player is currently in an active match
  const isPlaying = matches.some(m => 
    (m.status === 'called' || m.status === 'live') && 
    (m.player1Id === player.id || m.player2Id === player.id || 
     m.player1DoubleId === player.id || m.player2DoubleId === player.id)
  );
  if (isPlaying) {
    return { conflict: true, reason: 'isPlaying', remainingMin: 0 };
  }

  const elapsedMs = targetTime - player.lastMatchEndedAt;
  const elapsedMin = elapsedMs / (1000 * 60);
  const restLimit = 30; // 30 minutes rest

  if (elapsedMin < restLimit) {
    return { 
      conflict: true, 
      reason: 'restBuffer',
      remainingMin: Math.ceil(restLimit - elapsedMin) 
    };
  }
  return { conflict: false, remainingMin: 0 };
}

// Get full state
export function getInitialState() {
  return {
    courts: [
      { id: 'c1', name: '中央球場 (Center Court)', status: 'idle', currentMatchId: null },
      { id: 'c2', name: '第一球場 (Court 1)', status: 'idle', currentMatchId: null },
      { id: 'c3', name: '第二球場 (Court 2)', status: 'idle', currentMatchId: null },
      { id: 'c4', name: '第三球場 (Court 3)', status: 'idle', currentMatchId: null }
    ],
    players: [],
    events: [...DEFAULT_EVENTS],
    matches: [],
    configs: {
      restBufferMinutes: 30,
      summonLimitMinutes: 10
    }
  };
}

import { db, ref, onValue, set } from './firebase-config.js?v=1';

let currentState = null;

// Initialize state asynchronously (Firebase listener or LocalStorage fallback)
export function initSystemState(onStateChangeCallback) {
  const defaults = getInitialState();
  
  // If Firebase is not configured properly (e.g. still has placeholders)
  if (!db) {
    console.warn("⚠️ Firebase is not configured! Falling back to LocalStorage.");
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        loadMockDataIntoState(defaults);
        saveState(defaults); // Saves to local
        currentState = defaults;
      } else {
        const parsed = JSON.parse(data);
        currentState = {
          courts: Array.isArray(parsed.courts) ? parsed.courts : defaults.courts,
          players: Array.isArray(parsed.players) ? parsed.players : defaults.players,
          events: Array.isArray(parsed.events) ? parsed.events : defaults.events,
          matches: Array.isArray(parsed.matches) ? parsed.matches : defaults.matches,
          configs: { ...defaults.configs, ...parsed.configs }
        };
      }
    } catch (e) {
      console.error("Local load failed", e);
      currentState = defaults;
    }
    
    // Simulate initial load and listen for local cross-tab changes
    onStateChangeCallback(currentState);
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        currentState = JSON.parse(e.newValue);
        onStateChangeCallback(currentState);
      }
    });
    window.addEventListener('tournament-state-updated', (e) => {
      currentState = e.detail;
      onStateChangeCallback(currentState);
    });
    return;
  }

  // Firebase is configured - Set up real-time listener
  const stateRef = ref(db, 'tournamentState');
  onValue(stateRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Firebase might drop empty arrays (making them undefined) 
      // or convert sparse arrays to objects (e.g. { "0": obj, "2": obj }).
      // We must robustly convert them back to Arrays.
      
      const parsedPlayers = (Array.isArray(data.players) ? data.players : Object.values(data.players || [])).map(p => ({
        ...p,
        events: p.events || [] // Firebase removes empty arrays, ensure it's always an array
      }));

      const parsedMatches = Array.isArray(data.matches) ? data.matches : Object.values(data.matches || []);
      const parsedCourts = Array.isArray(data.courts) ? data.courts : Object.values(data.courts || []);
      const parsedEvents = Array.isArray(data.events) ? data.events : Object.values(data.events || []);

      currentState = {
        courts: parsedCourts.length > 0 ? parsedCourts : defaults.courts,
        players: parsedPlayers,
        events: parsedEvents.length > 0 ? parsedEvents : defaults.events,
        matches: parsedMatches,
        configs: { ...defaults.configs, ...(data.configs || {}) }
      };
    } else {
      // Initialize Firebase with defaults if completely empty
      loadMockDataIntoState(defaults);
      currentState = defaults;
      saveState(currentState); 
    }
    onStateChangeCallback(currentState);
  });
}

// Save state to Firebase safely (or fallback to LocalStorage)
export function saveState(state) {
  currentState = state;
  if (!db) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('tournament-state-updated', { detail: state }));
    } catch (e) {}
    return;
  }

  // Save to Firebase
  const stateRef = ref(db, 'tournamentState');
  set(stateRef, state).catch(e => console.error("Firebase save failed:", e));
}

// Auto-scheduler algorithm
export function autoScheduleMatches(state) {
  let updated = false;
  const now = Date.now();

  // Find all courts that are idle
  const idleCourts = state.courts.filter(c => c.status === 'idle' || !c.currentMatchId);

  for (const court of idleCourts) {
    // Find the next scheduled match that can be played
    // Conditions:
    // 1. Status is 'scheduled'
    // 2. Both players/teams are checked in
    // 3. None of the players are currently playing
    // 4. None of the players violate the 30-min rest buffer
    const eligibleMatch = state.matches.find(match => {
      if (match.status !== 'scheduled') return false;

      // Ensure players are defined (not waiting for previous rounds)
      if (!match.player1Id || !match.player2Id) return false;
      if (match.player1Id === 'BYE' || match.player2Id === 'BYE') return false;

      // Resolve player objects
      const p1 = state.players.find(p => p.id === match.player1Id);
      const p2 = state.players.find(p => p.id === match.player2Id);
      const p1Double = match.player1DoubleId ? state.players.find(p => p.id === match.player1DoubleId) : null;
      const p2Double = match.player2DoubleId ? state.players.find(p => p.id === match.player2DoubleId) : null;

      // Check registration exists
      if (!p1 || !p2) return false;

      // BOTH players/teams must be checked in
      if (!p1.checkedIn || !p2.checkedIn) return false;
      if (p1Double && !p1Double.checkedIn) return false;
      if (p2Double && !p2Double.checkedIn) return false;

      // Check rest conflicts
      const conflictP1 = checkPlayerRestConflict(p1, state.matches, now);
      const conflictP2 = checkPlayerRestConflict(p2, state.matches, now);
      const conflictP1D = p1Double ? checkPlayerRestConflict(p1Double, state.matches, now) : { conflict: false };
      const conflictP2D = p2Double ? checkPlayerRestConflict(p2Double, state.matches, now) : { conflict: false };

      if (conflictP1.conflict || conflictP2.conflict || conflictP1D.conflict || conflictP2D.conflict) {
        return false;
      }

      return true;
    });

    if (eligibleMatch) {
      // Assign match to court
      eligibleMatch.status = 'called';
      eligibleMatch.courtId = court.id;
      eligibleMatch.calledAt = now;
      eligibleMatch.startedAt = null;

      court.status = 'occupied';
      court.currentMatchId = eligibleMatch.id;
      updated = true;
    }
  }

  if (updated) {
    saveState(state);
  }
  return updated;
}

// Generate tournament bracket for an event (Single Elimination)
export function generateBracket(state, eventName, shouldShuffle = true) {
  // Filter players registered for this event
  const eventPlayers = state.players.filter(p => p.events.includes(eventName));
  
  if (eventPlayers.length === 0) return;

  // Remove existing matches for this event
  state.matches = state.matches.filter(m => m.event !== eventName);

  // Shuffle players randomly or sort them
  const players = [...eventPlayers];
  if (shouldShuffle) {
    // Simple random shuffle for tournament seeding
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
  }

  // Calculate bracket size (next power of 2)
  const numPlayers = players.length;
  const roundsCount = Math.ceil(Math.log2(numPlayers));
  const bracketSize = Math.pow(2, roundsCount);

  // We will build matches bottom-up or top-down
  // To handle advancement, we store matches in a tree/list layout where each match has a nextMatchId.
  // Let's generate all matches for all rounds.
  // Round 1 matches will have actual players. Remaining rounds will have placeholders.
  
  let roundMatches = [];
  let previousRoundMatches = [];

  // Create matches for each round, starting from finals and working backwards
  // Final is Round R. Semis are Round R-1, etc.
  for (let r = roundsCount; r >= 1; r--) {
    const matchCountInRound = Math.pow(2, roundsCount - r); // 1 for Final, 2 for Semis, 4 for Quarters, etc.
    const currentRoundMatches = [];

    for (let m = 0; m < matchCountInRound; m++) {
      const matchId = generateId();
      const match = {
        id: matchId,
        event: eventName,
        round: getRoundName(r, matchCountInRound),
        roundIndex: r, // 1 is first round, roundsCount is final
        player1Id: null,
        player2Id: null,
        player1DoubleId: null, // for future double support
        player2DoubleId: null,
        score: { player1: [], player2: [] },
        winnerId: null,
        status: 'scheduled',
        courtId: null,
        calledAt: null,
        startedAt: null,
        endedAt: null,
        nextMatchId: null,
        p1OrP2: null // 'p1' or 'p2' determining where winner goes in the next match
      };

      currentRoundMatches.push(match);
    }

    // Link previous round matches to this round
    if (previousRoundMatches.length > 0) {
      // previousRoundMatches is the LATER round (e.g. Final)
      // currentRoundMatches is the EARLIER round (e.g. Semis)
      for (let m = 0; m < previousRoundMatches.length; m++) {
        const nextMatch = previousRoundMatches[m];
        const feed1 = currentRoundMatches[m * 2];
        const feed2 = currentRoundMatches[m * 2 + 1];
        
        if (feed1) {
          feed1.nextMatchId = nextMatch.id;
          feed1.p1OrP2 = 'p1';
        }
        if (feed2) {
          feed2.nextMatchId = nextMatch.id;
          feed2.p1OrP2 = 'p2';
        }
      }
    }

    roundMatches = [...currentRoundMatches, ...roundMatches];
    previousRoundMatches = currentRoundMatches;
  }

  // Now, populate players into Round 1 matches (first roundMatches in the array, index 1)
  const round1Matches = roundMatches.filter(m => m.roundIndex === 1);
  let playerIdx = 0;

  for (let i = 0; i < round1Matches.length; i++) {
    const match = round1Matches[i];

    // Assign Player 1
    if (playerIdx < players.length) {
      match.player1Id = players[playerIdx++].id;
    } else {
      match.player1Id = 'BYE';
    }

    // Assign Player 2
    if (playerIdx < players.length) {
      match.player2Id = players[playerIdx++].id;
    } else {
      match.player2Id = 'BYE';
    }

    // Handle BYE immediate advancement
    handleByeAdvancement(match, roundMatches);
  }

  // Append new matches to state
  state.matches = [...state.matches, ...roundMatches];
  saveState(state);
}

function getRoundName(roundIndex, matchCount) {
  if (matchCount === 1) return '決賽 (Final)';
  if (matchCount === 2) return '準決賽 (Semifinals)';
  if (matchCount === 4) return '半準決賽 (Quarterfinals)';
  return `第 ${roundIndex} 輪 (Round ${roundIndex})`;
}

// Automatically advance player if opponent is BYE
function handleByeAdvancement(match, allMatches) {
  if (match.player1Id === 'BYE' && match.player2Id === 'BYE') {
    match.status = 'completed';
    match.winnerId = 'BYE';
  } else if (match.player2Id === 'BYE') {
    match.status = 'completed';
    match.winnerId = match.player1Id;
    advanceWinner(match, match.player1Id, allMatches);
  } else if (match.player1Id === 'BYE') {
    match.status = 'completed';
    match.winnerId = match.player2Id;
    advanceWinner(match, match.player2Id, allMatches);
  }
}

// Move winner to their spot in the next match
export function advanceWinner(completedMatch, winnerId, allMatches) {
  if (!completedMatch.nextMatchId || winnerId === 'BYE') return;

  const nextMatch = allMatches.find(m => m.id === completedMatch.nextMatchId);
  if (!nextMatch) return;

  if (completedMatch.p1OrP2 === 'p1') {
    nextMatch.player1Id = winnerId;
  } else if (completedMatch.p1OrP2 === 'p2') {
    nextMatch.player2Id = winnerId;
  }

  // Check if the next match now has a BYE on the other side
  if (nextMatch.player1Id === 'BYE' || nextMatch.player2Id === 'BYE') {
    handleByeAdvancement(nextMatch, allMatches);
  }
}

// Populate mock data for testing
export function loadMockDataIntoState(state) {
  const mockNames = [
    "盧彥勳", "曾俊欣", "許育修", "莊吉生", "謝淑薇", "詹詠然", "詹皓晴", "吳東霖",
    "楊宗樺", "陳迪", "王宇佐", "李亞軒", "梁恩碩", "葛藍喬安娜", "曹家宜", "許絜瑜"
  ];
  
  const gifts = ["網球經典排汗衫 (M)", "網球經典排汗衫 (L)", "專業網球三入裝", "精美運動毛巾"];
  
  state.players = mockNames.map((name, i) => {
    // Alternate events
    const playerEvents = [];
    if (i < 12) playerEvents.push(state.events[0]); // Men's Singles
    if (i >= 8) playerEvents.push(state.events[1]);  // Women's Singles
    if (i % 2 === 0) playerEvents.push(state.events[2]); // Mixed Doubles
    
    return {
      id: `p_${i + 1}`,
      name: name,
      phone: `09${Math.floor(10000000 + Math.random() * 90000000)}`,
      events: playerEvents,
      gift: gifts[i % gifts.length],
      checkedIn: i < 14, // 14 players checked in, 2 not checked in yet to demonstrate
      giftClaimed: i < 8, // some claimed, some not
      lastMatchEndedAt: null
    };
  });

  // Generate brackets
  generateBracket(state, state.events[0]);
  generateBracket(state, state.events[1]);
  generateBracket(state, state.events[2]);

  // Complete a couple of matches to show data
  const matchesOfEvent0 = state.matches.filter(m => m.event === state.events[0] && m.roundIndex === 1);
  if (matchesOfEvent0.length >= 2) {
    // Complete match 1
    const m1 = matchesOfEvent0[0];
    if (m1.player1Id && m1.player2Id && m1.player1Id !== 'BYE' && m1.player2Id !== 'BYE') {
      m1.status = 'completed';
      m1.score = { player1: [6, 4], player2: [4, 6], supertie: { player1: 10, player2: 7 } }; // Sets
      m1.winnerId = m1.player1Id;
      m1.endedAt = Date.now() - 40 * 60 * 1000; // Ended 40 mins ago
      // Update winner rest time
      const winner = state.players.find(p => p.id === m1.winnerId);
      if (winner) winner.lastMatchEndedAt = m1.endedAt;
      const loser = state.players.find(p => p.id === (m1.winnerId === m1.player1Id ? m1.player2Id : m1.player1Id));
      if (loser) loser.lastMatchEndedAt = m1.endedAt;
      advanceWinner(m1, m1.winnerId, state.matches);
    }

    // Complete match 2 (ended 10 mins ago to trigger a 30m conflict!)
    const m2 = matchesOfEvent0[1];
    if (m2.player1Id && m2.player2Id && m2.player1Id !== 'BYE' && m2.player2Id !== 'BYE') {
      m2.status = 'completed';
      m2.score = { player1: [6, 2], player2: [6, 3] };
      m2.winnerId = m2.player1Id;
      m2.endedAt = Date.now() - 10 * 60 * 1000; // Ended 10 mins ago (conflict player!)
      const winner = state.players.find(p => p.id === m2.winnerId);
      if (winner) winner.lastMatchEndedAt = m2.endedAt;
      const loser = state.players.find(p => p.id === (m2.winnerId === m2.player1Id ? m2.player2Id : m2.player1Id));
      if (loser) loser.lastMatchEndedAt = m2.endedAt;
      advanceWinner(m2, m2.winnerId, state.matches);
    }
  }

  // Pre-schedule a match on Court 1 to show active game
  const activeMatch = state.matches.find(m => m.status === 'scheduled' && m.player1Id && m.player2Id && m.player1Id !== 'BYE' && m.player2Id !== 'BYE');
  if (activeMatch) {
    activeMatch.status = 'live';
    activeMatch.courtId = 'c1';
    activeMatch.calledAt = Date.now() - 12 * 60 * 1000; // Called 12 mins ago
    activeMatch.startedAt = Date.now() - 5 * 60 * 1000; // Started 5 mins ago
    state.courts[0].status = 'occupied';
    state.courts[0].currentMatchId = activeMatch.id;
  }

  // Pre-call a match on Court 2 to show the countdown timer running (called 3 mins ago, 7 mins remaining)
  const calledMatch = state.matches.find(m => m.status === 'scheduled' && m.player1Id && m.player2Id && m.player1Id !== 'BYE' && m.player2Id !== 'BYE');
  if (calledMatch) {
    calledMatch.status = 'called';
    calledMatch.courtId = 'c2';
    calledMatch.calledAt = Date.now() - 3 * 60 * 1000; // Called 3 mins ago
    state.courts[1].status = 'occupied';
    state.courts[1].currentMatchId = calledMatch.id;
  }
}

// Automatically check if all matches of a round are completed, and generate the next round's matchups
export function checkAndGenerateNextRound(state, completedMatch) {
  const eventName = completedMatch.event;
  const currentRoundIndex = completedMatch.roundIndex;

  // Find all matches in this event and round
  const roundMatches = state.matches.filter(m => m.event === eventName && m.roundIndex === currentRoundIndex);
  
  if (roundMatches.length === 0) return false;

  // Check if all are completed
  const allCompleted = roundMatches.every(m => m.status === 'completed' || m.status === 'defaulted');
  if (!allCompleted) return false;

  // If they already have nextMatchId set, it means it's a pre-generated tree.
  const hasNextLinks = roundMatches.some(m => m.nextMatchId);
  if (hasNextLinks) return false; // Already linked in a pre-generated tree

  // Collect winners in order
  const winners = roundMatches.map(m => m.winnerId).filter(id => id && id !== 'BYE');
  if (winners.length <= 1) {
    alert(`【系統提示】${eventName} 第 ${currentRoundIndex} 輪已全數完賽，但僅有 1 名贏家晉級，無法自動生成下一輪的對戰配對。請確保該輪至少有 2 場比賽！`);
    return false; // Only 0 or 1 winner, no need to pair
  }

  // Pair them up to generate the next round
  const nextRoundIndex = currentRoundIndex + 1;
  const nextMatchCount = Math.floor(winners.length / 2);
  const nextRoundMatches = [];

  // Determine round name based on match count
  let nextRoundName = `第 ${nextRoundIndex} 輪`;
  if (nextMatchCount === 1) nextRoundName = '決賽 (Final)';
  else if (nextMatchCount === 2) nextRoundName = '準決賽 (Semifinals)';
  else if (nextMatchCount === 4) nextRoundName = '半準決賽 (Quarterfinals)';

  for (let i = 0; i < nextMatchCount; i++) {
    const p1Id = winners[i * 2];
    const p2Id = winners[i * 2 + 1];
    const matchId = 'm_' + Math.random().toString(36).substr(2, 9);
    
    const newMatch = {
      id: matchId,
      event: eventName,
      round: nextRoundName,
      roundIndex: nextRoundIndex,
      player1Id: p1Id,
      player2Id: p2Id,
      score: { player1: [], player2: [] },
      winnerId: null,
      status: 'scheduled',
      courtId: null,
      calledAt: null,
      startedAt: null,
      endedAt: null,
      nextMatchId: null,
      p1OrP2: null
    };

    // Link the previous matches to this new match!
    const m1 = roundMatches[i * 2];
    const m2 = roundMatches[i * 2 + 1];
    
    if (m1) {
      m1.nextMatchId = matchId;
      m1.p1OrP2 = 'p1';
    }
    if (m2) {
      m2.nextMatchId = matchId;
      m2.p1OrP2 = 'p2';
    }

    nextRoundMatches.push(newMatch);
  }

  // Append new matches to state
  state.matches = [...state.matches, ...nextRoundMatches];
  alert(`【系統提示】已成功為 ${eventName} 自動生成下一輪：${nextRoundName}！`);
  return true;
}
