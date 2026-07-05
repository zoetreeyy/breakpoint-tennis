import { getInitialState, generateBracket, loadMockDataIntoState } from './state.js';

let state = getInitialState();
loadMockDataIntoState(state);

const r1Matches = state.matches.filter(m => m.roundIndex === 1);
const match = r1Matches[0];

function getPlayerNameById(state, id) {
  if (!id) return '等候晉級 (TBD)';
  if (id === 'BYE') return '輪空 (BYE)';
  const p = state.players.find(p => p.id === id);
  return p ? p.name : '未知選手';
}

const p1Name = getPlayerNameById(state, match.player1Id);
const p2Name = getPlayerNameById(state, match.player2Id);

const p1Winner = match.status === 'completed' && match.winnerId === match.player1Id;
const p1Class = p1Winner ? 'winner' : '';
const p2Class = '';

const html = `
<div class="bracket-match-header">
  <span>${match.round}</span>
</div>
<div class="bracket-player-row ${p1Class}">
  <span class="bracket-player-name" title="${p1Name}" style="background: yellow; color: red; font-size: 14px; display: inline-block; min-width: 50px;">DEBUG: [${p1Name}]</span>
</div>
`;

console.log(html);
