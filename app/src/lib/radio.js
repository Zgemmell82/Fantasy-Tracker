// Hot Route Radio: a live two-host show about what's happening in your leagues.
//
// A "director" decides what to talk about next (a big play, a scoreboard rundown, what has to happen in a league,
// who to root for), and a writer turns each topic into a few lines of dialogue. The writer here is the built-in
// template writer, which always works; the app can swap in AI-written banter for big moments (see Radio.jsx).
// Everything said comes from facts the app already has: scores, plays, win probabilities and the root-for list.

import { pickLore } from './lore.js';

export const STYLES = {
  optimistic: { label: 'Optimistic', blurb: 'Glass half full, always.', hosts: ['Sam', 'Harper'],
    persona: ['relentlessly upbeat and finds the silver lining in everything', 'cheerful, encouraging, believes every comeback is possible'] },
  pessimistic: { label: 'Pessimistic', blurb: 'Waiting for the other shoe.', hosts: ['Doug', 'Wren'],
    persona: ['gloomy, expects the worst, sighs a lot', 'dry and fatalistic, sure something will go wrong'] },
  neutral: { label: 'Neutral', blurb: 'Straight analysis.', hosts: ['Alex', 'Jordan'],
    persona: ['calm, even-handed analyst who sticks to the numbers', 'clear and measured co-host who explains what it means'] },
  roast: { label: 'Roast', blurb: 'They will tease you.', hosts: ['Rex', 'Frankie'],
    persona: ['sarcastic trash-talker who teases the listener\'s roster and luck', 'quick-witted heckler who piles on, then admits when something good happens'] },
  supportive: { label: 'Supportive', blurb: 'Your biggest fans.', hosts: ['Coach Dee', 'Miles'],
    persona: ['warm, steady coach who builds the listener up and keeps them focused', 'kind, reassuring friend who celebrates wins and softens losses'] },
  hype: { label: 'Hype', blurb: 'Maximum volume.', hosts: ['Boom', 'Tay'],
    persona: ['loud, high-energy hype man who treats every play like a title game', 'fast-talking sidekick who feeds off the energy and amplifies it'] }
};
export const STYLE_KEYS = Object.keys(STYLES);

const pick = (list, rnd) => list[Math.floor(rnd() * list.length) % list.length];
const n1 = x => String(Number(Number(x).toFixed(1)));
const pctOf = wp => Math.round(wp * 100);
const joinNames = names => names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

// ── What each style says. good = it helps you, bad = it hurts you, mixed = it cuts both ways. ─────────
const REACT = {
  optimistic: {
    good: ['Yes! Exactly what we needed.', 'Love it. Everything is lining up.', 'This is your week, I can feel it.', 'That is the good stuff right there.', 'See? The universe is on your side.', 'Smiling ear to ear over that one.', 'The momentum is yours now.', 'Keep that energy coming!'],
    bad: ['Okay, a small bump, but there is a lot of game left.', 'Don\'t worry, this is very fixable.', 'Shake it off, you are still in this.', 'Every comeback starts with a moment like this.', 'Plenty of football left to flip it.', 'It is only one play, and you have more coming.', 'Nothing a big drive cannot fix.', 'I still like your chances, honestly.'],
    mixed: ['Honestly, plenty to like in there.', 'It is all still wide open, and that is good for you.', 'Lots of ways this can break your way.', 'I see opportunity in that one.', 'Fine by me. The best part is still ahead.', 'Good things are coming, I can tell.']
  },
  pessimistic: {
    good: ['Fine, nice, but don\'t get used to it.', 'Enjoy it. These things never last.', 'Sure, now watch it come back to bite you.', 'Good news always has a catch. Wait for it.', 'I will believe it when the game is over.', 'Cherish it. It will be gone in a minute.', 'That was nice. Something awful is surely next.', 'Do not celebrate yet. That is how it gets you.'],
    bad: ['And there it is. I knew it.', 'Of course. Of course that happened.', 'This is exactly how these weeks always go.', 'Honestly, I am not even surprised anymore.', 'Another one for the pile of disappointments.', 'I said this would happen, and nobody listened.', 'The football gods are not on your side today.', 'It was going too well, so naturally.'],
    mixed: ['One step forward, one step back. Typical.', 'Mixed results. That never ends well.', 'Something is about to go wrong, I can feel it.', 'I do not trust any of this.', 'Could be worse. It usually gets worse.', 'The other shoe is coming. It always does.']
  },
  neutral: {
    good: ['That is a positive swing for you.', 'A helpful play for your side.', 'That moves things in your favor.', 'Good for you, and it shows in the numbers.', 'That is a point in your column.', 'A clear plus for your lineup.', 'That tilts the matchup your way.', 'You will take that every time.'],
    bad: ['That is a setback for you.', 'Not a great development for your side.', 'That moves things against you.', 'A clear minus for your lineup.', 'That tilts the matchup the wrong way.', 'The numbers did not like that one.', 'That costs you some ground.', 'Not what you wanted to see.'],
    mixed: ['That one cuts both ways.', 'A bit of a wash, depending on the league.', 'Mixed, with no clear winner.', 'The net effect is small.', 'It helps in one place and costs you in another.', 'Neither good nor bad overall.']
  },
  roast: {
    good: ['Well, even a broken clock, I guess.', 'Look at that, your roster did something right.', 'Don\'t get cocky. This is an accident.', 'I would clap, but I am in shock.', 'Somebody write this down, it will not happen again.', 'Your lineup finally remembered how to play.', 'Fine, I will allow one compliment.', 'That is the first good decision you have made all week.'],
    bad: ['Wow, your roster really said no today.', 'That is a crime scene, and it is your team.', 'Do you pick these players with a dartboard?', 'Your lineup is a participation trophy.', 'I have seen better rosters in a toy store.', 'That is a lot of effort to lose a matchup.', 'Your bench would have done better, and that is saying something.', 'Somewhere a waiver wire is laughing at you.'],
    mixed: ['Half good, half your usual luck.', 'Somehow even your wins come with a catch.', 'Mixed results, mixed feelings, same old you.', 'It is a tie between good and awful. Classic.', 'You cannot even have a clean good play.', 'A little something for everyone, mostly for your rivals.']
  },
  supportive: {
    good: ['That is so good for you. You earned that.', 'Great news, you have been doing everything right.', 'See? Trust your roster.', 'I am proud of you for sticking with that lineup.', 'That is exactly the payoff you deserved.', 'Your hard work setting that lineup is paying off.', 'Take a moment and enjoy that one.', 'You are doing great. Keep going.'],
    bad: ['That stings, but you have been here before and bounced back.', 'Take a breath. You are still very much in this.', 'Not what we wanted, but you are not out of it.', 'It is okay. You made the best call you could.', 'One play does not define your week.', 'I believe in this roster, and I believe in you.', 'We will get the next one. I promise.', 'Hang in there. Plenty of game left.'],
    mixed: ['Some good, some tough. You will get through it.', 'Stay focused, you have got this.', 'A little of both, and you are handling it well.', 'Keep your head up, it is still anyone\'s game.', 'You are right where you need to be.', 'Whatever happens, you built a solid team.']
  },
  hype: {
    good: ['LET\'S GO! That is huge!', 'BOOM! Put it in the highlight reel!', 'Absolutely electric, that is a game changer!', 'THAT is what I am talking about!', 'Somebody turn this up, we are rolling!', 'You are COOKING right now!', 'Check the scoreboard, we are SURGING!', 'Unbelievable! Do it again!'],
    bad: ['Ooooh, that one HURTS! But we are not done!', 'Big hit! Time to answer back!', 'Brace yourself, this is where it gets wild!', 'Okay, okay, that was a gut punch! Let\'s bounce back!', 'They landed one! Now it is OUR turn!', 'Heavy! But the comeback starts NOW!', 'That is the drama we signed up for!', 'We have got a fight on our hands and I LOVE it!'],
    mixed: ['What a rollercoaster! Buckle up!', 'Chaos! I love it!', 'Everything is happening at once!', 'This is why we watch!', 'The tension is unreal!', 'Hold on tight, it is going to get loud!']
  }
};
// The roast style with the heat turned up: harsher, still about fantasy decisions and on-field play only.
const REACT_SPICY = {
  good: ['Damn, even you cannot ruin that one.', 'A stopped clock hits twice. Do not let it go to your head.', 'Hell, I will take it. Do not get used to it.', 'Damn lucky, that is what that was.', 'Hell of a fluke, give it a minute and you will mess it up.', 'Even your terrible lineup got one right. Damn.', 'Do not look at me like I owe you a compliment.', 'Fine, good play. Now go back to being a disaster.'],
  bad: ['That is a dumpster fire, and you built it.', 'Hell of a way to waste a roster spot.', 'Your lineup decisions are a cry for help.', 'Damn, that is painful to watch.', 'You drafted a disaster and now you are living in it.', 'That lineup is a monument to bad judgment.', 'Hell, I would bench the whole team if I were you.', 'Absolute garbage luck, or garbage planning. Probably both.'],
  mixed: ['Half a win and half a disaster, which is your whole brand.', 'Damn, even your good news arrives with bad luck attached.', 'Hell of a split decision. Typical.', 'You cannot even lose cleanly. Damn.', 'A coin flip, and you will find a way to lose it.', 'Somehow it is neither good nor bad, just messy like your lineup.']
};

// How the stakes in a league sound: comfortable, a coin flip, or an uphill fight.
const STAKES = {
  optimistic: { high: 'You are cruising there at {n} percent.', mid: 'It is a fun little coin flip at {n} percent.', low: 'You are at {n} percent, which means a lot of room to climb.' },
  pessimistic: { high: '{n} percent now, which is exactly when things fall apart.', mid: '{n} percent. A coin flip, and I always lose those.', low: '{n} percent. I have seen this movie.' },
  neutral: { high: 'You are a clear favorite there, {n} percent.', mid: 'It is close, {n} percent.', low: 'You are an underdog at {n} percent.' },
  roast: { high: '{n} percent, so even you cannot mess it up. Probably.', mid: '{n} percent, a coin flip you will find a way to lose.', low: '{n} percent. Say goodbye to that one.' },
  supportive: { high: 'You are in great shape there, {n} percent.', mid: 'It is anyone\'s game at {n} percent, and you have got this.', low: 'You are at {n} percent, but this is a fight you can win.' },
  hype: { high: '{n} PERCENT! You are running away with it!', mid: '{n} percent, a PURE coin flip!', low: '{n} percent, but a miracle is brewing!' }
};
const stakes = (style, name, wp, rnd) => {
  const band = wp >= 0.65 ? 'high' : wp <= 0.35 ? 'low' : 'mid';
  return 'In ' + name + ': ' + STAKES[style][band].replace('{n}', pctOf(wp));
};

const LORE_LEAD = {
  optimistic: ['Here is a fun flashback.', 'Remember this? I love this one.'],
  pessimistic: ['Let me remind you of something.', 'Rewind with me, if you must.'],
  neutral: ['Quick flashback.', 'A bit of context from earlier this season.'],
  roast: ['Let me remind you what this team has done.', 'Time for a history lesson.'],
  supportive: ['Let\'s remember something good.', 'A little context from earlier this season.'],
  hype: ['FLASHBACK TIME!', 'Roll the tape!']
};
const LORE_REACT = {
  optimistic: ['That is why I believe in this league.', 'And it can happen again today!'],
  pessimistic: ['Which means anything can go wrong.', 'Memories. Most of them painful.'],
  neutral: ['Worth keeping in mind today.', 'That is the context.'],
  roast: ['So yes, the league is chaos, and so is your roster.', 'And somehow you still have not learned anything.'],
  supportive: ['It shows that anything can happen, and that is good for you.', 'There is a lot of football left in this season.'],
  hype: ['The football has been WILD this year!', 'And it is only going to get crazier!']
};

const OPEN = {
  optimistic: ['Welcome to Hot Route Radio! Great day for fantasy football.', 'We are live, and I have a really good feeling about today.', 'Hot Route Radio is on the air, and the sun is shining on your leagues!', 'Welcome in! Today is a day full of possibility.'],
  pessimistic: ['Welcome to Hot Route Radio. Try to enjoy it while it lasts.', 'We are live. Brace yourself.', 'Hot Route Radio, on the air. I have a bad feeling about this.', 'Welcome. Let\'s see how today lets you down.'],
  neutral: ['Welcome to Hot Route Radio. Let\'s walk through your leagues.', 'We are live. Here is where things stand.', 'Hot Route Radio is on the air. Let\'s get into your matchups.', 'Welcome in. We will keep you updated all day.'],
  roast: ['Welcome to Hot Route Radio, where your roster gets what it deserves.', 'We are live, so let\'s see how badly this goes.', 'Hot Route Radio is on the air. Hide the kids and the lineup.', 'Welcome back, loyal listener of questionable decisions.'],
  supportive: ['Welcome to Hot Route Radio. We are here with you all the way.', 'We are live, and we are in your corner today.', 'Hot Route Radio is on the air. Let\'s do this together.', 'Welcome in. You have got a good team, and we are here for it.'],
  hype: ['WELCOME TO HOT ROUTE RADIO! It is game time!', 'WE ARE LIVE! Let\'s get loud!', 'HOT ROUTE RADIO IS ON THE AIR! Buckle up!', 'IT IS FOOTBALL TIME! Let\'s GO!']
};
const RUNDOWN_OPEN = {
  optimistic: ['Time for a quick check on how we are looking.', 'Let\'s check the scoreboard, I bet it is good.', 'Scoreboard time, my favorite time!', 'Let\'s see how bright things look.'],
  pessimistic: ['Let\'s see how bad the scoreboard looks.', 'Time for the rundown. Hold on tight.', 'Okay, the scoreboard. Deep breath.', 'Let\'s see what damage has been done.'],
  neutral: ['Here is your league rundown.', 'Let\'s check where each matchup stands.', 'Time for a scoreboard update.', 'Here is how the day looks so far.'],
  roast: ['Time to see how your leagues are embarrassing you.', 'Scoreboard time. Try not to cry.', 'Let\'s check in on the wreckage.', 'Rundown time. I brought popcorn.'],
  supportive: ['Let\'s check in on your leagues together.', 'Here is how you are doing, and you are doing fine.', 'Time for a scoreboard check, no pressure.', 'Let\'s see how things are shaping up for you.'],
  hype: ['SCOREBOARD CHECK! Here we go!', 'Rundown time! Let\'s see where we stand!', 'LET\'S CHECK THE BOARD!', 'Scoreboard! Scoreboard! Scoreboard!']
};
const ROOT_FOR = {
  optimistic: 'Cheer for', pessimistic: 'You will want', neutral: 'Root for', roast: 'Pray for', supportive: 'Let\'s root for', hype: 'Scream for'
};
const ROOT_AGAINST = {
  optimistic: 'and hope quiet games from', pessimistic: 'and pray against', neutral: 'and root against', roast: 'and wish misery on', supportive: 'and hope for a quiet day from', hype: 'and boo'
};

// ── Facts -> a short exchange. Host index 0 or 1; the director's first line is always host 0. ────────────
const react = (style, mood, spicy, rnd) =>
  pick(style === 'roast' && spicy ? REACT_SPICY[mood] : REACT[style][mood], rnd);

const moodOfHits = hits => {
  const s = hits.reduce((n, h) => n + (h.side === 'mine' ? 1 : -1) * h.est, 0);
  return s > 0.05 ? 'good' : s < -0.05 ? 'bad' : 'mixed';
};
const moodOfWp = wp => (wp >= 0.6 ? 'good' : wp <= 0.4 ? 'bad' : 'mixed');

const yardsIn = text => { const m = /for (-?\d+) yards?/.exec(text || ''); return m ? Number(m[1]) : null; };

function playVerb(h, f) {
  const y = yardsIn(f.text);
  if (f.badge === 'TD') return 'found the end zone';
  if (f.badge === 'INT') return h.role === 'passer' ? 'just threw an interception' : 'came up with an interception';
  if (f.badge === 'FUM') return 'put the ball on the ground';
  if (f.badge === 'SAF') return 'is involved in a safety';
  if (f.badge === 'FG') return 'connected on a field goal';
  if (h.role === 'receiver') return y != null ? 'caught one for ' + y + ' yards' : 'made a catch';
  if (h.role === 'rusher') return y != null ? 'carried it for ' + y + ' yards' : 'got a carry';
  if (h.role === 'passer') return y != null ? 'completed a pass for ' + y + ' yards' : 'dropped back to pass';
  if (h.role === 'kicker') return 'is on the field to kick';
  if (h.role === 'defense') return 'made a defensive play';
  return 'was in on that play';
}

export function composePlay(f, style, spicy, names, rnd = Math.random) {
  const hits = f.hits || [];
  if (!hits.length) return [];
  const primary = hits.slice().sort((a, b) => Math.abs(b.est) - Math.abs(a.est))[0];
  const mood = moodOfHits(hits);
  const pts = primary.est ? ' for about ' + n1(Math.abs(primary.est)) + ' points' : '';
  // The same player can be yours in some leagues and your opponent's in others.
  const same = hits.filter(h => h.name === primary.name);
  const mineL = [...new Set(same.filter(h => h.side === 'mine').flatMap(h => h.leagues))];
  const oppL = [...new Set(same.filter(h => h.side === 'opp').flatMap(h => h.leagues))];
  const up = primary.est >= 0;
  let side, effect;
  if (mineL.length && oppL.length) {
    side = 'He\'s yours in ' + joinNames(mineL) + ' and on the other side in ' + joinNames(oppL) + '.';
    effect = up ? 'That helps you in ' + joinNames(mineL) + ' and hurts you in ' + joinNames(oppL) + '.' : 'That hurts you in ' + joinNames(mineL) + ' and helps you in ' + joinNames(oppL) + '.';
  } else if (mineL.length) {
    side = 'He\'s yours in ' + joinNames(mineL) + '.';
    effect = up ? 'That helps you.' : 'That hurts you.';
  } else {
    side = 'He\'s on the other side in ' + joinNames(oppL) + '.';
    effect = up ? 'That hurts you.' : 'That helps you.';
  }
  if (!primary.est) effect = 'That one is a wash.';
  const lines = [
    { host: 0, text: primary.name + ' ' + playVerb(primary, f) + (pts && f.badge ? pts : '') + '.' },
    { host: 1, text: side + ' ' + effect },
    { host: 0, text: react(style, mood, spicy, rnd) }
  ];
  const close = (f.impact || [])[0];
  if (close) lines.push({ host: 1, text: stakes(style, close.name, close.wp, rnd) });
  return lines;
}

export function composeRundown(f, style, spicy, names, rnd = Math.random) {
  const ls = (f.leagues || []).filter(l => l && l.name);
  if (!ls.length) return [];
  const spoken = ls.slice(0, 4).map(l => l.done
    ? 'In ' + l.name + ' it finished ' + n1(l.you) + ' to ' + n1(l.them) + ', ' + (l.you > l.them ? 'a win' : l.you < l.them ? 'a loss' : 'a tie') + '.'
    : 'In ' + l.name + ' it is ' + n1(l.you) + ' to ' + n1(l.them) + ', and you are at ' + pctOf(l.wp) + ' percent.');
  const open = ls.filter(l => !l.done);
  const avg = open.length ? open.reduce((n, l) => n + l.wp, 0) / open.length : (ls.filter(l => l.you > l.them).length >= ls.length / 2 ? 0.8 : 0.2);
  const lines = [
    { host: 0, text: pick(RUNDOWN_OPEN[style], rnd) },
    { host: 1, text: spoken.join(' ') },
    { host: 0, text: react(style, moodOfWp(avg), spicy, rnd) }
  ];
  const up = (f.rootFor || []).slice(0, 2), down = (f.rootAgainst || []).slice(0, 2);
  if (up.length || down.length) {
    lines.push({ host: 1, text: [up.length ? ROOT_FOR[style] + ' ' + joinNames(up) : '', down.length ? (up.length ? ROOT_AGAINST[style] : 'You will want to root against') + ' ' + joinNames(down) : ''].filter(Boolean).join(' ') + '.' });
  }
  return lines;
}

export function composeNeed(f, style, spicy, names, rnd = Math.random) {
  const l = f.league;
  if (!l) return [];
  const gapWords = Math.abs(l.diff) < 0.5 ? 'it is tied' : l.diff > 0 ? 'you are up ' + n1(l.diff) : 'you are down ' + n1(-l.diff);
  const left = 'You have ' + l.leftMine + ' left to play and they have ' + l.leftOpp + '.';
  const Gap = gapWords.charAt(0).toUpperCase() + gapWords.slice(1);
  const h = (l.helpers || []).slice(0, 2), t = (l.threats || []).slice(0, 2);
  const open = pick([
    'Let\'s talk ' + l.name + '. ' + Gap + '. ' + left,
    'Now, ' + l.name + '. ' + Gap + ', and ' + left.charAt(0).toLowerCase() + left.slice(1),
    'Checking in on ' + l.name + ': ' + gapWords + '. ' + left
  ], rnd);
  const behind = [
    'To win this one, you need ' + (h.length ? joinNames(h) + ' to beat their projections' : 'a big finish') + (t.length ? ', and ' + joinNames(t) + ' to stay quiet' : '') + '.',
    'Here is the path: ' + (h.length ? joinNames(h) + ' has to go off' : 'you need a big finish') + (t.length ? ', and ' + joinNames(t) + ' cannot have a big day' : '') + '.',
    'It comes down to ' + (h.length ? joinNames(h) : 'what you have left') + (t.length ? ' outscoring ' + joinNames(t) : '') + '. That is the whole story.'
  ];
  const ahead = [
    'You are in decent shape' + (t.length ? ', just keep ' + joinNames(t) + ' from blowing up on you' : '') + '.',
    'Protect this one' + (t.length ? ': the danger is ' + joinNames(t) + ' having a monster day' : '') + '.',
    'You are the one holding the cards here' + (t.length ? ', so just watch out for ' + joinNames(t) : '') + '.'
  ];
  return [
    { host: 0, text: open },
    { host: 1, text: pick(l.exp < 0 ? behind : ahead, rnd) },
    { host: 0, text: react(style, moodOfWp(l.wp), spicy, rnd) }
  ];
}

export function composeLore(f, style, spicy, names, rnd = Math.random) {
  if (!f.item) return [];
  const lines = [{ host: 0, text: pick(LORE_LEAD[style], rnd) + ' ' + f.item.text }];
  if (f.mention.length) lines.push({ host: 1, text: joinNames(f.mention) + (f.mention.length > 1 ? ' are' : ' is') + ' in your leagues, so that matters today.' });
  else if (f.relevant) lines.push({ host: 1, text: 'You have players from ' + (f.item.teams.length > 1 ? 'one of those teams' : 'that team') + ' in your leagues.' });
  lines.push({ host: lines.length % 2, text: pick(LORE_REACT[style], rnd) });
  return lines;
}

export function composeRootcall(f, style, spicy, names, rnd = Math.random) {
  const up = (f.rootFor || []).slice(0, 2), down = (f.rootAgainst || []).slice(0, 2);
  if (!up.length && !down.length) return [];
  const lines = [];
  if (up.length) lines.push({ host: 0, text: ROOT_FOR[style] + ' ' + joinNames(up) + '. A big game from ' + (up.length > 1 ? 'them' : 'him') + ' moves your win chances the most.' });
  if (down.length) lines.push({ host: up.length ? 1 : 0, text: 'On the other side, ' + joinNames(down) + ' ' + (down.length > 1 ? 'are' : 'is') + ' the biggest threat' + (down.length > 1 ? 's' : '') + '.' });
  lines.push({ host: lines.length % 2, text: react(style, up.length >= down.length ? 'good' : 'bad', spicy, rnd) });
  return lines;
}

export function composeIntro(f, style, spicy, names, rnd = Math.random) {
  const n = (f.leagues || []).length;
  return [
    { host: 0, text: pick(OPEN[style], rnd) },
    { host: 1, text: n ? 'I have ' + n + (n === 1 ? ' league' : ' leagues') + ' loaded for you' + (f.live ? ', and ' + f.live + (f.live === 1 ? ' game is live.' : ' games are live.') : '. Nothing is live yet, so we will keep an eye on the clock.') : 'Add a league in the app and we will get started.' }
  ];
}

export function composeOutro(f, style, spicy, names, rnd = Math.random) {
  const ls = (f.leagues || []).filter(l => l.done);
  const w = ls.filter(l => l.you > l.them).length, l2 = ls.filter(l => l.you < l.them).length;
  return [
    { host: 0, text: 'That is a wrap on week ' + f.week + '.' + (ls.length ? ' You finished ' + w + ' and ' + l2 + '.' : '') },
    { host: 1, text: react(style, w > l2 ? 'good' : w < l2 ? 'bad' : 'mixed', spicy, rnd) + ' Thanks for listening.' }
  ];
}

export function compose(seg, style, spicy, names, rnd = Math.random) {
  switch (seg.kind) {
    case 'play': return composePlay(seg.facts, style, spicy, names, rnd);
    case 'rundown': return composeRundown(seg.facts, style, spicy, names, rnd);
    case 'need': return composeNeed(seg.facts, style, spicy, names, rnd);
    case 'rootcall': return composeRootcall(seg.facts, style, spicy, names, rnd);
    case 'lore': return composeLore(seg.facts, style, spicy, names, rnd);
    case 'intro': return composeIntro(seg.facts, style, spicy, names, rnd);
    case 'outro': return composeOutro(seg.facts, style, spicy, names, rnd);
    default: return [];
  }
}

// ── Facts from the app's data ──────────────────────────────────────────────────────────────────────
// hr: the Hot Route result (leagues' outlooks and the ranked players). Returns plain facts for the writer.
export function snapshotFacts(hr, week, live = 0) {
  const leagues = hr.leagues.map(o => ({
    name: o.name, you: o.me, them: o.them, wp: o.wp, done: o.done, diff: o.diff, exp: o.exp,
    leftMine: o.leftMine, leftOpp: o.leftOpp,
    helpers: o.mine.filter(x => x.f > 0).sort((a, b) => b.mean - a.mean).map(x => x.p.name),
    threats: o.opp.filter(x => x.f > 0).sort((a, b) => b.mean - a.mean).map(x => x.p.name)
  }));
  const everyone = hr.leagues.flatMap(o => [...o.mine, ...o.opp]).map(x => x.p);
  return {
    week, live, leagues,
    teams: [...new Set(everyone.map(p => p.team).filter(Boolean))],
    names: [...new Set(everyone.map(p => p.name).filter(Boolean))],
    rootFor: hr.rootFor.slice(0, 3).map(r => r.player.name),
    rootAgainst: hr.rootAgainst.slice(0, 3).map(r => r.player.name),
    over: leagues.length > 0 && leagues.every(l => l.done)
  };
}

// How much a play matters to the show: 3 = big moment, 2 = notable, 1 = minor.
export function importanceOf(play) {
  if (['TD', 'INT', 'FUM', 'SAF'].includes(play.badge)) return 3;
  if (play.badge === 'FG' || play.badge === 'PTS') return 2;
  return Math.max(0, ...play.hits.map(h => Math.abs(h.est))) >= 3 ? 2 : 1;
}

// ── The director: what to say next ─────────────────────────────────────────────────────────────────
export function createDirector({ rundownEvery = 240000, fillerEvery = 40000, maxAge = 120000 } = {}) {
  const st = { started: false, ended: false, lastRundown: 0, lastFiller: 0, lastPlay: 0, pending: [], seen: new Set(), n: 0, lastNeed: {}, lore: new Set(), lastRoot: 0 };
  const FILLERS = ['need', 'rootcall', 'lore', 'banter'];

  const closest = (ls, now) => ls
    .filter(l => !l.done && now - (st.lastNeed[l.name] || 0) > 150000)
    .sort((a, b) => Math.abs(a.wp - 0.5) - Math.abs(b.wp - 0.5))[0];

  return {
    // play: { key, importance, facts, at }
    pushPlay(play) {
      if (st.seen.has(play.key)) return;
      st.seen.add(play.key);
      st.pending.push(play);
      if (st.pending.length > 8) st.pending.sort((a, b) => b.importance - a.importance || b.at - a.at).length = 8;
    },
    // snap: { facts, live } from snapshotFacts. Returns the next segment or null if there is nothing to say yet.
    next(now, snap) {
      if (st.ended) return null;
      const f = snap.facts;
      if (!st.started) { st.started = true; st.lastRundown = now; st.lastFiller = now; return { kind: 'intro', facts: f }; }
      st.pending = st.pending.filter(p => now - p.at < maxAge);
      const top = st.pending.slice().sort((a, b) => b.importance - a.importance || b.at - a.at)[0];
      if (top && (top.importance >= 2 || now - st.lastPlay > 25000)) {
        st.pending.splice(st.pending.indexOf(top), 1);
        st.lastPlay = now;
        return { kind: 'play', importance: top.importance, facts: top.facts };
      }
      if (f.over) { st.ended = true; return { kind: 'outro', facts: f }; }
      if (now - st.lastRundown >= (snap.live ? rundownEvery : rundownEvery * 1.5)) { st.lastRundown = now; return { kind: 'rundown', facts: f }; }
      if (now - st.lastFiller >= fillerEvery) {
        st.lastFiller = now;
        for (let i = 0; i < FILLERS.length; i++) {
          const kind = FILLERS[st.n++ % FILLERS.length];
          if (kind === 'need') { const l = closest(f.leagues, now); if (l) { st.lastNeed[l.name] = now; return { kind: 'need', facts: { league: l, week: f.week } }; } }
          if (kind === 'rootcall' && now - st.lastRoot > 240000 && (f.rootFor.length || f.rootAgainst.length)) { st.lastRoot = now; return { kind: 'rootcall', facts: f }; }
          if (kind === 'lore') { const pl = pickLore(f, st.lore); if (pl) { st.lore.add(pl.item.id); return { kind: 'lore', facts: pl }; } }
          if (kind === 'banter') return { kind: 'banter', facts: f };
        }
      }
      return null;
    },
    get ended() { return st.ended; }
  };
}
