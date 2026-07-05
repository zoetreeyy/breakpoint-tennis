import { getInitialState, saveState, checkAndGenerateNextRound, advanceWinner } from './state.js';

let state = getInitialState();
// Add 4 players
state.players = [
  { id: 'p1', name: '盧彥勳' },
  { id: 'p2', name: '曾俊欣' },
  { id: 'p3', name: '許育修' },
  { id: 'p4', name: '莊吉生' }
];
// Import 2 custom matches
state.matches = [
  { id: 'm1', event: '男子單打 (Open)', round: '第一輪', roundIndex: 1, player1Id: 'p1', player2Id: 'p2', status: 'scheduled', nextMatchId: null },
  { id: 'm2', event: '男子單打 (Open)', round: '第一輪', roundIndex: 1, player1Id: 'p3', player2Id: 'p4', status: 'scheduled', nextMatchId: null }
];

console.log("Initial matches:", state.matches.length);

// Simulate Referee completing Match 1
let m1 = state.matches[0];
m1.status = 'completed';
m1.winnerId = 'p1';
advanceWinner(m1, 'p1', state.matches);
checkAndGenerateNextRound(state, m1);

console.log("After Match 1 completed:", state.matches.length);

// Simulate Referee completing Match 2
let m2 = state.matches[1];
m2.status = 'completed';
m2.winnerId = 'p3';
advanceWinner(m2, 'p3', state.matches);
checkAndGenerateNextRound(state, m2);

console.log("After Match 2 completed:", state.matches.length);
if (state.matches.length > 2) {
  console.log("New match:", state.matches[2]);
}

