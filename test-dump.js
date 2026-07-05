// Mock localStorage and window
global.localStorage = { setItem: () => {}, getItem: () => null };
global.window = { dispatchEvent: () => {} };
global.CustomEvent = class {};

import { getInitialState, generateBracket } from './state.js';

let state = getInitialState();
const pEvents = ["男子單打 (Open)"];
const playersList = [
"盧彥勳", "曾俊欣", "許育修", "莊吉生", "吳東霖", "楊宗樺", "王宇佐", "李冠毅",
"費德勒", "納達爾", "喬科維奇", "莫瑞",
"阿卡拉茲", "辛納", "梅德維傑夫", "茲維列夫"
];

playersList.forEach((name, i) => {
  state.players.push({
    id: 'p' + i,
    name: name,
    events: pEvents
  });
});
state.events.push("男子單打 (Open)");

generateBracket(state, "男子單打 (Open)", false);
console.log(JSON.stringify(state.matches.filter(m => m.roundIndex === 1), null, 2));
