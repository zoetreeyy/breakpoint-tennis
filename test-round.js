import { checkAndGenerateNextRound } from './state.js';

let state = {
  matches: [
    { id: 'm1', event: '男子單打 (Open)', roundIndex: 1, round: '第一輪', status: 'completed', winnerId: 'p1', nextMatchId: null, p1OrP2: null },
    { id: 'm2', event: '男子單打 (Open)', roundIndex: 1, round: '第一輪', status: 'completed', winnerId: 'p2', nextMatchId: null, p1OrP2: null }
  ]
};

console.log("Before:", state.matches.length);
const result = checkAndGenerateNextRound(state, state.matches[1]);
console.log("Result:", result);
console.log("After:", state.matches.length);
if (state.matches.length > 2) {
  console.log("New match:", state.matches[2]);
  console.log("Match 1 links:", state.matches[0].nextMatchId, state.matches[0].p1OrP2);
}
