const DATA_URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv';

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (quoted) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length).map(r => Object.fromEntries(headers.map((h,i)=>[h,r[i] ?? ''])));
}

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g,'');

function emptyPlayer(name, team, number) {
  return { name, team, position:'TE', number, receptions:0, receivingYards:0, receivingTds:0, twoPt:0, drops:null, fantasyPoints:0, games:0 };
}

function summarize(rows, name, team, number) {
  const p = emptyPlayer(name, team, number);
  p.name = rows[0]?.player_display_name || rows[0]?.player_name || name;
  const weeks = new Set();
  for (const r of rows) {
    weeks.add(`${r.season}-${r.week}`);
    p.receptions += num(r.receptions);
    p.receivingYards += num(r.receiving_yards);
    p.receivingTds += num(r.receiving_tds);
    p.twoPt += num(r.receiving_2pt_conversions);
  }
  p.games = weeks.size;
  p.fantasyPoints = p.receptions + p.receivingYards / 10 + p.receivingTds * 6 + p.twoPt * 2;
  return p;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
  try {
    const response = await fetch(DATA_URL, { headers: { 'User-Agent':'Harrison-Has-a-Tight-End/1.0' } });
    if (!response.ok) throw new Error(`nflverse returned ${response.status}`);
    const csv = await response.text();
    const all = parseCSV(csv).filter(r => String(r.season_type || '').toLowerCase() === 'reg' && num(r.season) === 2026);
    const arroyoRows = all.filter(r => norm(r.player_name).includes('arroyo') || norm(r.player_display_name).includes('arroyo'));
    const sadiqRows = all.filter(r => norm(r.player_name).includes('sadiq') || norm(r.player_display_name).includes('sadiq'));
    const a = summarize(arroyoRows, 'Elijah Arroyo', 'SEA', '18');
    const b = summarize(sadiqRows, 'Kenyon Sadiq', 'NYJ', '16');
    const weeks = Array.from({length:18},(_,i)=>i+1);
    const weekly = weeks.map(week=>{
      const ar=arroyoRows.filter(r=>num(r.week)===week), sr=sadiqRows.filter(r=>num(r.week)===week);
      const make=x=>({receptions:x.reduce((s,r)=>s+num(r.receptions),0),receivingYards:x.reduce((s,r)=>s+num(r.receiving_yards),0),receivingTds:x.reduce((s,r)=>s+num(r.receiving_tds),0),twoPt:x.reduce((s,r)=>s+num(r.receiving_2pt_conversions),0),fantasyPoints:x.reduce((s,r)=>s+num(r.receptions)+num(r.receiving_yards)/10+num(r.receiving_tds)*6+num(r.receiving_2pt_conversions)*2,0)});
      return {week,arroyo:make(ar),sadiq:make(sr)};
    });
    let ac=0,bc=0;
    const chartsA=weekly.map(w=>{ac+=w.arroyo.fantasyPoints;return {week:w.week,points:Number(ac.toFixed(2)),team:'SEA'}});
    const chartsB=weekly.map(w=>{bc+=w.sadiq.fantasyPoints;return {week:w.week,points:Number(bc.toFixed(2)),team:'NYJ'}});
    const updatedAt=new Date().toISOString();
    res.status(200).json({updatedAt,source:'nflverse',players:{arroyo:a,sadiq:b},weekly,charts:{arroyo:chartsA,sadiq:chartsB}});
  } catch (err) {
    res.status(502).json({error:'Unable to load live NFL stats',detail:err.message});
  }
}
