import { getInitialState, generateBracket } from './state.js';

let state = getInitialState();
const pEvents = ["男子單打 (Open)"];
const players = [
"盧彥勳", "曾俊欣", "許育修", "莊吉生", "吳東霖", "楊宗樺", "王宇佐", "李冠毅",
"費德勒 (Federer)", "納達爾 (Nadal)", "喬科維奇 (Djokovic)", "莫瑞 (Murray)",
"阿卡拉茲 (Alcaraz)", "辛納 (Sinner)", "梅德維傑夫 (Medvedev)", "茲維列夫 (Zverev)"
];

players.forEach((name, i) => {
  state.players.push({
    id: 'p' + i,
    name: name,
    events: pEvents
  });
});
if (!state.events.includes("男子單打 (Open)")) state.events.push("男子單打 (Open)");

generateBracket(state, "男子單打 (Open)", false); // no shuffle
console.log("Matches count:", state.matches.length);
if (state.matches.length > 0) {
  const m1 = state.matches.filter(m => m.roundIndex === 1);
  console.log("Round 1 matches:", m1.length);
  const m4 = state.matches.filter(m => m.roundIndex === 4);
  console.log("Round 4 matches:", m4.length);
}
