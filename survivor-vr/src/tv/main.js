// TV view: lobby room code, tribes, mirrored headset view with timer + anonymous effect feed,
// results, tribal-council vote readout (incl. tie-breaks), finale scores, pitches and the jury reveal.
import { connect } from '../shared/net.js';
import { CHALLENGE_META } from '../config/meta.js';
import { SCORING } from '../config/scoring.js';
import { GAME } from '../config/game.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let S = null, receivedAt = 0;
let tick = { timer: null, at: 0, progress: '' };
let lastFeedId = 0;

let room = (new URLSearchParams(location.search).get('room') || sessionStorage.getItem('svr-tv-room') || '').toUpperCase();
let net = null;

function start(r) {
  room = r.toUpperCase(); try { sessionStorage.setItem('svr-tv-room', room); } catch { /* ignore */ }
  net = connect({ role: 'tv', room, onMessage: (m) => {
    if (m.t === 'state') { S = m.s; receivedAt = performance.now(); render(); }
    else if (m.t === 'tick') { tick = { timer: m.timer, at: performance.now(), progress: m.progress }; }
    else if (m.t === 'frame') { $('#mirror').src = m.d; $('#fmirror').src = m.d; }
  } });
  setInterval(() => { net.send({ t: 'tv-ping' }); if (!S) net.send({ t: 'hello' }); }, 2500);
  setTimeout(() => { net.send({ t: 'tv-ping' }); net.send({ t: 'hello' }); }, 400);
  $('#codecorner').textContent = 'ROOM ' + room;
}

const pl = (id) => S.players.find((p) => p.id === id);
const name = (id) => pl(id)?.name || '?';
const color = (id) => pl(id)?.color || '#fff';
const tribeOf = (tid) => S.tribes.find((t) => t.id === tid);
const chName = (id = S.challengeId) => CHALLENGE_META[id]?.name || '';
const fmt = (s) => { const m = Math.floor(s / 60); const r = (s - m * 60).toFixed(1).padStart(m ? 4 : 3, '0'); return m ? `${m}:${r}` : r; };
const remaining = () => Math.max(0, (S?.phaseTimer || 0) - (performance.now() - receivedAt) / 1000);
const dot = (id) => `<span class="dot" style="background:${color(id)}"></span>`;
const chip = (tid) => { const t = tribeOf(tid); return t ? `<span class="chip" style="background:${t.color}">${esc(t.name)}</span>` : ''; };
const tag = (id) => `<span class="p on" style="margin:0 1vw;font-size:3.4vh">${dot(id)}${esc(name(id))}</span>`;
const active = () => S.players.filter((p) => p.status === 'active');

function show(id) { for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id); }

function render() {
  if (!S) return;
  if (S.mode === 'menu') { show('screen-other'); $('#screen-other').innerHTML = `<div><div class="big">🌴 SURVIVOR VR</div><div class="mid">Main menu</div><div class="sm" style="margin-top:3vh">The host is choosing a game…</div><div class="code" style="font-size:9vh;margin-top:4vh">${esc(S.code)}</div></div>`; return; }
  if (S.mode === 'fire') return renderFire();
  const gamePhases = ['turnReady', 'countdown', 'running', 'handoff', 'turnResult'];
  if (gamePhases.includes(S.phase)) { show('screen-game'); renderGame(); return; }
  show('screen-other');
  $('#screen-other').innerHTML = other();
}

function other() {
  const o = S.phase;
  const hdr = (t) => `<div class="mid">${t}</div>`;
  switch (o) {
    case 'lobby':
      return `<div><div class="big">🌴 SURVIVOR: VR ISLAND</div><div class="mid">Join on your phone with room code</div><div class="code">${esc(S.code)}</div>
        <div class="urls">Open <b>${esc(location.origin)}/phone.html</b> and type the code</div>
        <div style="margin-top:3vh">${S.players.map((p) => `<span class="p on" style="font-size:3.6vh;margin:0 1.2vw"><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</span>`).join('') || '<span class="sm">no castaways yet</span>'}</div>
        <div class="sm" style="margin-top:2vh">${S.players.length >= GAME.twoTribeMinPlayers ? 'Two tribes!' : S.players.length + ' players · ' + GAME.twoTribeMinPlayers + '+ makes two tribes'}</div></div>`;
    case 'tribes':
      return `<div><div class="big">THE TRIBES</div>${S.tribes.map((t) => `<div class="tribecol" style="border-color:${t.color}"><h2 style="color:${t.color}">${esc(t.name)}</h2>
        ${S.players.filter((p) => p.tribe === t.id).map((p) => `<div>${dot(p.id)}${esc(p.name)}</div>`).join('')}</div>`).join('')}</div>`;
    case 'picker':
      return `<div>${hdr(S.twoTribes && !S.merged ? 'Team challenge incoming…' : 'Next challenge…')}<div class="big">Host is choosing</div>
        <div style="margin-top:3vh">${active().map((p) => tag(p.id)).join('')}</div>
        ${S.jurors.length ? `<div class="sm" style="margin-top:3vh">Jury: ${S.jurors.map((j) => esc(name(j))).join(', ')}</div>` : ''}</div>`;
    case 'roundResults':
      if (S.team) {
        const order = S.team.order;
        return `<div>${hdr(chName() + ' - relay results')}<div class="big">${esc(tribeOf(S.team.winning).name)} win!</div>
          <div class="board">${order.map((tid, i) => { const t = S.team.totals[tid]; return `<div class="r ${i === 0 ? 'win' : ''}"><span class="chip" style="background:${tribeOf(tid).color}">${esc(tribeOf(tid).name)}</span>
            <span class="sm">${t.penalty ? '+' + t.penalty + 's penalties' : ''}</span><span class="v">${fmt(t.total)}</span></div>`; }).join('')}</div>
          <div class="mid" style="margin-top:3vh">${esc(tribeOf(S.team.losing).name)} heads to Tribal Council.</div></div>`;
      }
      return `<div>${hdr(chName() + ' - results')}<div class="big">🛡️ ${esc(name(S.immunityId))} wins immunity!</div>
        <div class="board">${S.ranking.map((id, i) => `<div class="r ${i === 0 ? 'win' : ''}"><span>${i + 1}</span>${dot(id)}<b>${esc(name(id))}</b><span class="v">${esc(S.results[id]?.display)}</span></div>`).join('')}</div>
        <div class="sm" style="margin-top:3vh">${SCORING[S.challengeId]?.label || ''}</div></div>`;
    case 'voting': {
      const T = S.tribal;
      const stageTxt = T.stage === 'revote' ? `<div class="big">TIE! REVOTE</div><div class="mid">Everyone votes again - only for: ${T.targets.map((id) => esc(name(id))).join(' or ')}</div>` :
        `<div class="fire">🔥</div><div class="big">TRIBAL COUNCIL</div><div class="mid">${T.kind === 'team' ? esc(tribeOf(T.tribe).name) + ' tribe votes.' : 'Vote on your phones. <b>' + esc(name(S.immunityId)) + '</b> has immunity.'}</div>`;
      return `<div>${stageTxt}<div style="margin-top:4vh">${T.voters.map((id) => `<span class="p ${T.voted.includes(id) ? 'on' : ''}" style="font-size:3.6vh;margin:1vh 1.5vw">${dot(id)}${esc(name(id))} ${T.voted.includes(id) ? '✔' : '…'}</span>`).join('')}</div></div>`;
    }
    case 'readout': {
      const r = S.tribal.readout;
      return `<div><div class="mid">${S.tribal.stage === 'revote' ? 'Revote' : 'Vote'} ${r.index + 1} of ${r.total}</div>
        <div class="parch"><div class="who">A castaway has written…</div><div class="to">${esc(name(r.current.target))}</div>
        <div class="msg">“${esc(r.current.message)}”</div></div>
        <div style="margin-top:3vh">${Object.entries(r.counts).map(([id, n]) => `<span class="p on" style="font-size:3vh;margin:0 1.2vw">${dot(id)}${esc(name(id))}: ${n}</span>`).join('')}</div></div>`;
    }
    case 'tie': {
      const T = S.tribal;
      return `<div><div class="big">IT'S A TIE!</div><div class="mid">${T.tied.map((id) => esc(name(id))).join(' vs ')}</div>
        <div class="sm" style="margin:3vh auto;max-width:60vw;font-size:3vh">${T.nextStage === 'revote' ? 'Everyone votes again - tied players included - but only for the tied players.' :
        'Tied again! The rest of the tribe must reach a UNANIMOUS decision. The tied players do not vote.'}</div></div>`;
    }
    case 'unanimous': {
      const T = S.tribal;
      return `<div><div class="big">UNANIMOUS DECISION</div><div class="mid">${T.voters2.map((id) => esc(name(id))).join(', ')} must agree on:</div>
        <div style="margin:3vh 0">${T.tied.map((id) => `<span class="p on" style="font-size:5vh;margin:0 2vw">${dot(id)}${esc(name(id))}</span>`).join('')}</div>
        <div class="mid">Locked in: ${T.pickCount} / ${T.voters2.length}</div><div class="big cdown" data-kind="unan">${Math.ceil(remaining())}</div>
        <div class="sm">No agreement? A random draw among players with no votes.</div></div>`;
    }
    case 'draw': {
      const T = S.tribal;
      return `<div><div class="big">RANDOM DRAW</div><div class="mid">Players who received no votes - equal chance for each</div>
        <div class="big cdown" data-kind="draw" style="margin-top:4vh">…</div></div>`;
    }
    case 'tribalResult': {
      const T = S.tribal, r = T.result;
      const how = { votes: 'by majority vote', revote: 'after a revote', unanimous: 'by unanimous decision', draw: 'by random draw', forced: '' }[r.how];
      const last = T.history[T.history.length - 1]?.counts || {};
      return `<div class="tally"><div class="mid">The tribe has spoken…</div><div class="big">${esc(name(r.eliminated))}</div><div class="mid">is voted out ${how}.</div>
        <div style="margin:3vh 0">${Object.entries(last).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<span class="p on" style="font-size:3vh;margin:0 1.2vw">${dot(id)}${esc(name(id))}: ${'🔥'.repeat(n)}</span>`).join('')}</div>
        <div class="sm">${r.wasJuror ? 'They join the jury.' : 'Their torch is snuffed.'}</div></div>`;
    }
    case 'merge':
      return `<div><div class="fire">🤝</div><div class="big">THE TRIBES MERGE</div><div class="mid">${active().length} remain. From now on: every player for themselves.</div>
        <div style="margin-top:3vh">${active().map((p) => tag(p.id)).join('')}</div></div>`;
    case 'finaleIntro':
      return `<div><div class="big">🏝️ THE FINALE</div><div class="mid">Three remain. Everyone plays all four challenges.</div>
        <div style="margin:3vh 0">${S.finale.ids.map((id) => `<span class="p on" style="font-size:5vh;margin:0 2vw">${dot(id)}${esc(name(id))}</span>`).join('')}</div>
        <div class="sm" style="font-size:3vh">Points per challenge: ${GAME.finale.points.join(' / ')} · endurance & balance capped at ${S.finale.holdCap / 60} min (ties split the points)</div>
        <div class="sm" style="margin-top:2vh">Highest total wins immunity. The other two make FIRE.</div></div>`;
    case 'finaleScores': {
      const F = S.finale, row = F.rows[F.rows.length - 1];
      return `<div>${hdr('Finale · ' + chName(row.challengeId))}<table class="pts"><tr><th>Place</th><th>Player</th><th>Result</th><th>Pts</th></tr>
        ${row.entries.map((e) => `<tr class="${e.rank === 1 ? 'top' : ''}"><td>${e.rank}${e.tieSize > 1 ? ' (tie)' : ''}</td><td>${dot(e.id)}${esc(name(e.id))}</td><td>${esc(e.display)}</td><td>+${+e.points.toFixed(1)}</td></tr>`).join('')}</table>
        <div class="mid" style="margin-top:3vh">Totals: ${F.ids.map((id) => `${esc(name(id))} <b>${+F.points[id].toFixed(1)}</b>`).join(' · ')}</div></div>`;
    }
    case 'finaleImmunity': {
      const F = S.finale;
      return `<div>${hdr('Finale standings')}<div class="big">🛡️ ${esc(name(F.immunityId))} wins immunity!</div>
        <table class="pts"><tr><th></th><th>Player</th>${F.rows.map((r) => `<th>${esc(chName(r.challengeId).split(' ')[0])}</th>`).join('')}<th>Total</th></tr>
        ${F.standings.map((id, i) => `<tr class="${i === 0 ? 'top' : ''}"><td>${i + 1}</td><td>${dot(id)}${esc(name(id))}</td>${F.rows.map((r) => `<td>${+r.entries.find((e) => e.id === id).points.toFixed(1)}</td>`).join('')}<td>${+F.points[id].toFixed(1)}</td></tr>`).join('')}</table>
        ${F.tiebreak ? `<div class="sm">Tie broken by ${esc(F.tiebreak)}</div>` : ''}
        <div class="mid" style="margin-top:3vh">${F.standings.slice(1).map((id) => esc(name(id))).join(' and ')} now face off in fire-making.</div></div>`;
    }
    case 'fireResult': {
      const F = S.finale;
      return `<div>${hdr('Fire-making')}<div class="big">🔥 ${esc(name(F.fire.winner))} wins fire!</div>
        <div class="board">${[F.fire.winner, F.fire.loser].map((id, i) => `<div class="r ${i === 0 ? 'win' : ''}">${dot(id)}<b>${esc(name(id))}</b><span class="v">${esc(F.fire.results[id].display)}</span></div>`).join('')}</div>
        <div class="mid" style="margin-top:3vh">${esc(name(F.fire.loser))} joins the jury.</div>
        <div class="mid">Finalists: ${F.finalists.map((id) => `${dot(id)}${esc(name(id))}`).join(' & ')}</div></div>`;
    }
    case 'pitch': {
      const F = S.finale, who = F.pitchOrder[F.pitchIndex];
      return `<div>${hdr('Finalist pitch ' + (F.pitchIndex + 1) + ' of 2')}<div class="big">${dot(who)}${esc(name(who))}</div>
        <div class="mid">Tell the jury why you deserve to win.</div><div class="big cdown" data-kind="pitch">${fmt(remaining())}</div>
        <div class="bar"><i id="pitchbar" style="width:100%"></i></div></div>`;
    }
    case 'jury':
      return `<div><div class="big">JURY VOTE</div><div class="mid">Jurors: pick the winner on your phones.</div>
        <div style="margin:3vh 0">${S.finale.finalists.map((id) => `<span class="p on" style="font-size:5vh;margin:0 2vw">${dot(id)}${esc(name(id))}</span>`).join('')}</div>
        <div>${S.jury.jurors.map((id) => `<span class="p ${S.jury.voted.includes(id) ? 'on' : ''}" style="font-size:3vh;margin:1vh 1.4vw">${dot(id)}${esc(name(id))} ${S.jury.voted.includes(id) ? '✔' : '…'}</span>`).join('')}</div></div>`;
    case 'juryReveal': {
      const R = S.jury.reveal, cur = R.shown[R.shown.length - 1];
      return `<div><div class="mid">Vote ${R.index + 1} of ${R.total}</div><div class="parch"><div class="who">${esc(name(cur.juror))} votes for…</div><div class="to">${esc(name(cur.target))}</div></div>
        <div style="margin-top:4vh">${S.finale.finalists.map((id) => `<span class="p on" style="font-size:5vh;margin:0 3vw">${dot(id)}${esc(name(id))}: ${R.counts[id]}</span>`).join('')}</div></div>`;
    }
    case 'winner': {
      const J = S.jury, w = S.winnerId, other = S.finale.finalists.find((f) => f !== w);
      return `<div><div class="crown">👑</div><div class="mid">The sole survivor is…</div><div class="big" style="font-size:14vh">${esc(name(w))}</div>
        <div class="mid">${J.counts ? `${J.counts[w]} – ${J.counts[other]} jury votes` : ''}${J.tieBroken ? ' (tie broken: ' + esc(J.tieBroken) + ')' : ''}</div></div>`;
    }
  }
  return `<div class="big">…</div>`;
}

function renderGame() {
  const p = pl(S.headsetId), run = S.run;
  const tribeTxt = run?.relay ? ` · ${esc(tribeOf(run.group).name)} ${run.index + 1}/${run.count}` : S.episodeType === 'finale' ? ' · finale' : '';
  $('#who').innerHTML = `${dot(S.headsetId)}${esc(p?.name)} <small>${esc(chName(run?.challengeId))}${tribeTxt}</small>`;
  $('#cdbig').style.display = S.phase === 'countdown' ? 'flex' : 'none';
  $('#cdbig').textContent = S.countdown || 'GO!';
  const card = $('#card');
  if (S.phase === 'turnReady') {
    card.style.display = 'flex';
    card.innerHTML = `<div class="mid">Headset on, please…</div><div class="big">${esc(p?.name)}</div><div class="sm">${esc(chName(run?.challengeId))}${run?.relay ? ' · relay for ' + esc(tribeOf(run.group).name) : ''} · get ready!</div>`;
  } else if (S.phase === 'handoff') {
    card.style.display = 'flex';
    card.innerHTML = `<div class="mid">Tag! Next up…</div><div class="big">${esc(p?.name)}</div><div class="sm">The tribe clock keeps running!</div>`;
  } else if (S.phase === 'turnResult') {
    card.style.display = 'flex';
    const r = S.lastResult, tot = S.relay && S.team === null ? S.relay : null;
    card.innerHTML = `<div class="mid">${esc(p?.name)}</div><div class="big">${esc(r?.display ?? '')}</div>${run?.relay ? `<div class="mid">${esc(tribeOf(run.group).name)} total ${fmt(S.relay.clock)}</div>` : ''}`;
  } else card.style.display = 'none';

  const feed = $('#feed');
  if (!S.feed.length || S.feed[S.feed.length - 1].id < lastFeedId) { feed.innerHTML = ''; lastFeedId = 0; }
  for (const f of S.feed) {
    if (f.id <= lastFeedId) continue;
    lastFeedId = f.id;
    const li = document.createElement('li');
    li.className = f.kind;
    li.innerHTML = `<small>${f.kind === 'help' ? '✨ Help' : f.kind === 'sabotage' ? '💥 Sabotage' : '📣'}</small>${esc(f.text)}`;
    feed.prepend(li);
  }
  const nT = S.tappers.length;
  $('#tapinfo').textContent = S.phase === 'running' ? (nT ? `${S.tapCount} of ${nT} taps used - ${S.tapsLeft} still deciding…` : 'No taps this run') +
    (run?.relay ? ` (${esc(tribeOf(run.group).name)} only; the other tribe watches)` : '') : '';
  const group = (list) => list.map((x) => `<span class="p ${x.id === S.headsetId ? 'on' : ''}">${dot(x.id)}${esc(x.name)}${S.results[x.id] ? ' ✔' : ''}</span>`).join('');
  if (S.episodeType === 'team') {
    $('#tribe').innerHTML = S.tribes.map((t) => `<div style="margin:.6vh 0"><span class="chip" style="background:${t.color}">${esc(t.name)}${S.groupTotals ? '' : ''}</span> ${group(S.players.filter((x) => x.tribe === t.id && x.status === 'active'))}</div>`).join('');
  } else $('#tribe').innerHTML = group(S.players.filter((x) => x.status === 'active'));
}

// ---------- standalone Fire Making ----------
const secs = (s) => { const m = Math.floor(s / 60); const r = (s - m * 60).toFixed(1).padStart(m ? 4 : 3, '0'); return m ? `${m}:${r}` : r + 's'; };
function boardHtml(sb, winIdx = 0) {
  return sb.map((r, i) => `<div class="r ${r.dnf ? 'dnf' : i === winIdx ? 'win' : ''}"><b>${r.rank}.</b><span>${esc(r.name)}</span><span class="v">${r.dnf ? 'DNF' : secs(r.time)}</span></div>`).join('');
}
function renderFire() {
  const ph = S.phase;
  const sb = S.scoreboard || [];
  if (ph === 'setup') { show('screen-other'); $('#screen-other').innerHTML = `<div><div class="big">🔥 FIRE MAKING</div><div class="mid">Headset + TV only. One attempt each. Fastest fire wins.</div><div class="sm" style="margin-top:3vh">Host is setting up…</div></div>`; return; }
  if (ph === 'up') {
    show('screen-other');
    $('#screen-other').innerHTML = `<div><div class="mid">Fire Making · ${S.n} of ${S.total}</div><div class="big" style="font-size:12vh">Player ${S.n}, you're up.</div><div class="mid">Put on the headset and type your name.</div>
      ${sb.length ? `<div class="board" style="margin:3vh auto 0">${boardHtml(sb)}</div>` : ''}</div>`; return;
  }
  if (ph === 'final') {
    show('screen-other');
    const w = S.winner;
    $('#screen-other').innerHTML = `<div>${w ? `<div class="crown">👑</div><div class="mid">Fastest fire</div><div class="big" style="font-size:12vh">${esc(w.name)}</div><div class="mid">${secs(w.time)}</div>` : `<div class="big">Nobody made fire</div><div class="mid">Everyone DNF</div>`}
      <div class="board" style="margin:3vh auto 0">${boardHtml(sb)}</div><div class="sm" style="margin-top:2vh">Host: Play Again or Back to Menu</div></div>`; return;
  }
  show('screen-fire');
  $('#fwho').innerHTML = `${esc(S.current?.name)} <small>Player ${S.n} of ${S.total}</small>`;
  $('#fboard').innerHTML = boardHtml(sb) || '<div class="sm">No times yet</div>';
  $('#fnote').textContent = S.remaining > (ph === 'result' ? 0 : 1) ? `${S.remaining - (ph === 'result' ? 0 : 1)} still to play` : '';
  const card = $('#fcard');
  if (ph === 'result' && S.last) {
    card.style.display = 'flex';
    card.innerHTML = `<div class="mid">${esc(S.last.name)}</div><div class="big">${S.last.dnf ? 'DNF' : secs(S.last.time)}</div>${S.last.dnf ? `<div class="sm">${esc(S.last.reason)}</div>` : '<div class="sm">🚩 The flag rises!</div>'}`;
  } else card.style.display = 'none';
  if (ph === 'naming') { $('#ftimer').innerHTML = ''; $('#fstatus').textContent = 'Typing their name…'; }
}

// smooth timer between 5 Hz ticks + countdown widgets
function loop() {
  if (S && S.mode === 'fire' && ['running', 'result'].includes(S.phase) && tick.timer) {
    let v = tick.timer.value;
    if (S.phase === 'running' && tick.timer.mode === 'up') v += (performance.now() - tick.at) / 1000;
    $('#ftimer').innerHTML = `${fmt(Math.max(0, v))}<small>TIME</small>`;
    $('#fstatus').textContent = S.phase === 'running' ? (tick.progress || '') : '';
  } else if (S && S.mode !== 'fire' && tick.timer && ['countdown', 'running', 'turnResult', 'handoff'].includes(S.phase)) {
    let v = tick.timer.value;
    if ((S.phase === 'running' || S.phase === 'handoff') && tick.timer.mode === 'up') v += (performance.now() - tick.at) / 1000;
    $('#timer').innerHTML = `${fmt(Math.max(0, v))}<small>${esc(tick.timer.label)}</small>`;
    $('#progress').textContent = tick.progress || '';
  } else if (S && S.phase === 'turnReady') { $('#timer').innerHTML = ''; $('#progress').textContent = ''; }
  const el = document.querySelector('.cdown');
  if (el && S) {
    const r = remaining();
    if (el.dataset.kind === 'pitch') { el.textContent = fmt(r); const b = $('#pitchbar'); if (b) b.style.width = (r / GAME.finale.pitchSeconds * 100) + '%'; }
    else if (el.dataset.kind === 'unan') el.textContent = Math.ceil(r);
    else if (el.dataset.kind === 'draw') {
      const T = S.tribal, pool = T.draw.pool;
      if (r > GAME.vote.drawRevealSeconds * 0.45) el.textContent = name(pool[Math.floor(performance.now() / 120) % pool.length]);
      else el.innerHTML = `<span style="color:#fff">${esc(name(T.draw.pick))}</span>`;
    }
  }
  requestAnimationFrame(loop);
}
loop();

if (room) start(room);
else {
  show('screen-other');
  $('#screen-other').innerHTML = `<div><div class="big">📺 SURVIVOR TV</div><div class="mid">Enter the room code shown on the host screen</div>
    <input id="rc" maxlength="6" style="font-size:8vh;text-transform:uppercase;width:30vw;text-align:center;border-radius:14px;border:0;padding:1vh"> <button id="go" style="font-size:5vh;padding:1vh 2vw;border-radius:14px;border:0;background:var(--fire)">Go</button></div>`;
  $('#go').onclick = () => { const v = $('#rc').value.trim(); if (v) { start(v); } };
}
