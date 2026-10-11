import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STYLES, STYLE_KEYS, compose, createDirector, importanceOf, snapshotFacts } from './lib/radio.js';
import { cancelSpeech, keepAwake, loadVoices, pickVoices, speak, speechSupported, unlockSpeech } from './lib/speech.js';
import { radioAI } from './lib/cloud.js';
import { boardFor, matchPlays } from './lib/pbp.js';
import { groupByGame } from './lib/games.js';
import { load, save } from './lib/store.js';
import { Icon, Switch } from './ui.jsx';
import { trackedFor, useGameFeeds } from './Plays.jsx';

const PREF = 'ff-radio';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wordsOf = t => String(t).split(/\s+/).length;

// Hot Route Radio: two hosts talk through the live plays that touch your leagues, fill the gaps with what you need
// to win, and give a scoreboard rundown every few minutes. Pick a style; the roast style has a spicier setting.
export default function Radio({ week, wk, shown, board, helper, hr }) {
  const prefs = useRef(load(PREF, {})).current;
  const [style, setStyle] = useState(STYLES[prefs.style] ? prefs.style : 'neutral');
  const [spicy, setSpicy] = useState(!!prefs.spicy);
  const [muted, setMuted] = useState(!!prefs.muted);
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState([]);                // captions: { id, host, name, text }
  const [talking, setTalking] = useState(-1);
  const [ai, setAi] = useState('unknown');               // unknown | on | off | setup
  const canSpeak = speechSupported();

  useEffect(() => { save(PREF, { style, spicy, muted }); }, [style, spicy, muted]);

  // Live games with your players: their plays become things for the hosts to react to.
  const games = useMemo(() => groupByGame(week, wk, undefined, shown).games, [week, wk, shown]);
  const liveList = useMemo(() => games.map(g => ({ g, info: boardFor(board, g.key) })).filter(x => x.info && x.info.state === 'in'), [games, board]);
  const feeds = useGameFeeds(liveList, helper, on && liveList.length > 0);

  const live = useRef({});
  live.current = { style, spicy, muted, hr, week, liveCount: liveList.length };
  const director = useRef(null);
  const run = useRef(0);
  const recent = useRef([]);
  const aiPause = useRef(0);
  const voices = useRef({ a: null, b: null, shared: true });

  // Feed new plays to the director as they arrive (anything already there when we started is skipped).
  useEffect(() => {
    if (!on || !director.current) return;
    liveList.forEach(({ g, info }) => {
      const f = feeds.byId[info.id];
      if (!f) return;
      matchPlays(f.plays, trackedFor(g)).forEach(p => {
        if (!p.hits.length || !feeds.seenAt(info.id, p.id)) return;
        const open = (live.current.hr ? live.current.hr.leagues : []);
        const impact = [...new Set(p.hits.flatMap(h => h.leagues))]
          .map(name => open.find(o => o.name === name)).filter(Boolean)
          .sort((a, b) => Math.abs(a.wp - 0.5) - Math.abs(b.wp - 0.5)).map(o => ({ name: o.name, wp: o.wp }));
        director.current.pushPlay({
          key: info.id + ':' + p.id, importance: importanceOf(p), at: Date.now(),
          facts: {
            badge: p.badge, text: p.text, period: p.period, clock: p.clock, game: (f.away || info.away) + ' at ' + (f.home || info.home),
            hits: p.hits.map(h => ({ name: h.name, pos: h.pos, side: h.side, est: h.est, leagues: h.leagues, role: h.role })), impact
          }
        });
      });
    });
  }, [feeds.byId, on]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Writes the lines for one topic: AI banter for big moments when it's set up, otherwise the built-in writer.
  const write = useCallback(async seg => {
    const { style: st, spicy: sp } = live.current;
    const names = STYLES[st].hosts;
    const wantAI = seg.kind === 'banter' || (seg.kind === 'play' && seg.importance >= 2);
    if (wantAI && Date.now() > aiPause.current) {
      try {
        const out = await radioAI({ style: st, spicy: sp, kind: seg.kind, hosts: names, speakerFirst: 'A', facts: seg.facts, recent: recent.current.slice(-4) });
        setAi('on');
        return out.map(l => ({ host: l.host === 'B' ? 1 : 0, text: l.text }));
      } catch (e) {
        if (e.message === 'not_configured' || e.message === 'not_deployed') { aiPause.current = Infinity; setAi('setup'); }
        else if (e.message !== 'slow_down') { aiPause.current = Date.now() + 120000; setAi('off'); }
      }
    }
    let s = seg;
    if (seg.kind === 'banter') {   // no AI: fall back to what has to happen, or who to root for
      const f = seg.facts;
      const l = f.leagues.filter(x => !x.done)[0];
      s = f.rootFor.length || f.rootAgainst.length ? { kind: 'rootcall', facts: f } : l ? { kind: 'need', facts: { league: l, week: f.week } } : { kind: 'rundown', facts: f };
    }
    return compose(s, st, sp, names);
  }, []);

  const stop = useCallback(() => {
    run.current++;
    cancelSpeech();
    setOn(false); setTalking(-1);
  }, []);

  useEffect(() => () => { run.current++; cancelSpeech(); }, []);

  const start = async () => {
    if (on) return;
    unlockSpeech();                                       // must happen inside the tap
    const token = ++run.current;
    const alive = () => run.current === token;
    director.current = createDirector();
    recent.current = [];
    if (canSpeak) voices.current = pickVoices(await loadVoices());
    const release = await keepAwake();
    setLines([]); setOn(true);

    const queue = [];
    // Writer: stays one topic ahead of the speaker so there is no dead air while AI lines are fetched.
    (async () => {
      while (alive()) {
        let seg = null;
        if (queue.length < 1) {
          const { hr: h, week: w, liveCount } = live.current;
          seg = h ? director.current.next(Date.now(), { facts: snapshotFacts(h, w, liveCount), live: liveCount }) : null;
          if (seg) {
            const out = await write(seg);
            if (alive() && out.length) queue.push({ seg, out, style: live.current.style });
          }
        }
        await sleep(seg ? 100 : 1500);
      }
    })();
    // Speaker: shows each line as a caption and reads it aloud, one after another.
    (async () => {
      let n = 0;
      while (alive()) {
        const item = queue.shift();
        if (!item) {
          if (director.current.ended) break;
          await sleep(300); continue;
        }
        const names = STYLES[item.style].hosts;
        for (const l of item.out) {
          if (!alive()) break;
          setLines(prev => [...prev.slice(-30), { id: ++n, host: l.host, name: names[l.host], text: l.text }]);
          setTalking(l.host);
          recent.current.push(names[l.host] + ': ' + l.text);
          const v = voices.current;
          if (canSpeak && !live.current.muted) await speak(l.text, l.host === 0 ? v.a : v.b, { pitch: v.shared ? (l.host === 0 ? 1.15 : 0.8) : 1 });
          else await sleep(Math.max(1800, wordsOf(l.text) * 330));
          setTalking(-1);
          await sleep(250);
        }
        await sleep(item.seg.kind === 'play' ? 400 : 1200);
      }
      if (alive()) { run.current++; setOn(false); setTalking(-1); }
      release();
    })();
  };

  const feedRef = useRef(null);
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [lines]);

  const st = STYLES[style];
  const nothingYet = !hr || !hr.leagues.length;

  return (
    <section className="card radiocard" aria-label="Hot Route Radio">
      <div className="radio-head">
        <div>
          <div className="radio-title">{on && <i className="dot-live" />}Hot Route Radio</div>
          <div className="radio-sub">Two hosts. Your leagues. {on ? 'Live now.' : 'Pick a vibe and press listen.'}</div>
        </div>
        <button className={'radio-btn' + (on ? ' on' : '')} onClick={on ? stop : start} disabled={nothingYet} aria-pressed={on}>
          {on ? <>Stop</> : <><Icon.activity size={16} sw={2.5} />Listen</>}
        </button>
      </div>

      <div className="radio-styles sc" role="radiogroup" aria-label="Show style">
        {STYLE_KEYS.map(k => (
          <button key={k} role="radio" aria-checked={k === style} className={'radio-style' + (k === style ? ' on' : '')} onClick={() => setStyle(k)}>
            <b>{STYLES[k].label}</b><span>{STYLES[k].blurb}</span>
          </button>
        ))}
      </div>

      {style === 'roast' && (
        <div className="radio-opt"><Switch on={spicy} onChange={setSpicy} label="Spicier roast" hint="Harsher jokes and mild language (PG-13). Still only about your roster and the play on the field." /></div>
      )}
      {canSpeak && <div className="radio-opt"><Switch on={!muted} onChange={v => setMuted(!v)} label="Voices" hint="Off shows captions only." /></div>}

      {on || lines.length > 0 ? (
        <div className="radio-feed" ref={feedRef} aria-live="polite">
          {lines.map(l => (
            <div key={l.id} className={'radio-line h' + l.host + (l.id === lines[lines.length - 1].id && talking === l.host ? ' talking' : '')}>
              <span className="radio-av">{l.name.slice(0, 1)}</span>
              <div><b>{l.name}</b><p>{l.text}</p></div>
            </div>
          ))}
          {on && !lines.length && <div className="radio-wait">Warming up the studio…</div>}
        </div>
      ) : (
        <p className="radio-note">{nothingYet ? 'Add a league to start the show.' : st.hosts[0] + ' and ' + st.hosts[1] + ' will talk through the live plays that touch your leagues, what you need to win, and a rundown every few minutes.'}</p>
      )}

      <p className="radio-foot">
        {!canSpeak ? 'This browser can\'t speak, so you\'ll get captions. ' : 'Built-in voices; keep the screen on while it plays. '}
        {ai === 'on' ? 'Big moments are written live by AI. ' : ai === 'setup' ? 'AI banter isn\'t set up yet, so the hosts use built-in lines. ' : ai === 'off' ? 'AI banter is unavailable right now; using built-in lines. ' : 'Big moments use AI banter when it\'s set up. '}
        Commentary is generated from your app data and isn't betting advice.
      </p>
    </section>
  );
}
