'use strict';
/*
 * Plain Timeline — render timelines from plain-text code blocks.
 *
 * Block:   ```plain-timeline
 * Lines:   - [1789-07-14] Event name | description
 *          @ [1914~1918] Period name | description
 *          @ [2020~] Ongoing period (open end = today)
 *          = [1945] Marker
 *          # comment
 * Options: > orientation horizontal      (or: > 向き 横)
 *          > look scale                  (or: > 見た目 時間軸)   cards | scale
 *          > title Text                  (or: > タイトル …)
 *          > start 1700 / > end 1900     (fix the axis range of the scale look)
 *          > today                       (add a marker for today)
 *          > density compact             > desc hover        > height 300
 *
 * The line syntax is compatible with Chronos Timeline (MIT, clairefro/obsidian-plugin-chronos).
 * No code from that project is used.
 */
const {
  Plugin, PluginSettingTab, Setting, MarkdownRenderer, MarkdownRenderChild, moment, Platform,
} = require('obsidian');

const BLOCK = 'plain-timeline';
const COLORS = ['blue', 'green', 'purple', 'orange', 'cyan', 'pink', 'yellow', 'red', 'gray'];

const DEFAULT_SETTINGS = {
  language: 'auto',               // auto | en | ja
  defaultOrientation: 'vertical', // vertical | horizontal
  defaultLook: 'auto',            // auto | cards | scale  (auto: vertical → cards, horizontal → scale)
  inputOrder: 'ymd',              // ymd | dmy | mdy  (order of date parts as written in blocks)
  twoDigitPivot: 49,              // two-digit years: 00–49 → 2000s, 50–99 → 1900s
  dateFormat: 'localized',        // localized | iso | custom
  customDateFormat: 'DD/MM/YYYY',
  bceStyle: 'auto',               // auto | bce | bc | minus | ja
  descriptions: 'show',           // show | hover
  linkItems: true,
  searchInNote: true,
  showSwitch: true,
  colorMode: 'theme',             // theme | mono
  colorOrder: 'blue, green, purple, orange, cyan, pink, yellow, red',
  frameLinkWithInnerLinks: false, // keep the whole item clickable even when it contains links
  density: 'comfortable',         // comfortable | compact
  sortOrder: 'chronological',     // chronological | written
  horizontalMinWidth: 480,
  showWarnings: true,
};

/* ── i18n ─────────────────────────────────────────── */

const STRINGS = {
  en: {
    vertical: 'Vertical', horizontal: 'Horizontal', cards: 'Cards', scale: 'Scale',
    verticalHint: 'Lay the timeline out vertically', horizontalHint: 'Lay the timeline out horizontally',
    cardsHint: 'Evenly spaced cards — best for events', scaleHint: 'Drawn to scale — best for periods',
    open: t => `Open ${t}`, jump: 'Jump to where this appears in the note', go: 'Open', close: 'Close',
    present: 'present', today: 'Today',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    warnTitle: n => `${n} note${n > 1 ? 's' : ''} about this timeline`,
    why: {
      date: 'unreadable date', syntax: 'not a timeline line', order: 'end is before start (swapped)',
      option: 'unknown option', value: 'unreadable option value', range: 'outside the start/end range (shown at the edge)',
      marker: 'a marker takes a single date (end ignored)', huge: 'year too far from today to draw',
    },
    lineNo: n => `line ${n}`,
    s: {
      language: ['Language', 'Language of the plugin interface and date labels.'],
      langAuto: 'Follow Obsidian', langEn: 'English', langJa: '日本語',
      orientation: ['Default orientation', 'Used when a block has no orientation line. Each block can override it with the switch or "> orientation horizontal".'],
      look: ['Default look', 'Cards space items evenly and suit events; Scale draws lengths in proportion to time and suits periods. "Auto" uses cards when vertical and scale when horizontal. Each block can override it with "> look cards" or "> look scale".'],
      lookAuto: 'Auto',
      inputOrder: ['Date order in blocks', 'How you write dates inside timeline blocks. Separators "-", "/", "." or none are all accepted (e.g. 2026-10-21, 2026/10/21, 20261021, 202610; or 21/10/2026, 21102026, 211026 in day-first order). Write years 1–99 with four digits (0079-08-24).'],
      orderYmd: 'Year–month–day (YYYY-MM-DD, YYYYMMDD, YYYYMM)', orderDmy: 'Day–month–year (DD/MM/YYYY, DDMMYYYY, DDMMYY)', orderMdy: 'Month–day–year (MM/DD/YYYY, MMDDYYYY, MMDDYY)',
      pivot: ['Two-digit years', 'Two-digit years next to a month (19-03-04, 04/03/19) up to this number are read as 20xx, the rest as 19xx.'],
      dateFormat: ['Date format', 'How dates are written next to each item.'],
      dfCustom: 'Custom pattern',
      customFormat: ['Custom pattern', 'Tokens: YYYY, YY, MMM, MM, M, DD, D. Parts a date does not have are left out together with the separator next to them.'],
      dfLocalized: 'Localized (Jul 14, 1789 / 1789年7月14日)', dfIso: 'ISO (1789-07-14)',
      bce: ['Years before the common era', 'How negative years are labelled.'],
      bceAuto: 'Match language', bceBce: '490 BCE', bceBc: '490 BC', bceMinus: '-490', bceJa: '前490年',
      desc: ['Descriptions', 'Text after "|" in each line. Can be overridden per block with "> desc hover" or "> desc show".'],
      descShow: 'Always show', descHover: 'Show on hover only',
      link: ['Clickable items', 'Clicking an item opens its first link, a note with the same name, or the place in this note where it is mentioned.'],
      search: ['Fall back to this note', 'If an item has no link and no matching note, jump to the first mention of its name in the current note.'],
      switch: ['Layout switch', 'Show the Vertical / Horizontal and Cards / Scale buttons on each timeline.'],
      color: ['Period colors', 'Colors used for periods (items with a date range).'],
      colorOrder: ['Color order', 'Comma-separated order in which periods get colors. Available: blue, green, purple, orange, cyan, pink, yellow, red, gray. A single item can pick its own color with "#red" right after the date.'],
      frame: ['Whole item clickable when it has links', 'Off: if an item contains links, only those links are clickable. On: the item itself also opens its first link.'],
      colorTheme: 'Theme colors', colorMono: 'Monochrome',
      density: ['Density', 'Spacing between items. Can be overridden per block with "> density compact".'], dComfortable: 'Comfortable', dCompact: 'Compact',
      sort: ['Order', 'Order of items in a timeline.'], sortChrono: 'Chronological', sortWritten: 'As written',
      minWidth: ['Horizontal minimum width', 'Minimum width (px) of the horizontal axis before it scrolls.'],
      warnings: ['Show notes about unreadable lines', 'List lines that could not be read (or were adjusted) under the timeline.'],
    },
  },
  ja: {
    vertical: '縦', horizontal: '横', cards: 'カード', scale: '時間軸',
    verticalHint: '縦に並べる', horizontalHint: '横に並べる',
    cardsHint: '等間隔のカード(出来事向き)', scaleHint: '長さを時間に比例させる(期間向き)',
    open: t => `${t} を開く`, jump: 'このノート内の記述へ移動', go: '開く', close: '閉じる',
    present: '現在', today: '今日',
    months: null,
    warnTitle: n => `この年表について${n}件のお知らせ`,
    why: {
      date: '日付が読めない', syntax: '年表の行の形ではない', order: '終わりが始まりより前(入れ替えた)',
      option: '知らない指定', value: '指定の値が読めない', range: '開始・終了の範囲外(端に表示)',
      marker: '目印は1つの日付だけ(終わりは無視)', huge: '年が大きすぎて描けない',
    },
    lineNo: n => `${n}行目`,
    s: {
      language: ['言語', 'プラグインの表示と日付の言語。'],
      langAuto: 'Obsidianに合わせる', langEn: 'English', langJa: '日本語',
      orientation: ['既定の向き', '向きの行がないブロックに使う。各ブロックは切り替えボタンか「> 向き 横」で個別に変えられる。'],
      look: ['既定の見た目', 'カードは項目を等間隔に並べ、出来事向き。時間軸は長さを時間に比例させ、期間向き。「自動」は縦ならカード、横なら時間軸。各ブロックは「> 見た目 カード」「> 見た目 時間軸」で個別に変えられる。'],
      lookAuto: '自動',
      inputOrder: ['ブロック内の日付の順番', '年表ブロックに書く日付の並び。区切りは「-」「/」「.」なしのどれでもよい(例: 2026-10-21、2026/10/21、20261021、202610。日-月-年の順なら 21/10/2026、21102026、211026)。全角の数字や「～」も使える。紀元1〜99年は4桁で書く(0079-08-24)。'],
      orderYmd: '年-月-日(YYYY-MM-DD・YYYYMMDD・YYYYMM)', orderDmy: '日-月-年(DD/MM/YYYY・DDMMYYYY・DDMMYY)', orderMdy: '月-日-年(MM/DD/YYYY・MMDDYYYY・MMDDYY)',
      pivot: ['2桁の年', '月日と一緒に書いた2桁の年(19-03-04、04/03/19)は、この数以下なら20xx年、それより大きければ19xx年として読む。'],
      dateFormat: ['日付の書き方', '各項目の横に出す日付の形式。'],
      dfCustom: '自分で指定',
      customFormat: ['日付の書式', '使える記号: YYYY, YY, MMM, MM, M, DD, D。日付にない部分は、となりの区切りごと省く。'],
      dfLocalized: '言語に合わせる(1789年7月14日 / Jul 14, 1789)', dfIso: 'ISO(1789-07-14)',
      bce: ['紀元前の表記', '負の年の書き方。'],
      bceAuto: '言語に合わせる', bceBce: '490 BCE', bceBc: '490 BC', bceMinus: '-490', bceJa: '前490年',
      desc: ['説明', '各行の「|」の後ろの文。ブロックごとに「> 説明 ホバー」「> 説明 表示」で変えられる。'],
      descShow: '常に表示', descHover: 'マウスを載せたときだけ',
      link: ['項目をリンクにする', '項目をクリックすると、項目内の最初のリンク、同名のノート、このノート内の記述の順に開く。'],
      search: ['このノート内を探す', 'リンクも同名ノートもないとき、このノートで名前が最初に出てくる場所へ移動する。'],
      switch: ['切り替えボタン', '各年表に「縦/横」「カード/時間軸」のボタンを出す。'],
      color: ['期間の色', '期間(範囲のある項目)に使う色。'],
      colorOrder: ['色の順番', '期間に色を割り当てる順番(カンマ区切り)。使える色: blue, green, purple, orange, cyan, pink, yellow, red, gray。項目ごとに日付の直後へ「#red」と書けばその色になる。'],
      frame: ['リンクを含む項目も枠ごとクリック可能にする', 'オフ: 項目の中にリンクがあれば、そのリンクだけが押せる。オン: 枠を押しても最初のリンクを開く。'],
      colorTheme: 'テーマの色', colorMono: 'モノクロ',
      density: ['間隔', '項目同士の間隔。ブロックごとに「> 間隔 詰める」で変えられる。'], dComfortable: 'ゆったり', dCompact: '詰める',
      sort: ['並び順', '年表の中の並び。'], sortChrono: '日付順', sortWritten: '書いた順',
      minWidth: ['横の最小幅', '横の時間軸がスクロールに切り替わる最小の幅(px)。'],
      warnings: ['読めない行のお知らせを表示', '読めなかった行や調整した行を年表の下に出す。'],
    },
  },
};

function resolveLang(setting) {
  if (setting === 'en' || setting === 'ja') return setting;
  const loc = (moment && moment.locale && moment.locale()) || 'en';
  return loc.startsWith('ja') ? 'ja' : 'en';
}

const isPhone = () => (Platform.isPhone != null ? !!Platform.isPhone : (Platform.isMobile && window.innerWidth < 600));
const isTouch = () => !!Platform.isMobile;

/* ── calendar (pure arithmetic, proleptic Gregorian, any integer year) ── */

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = y => (isLeap(y) ? 366 : 365);
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const daysInMonth = (y, m) => (m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]);
function dayOfYear(y, m, d) {
  let n = d - 1;
  for (let i = 1; i < m; i++) n += daysInMonth(y, i);
  return n;
}
// a date as a fractional year, measured in real days
function toValue(y, m, d) {
  return y + dayOfYear(y, m || 1, d || 1) / daysInYear(y);
}
function fromValue(v) {
  const y = Math.floor(v);
  let n = Math.min(Math.round((v - y) * daysInYear(y)), daysInYear(y) - 1);
  let m = 1;
  while (n >= daysInMonth(y, m)) { n -= daysInMonth(y, m); m++; }
  return { year: y, month: m, day: n + 1 };
}
function addDays(date, n) {
  let { year: y, month: m, day: d } = date;
  d += n;
  while (d > daysInMonth(y, m)) { d -= daysInMonth(y, m); m++; if (m > 12) { m = 1; y++; } }
  return { year: y, month: m, day: d };
}
function makeDate(year, month, day) {
  return { year, month, day, value: toValue(year, month, day) };
}
function today() {
  const n = new Date();
  return makeDate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}
// the largest |year| we draw (values stay exact far beyond this, but labels become meaningless)
const MAX_YEAR = 1e12;

/* ── parsing ─────────────────────────────────────── */

// Input dates. The order of the parts is a setting (YMD, DMY or MDY); separators can be
// "-", "/", "." or none. Without separators the number of digits decides the shape:
//   YMD: YYYY, YYYYMM, YYYYMMDD     DMY: YYYY, DDMMYY, DDMMYYYY     MDY: YYYY, MMDDYY, MMDDYYYY
// (month + year in day-first or month-first order needs a separator: 10/2026)
// A leading "-" marks a year before the common era; without separators it is always a bare year
// (-66000000). Two-digit years next to a month follow the two-digit-year setting; write years
// 1–99 with four digits (0079-08-24). A bare number is always a literal year.
function expandYear(text, pivot) {
  if (text.length !== 2) return parseInt(text, 10);
  const n = parseInt(text, 10);
  return n <= pivot ? 2000 + n : 1900 + n;
}

function parseDate(text, opts = { order: 'ymd', pivot: 49 }) {
  const raw = text.trim();
  if (!raw) return null;
  const order = opts.order || 'ymd';
  const pivot = opts.pivot == null ? 49 : opts.pivot;
  let y = null, mo = null, d = null;

  const neg = raw.startsWith('-');
  const body = neg ? raw.slice(1) : raw;
  let parts;
  if (/[-/.]/.test(body)) {
    parts = body.split(/[-/.]/);
    if (parts.some(p => !/^\d+$/.test(p)) || parts.length > 3) return null;
  } else if (/^\d+$/.test(body)) {
    const n = body.length;
    if (n <= 4 || neg) parts = [body];
    else if (order === 'ymd') {
      if (n === 6) parts = [body.slice(0, 4), body.slice(4)];
      else if (n === 8) parts = [body.slice(0, 4), body.slice(4, 6), body.slice(6)];
      else parts = [body];
    } else {
      if (n === 6 || n === 8) parts = [body.slice(0, 2), body.slice(2, 4), body.slice(4)];
      else parts = [body];
    }
  } else return null;

  if (parts.length === 1) y = parseInt(parts[0], 10);
  else if (order === 'ymd') {
    y = neg ? parseInt(parts[0], 10) : expandYear(parts[0], pivot);
    mo = parseInt(parts[1], 10); d = parts[2] ? parseInt(parts[2], 10) : null;
  } else if (parts.length === 2) {           // month + year
    mo = parseInt(parts[0], 10); y = expandYear(parts[1], pivot);
  } else if (order === 'dmy') {
    d = parseInt(parts[0], 10); mo = parseInt(parts[1], 10); y = expandYear(parts[2], pivot);
  } else {
    mo = parseInt(parts[0], 10); d = parseInt(parts[1], 10); y = expandYear(parts[2], pivot);
  }
  if (neg) y = -y;
  if (!isFinite(y)) return null;
  if (mo != null && (mo < 1 || mo > 12)) return null;
  if (d != null && (d < 1 || d > daysInMonth(y, mo))) return null;
  return makeDate(y, mo, d);
}

// split "name | description" at the first "|" that is not inside [[...]]
function splitNameDesc(rest) {
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    if (rest.startsWith('[[', i)) { depth++; i++; }
    else if (rest.startsWith(']]', i)) { depth = Math.max(0, depth - 1); i++; }
    else if (rest[i] === '|' && depth === 0) return [rest.slice(0, i).trim(), rest.slice(i + 1).trim()];
  }
  return [rest.trim(), ''];
}

// full-width characters people type with a Japanese IME, normalised in the sigil/date part only
const WIDE = { '［': '[', '］': ']', '～': '~', '〜': '~', '－': '-', '／': '/', '．': '.', '＠': '@', '＝': '=', '＊': '*', '＃': '#', '　': ' ' };
function normalizeHead(line) {
  const close = line.search(/[\]］]/);
  if (close < 0) return line;
  const head = line.slice(0, close + 1).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[［］～〜－／．＠＝＊＃　]/g, c => WIDE[c]);
  return head + line.slice(close + 1);
}

const OPTION_LINE = /^\s*>\s*(\S+)/;
const FLAG_KEYS = new Set(['orientation', '向き', 'look', '見た目', 'style']);
const OPTION_ALIASES = {
  orientation: 'orientation', 向き: 'orientation',
  look: 'look', 見た目: 'look',
  style: 'style',
  title: 'title', タイトル: 'title',
  start: 'start', 開始: 'start',
  end: 'end', 終了: 'end',
  today: 'today', 今日: 'today',
  density: 'density', 間隔: 'density',
  desc: 'desc', 説明: 'desc',
  height: 'height', 高さ: 'height',
  orderby: 'orderby',
};
const JA_KEYS = new Set(['向き', '見た目', 'タイトル', '開始', '終了', '今日', '間隔', '説明', '高さ']);

function pick(value, table) {
  const v = (value || '').trim().toLowerCase();
  for (const [result, words] of Object.entries(table)) if (words.includes(v)) return result;
  return null;
}

function parseBlock(source, sortOrder, dateOpts) {
  const items = [];
  const options = {};
  const optionLine = {};
  const warnings = [];
  let optionLang = null;
  source.split('\n').forEach((raw, index) => {
    const lineNo = index + 1;
    const line = normalizeHead(raw.trim());
    if (!line || line.startsWith('#')) return;
    if (line.startsWith('>')) {
      const [keyRaw, ...value] = line.slice(1).trim().split(/\s+/);
      const key = OPTION_ALIASES[keyRaw] || OPTION_ALIASES[keyRaw.toLowerCase()];
      if (!key) { warnings.push({ lineNo, text: raw.trim(), why: 'option' }); return; }
      if (!optionLang && key !== 'style') optionLang = JA_KEYS.has(keyRaw) ? 'ja' : 'en';
      options[key] = value.join(' ').trim();
      optionLine[key] = { lineNo, text: raw.trim() };
      return;
    }
    const m = line.match(/^([-@=*])\s*\[([^\]]*)\]\s*(.*)$/);
    if (!m) { warnings.push({ lineNo, text: raw.trim(), why: 'syntax' }); return; }
    const [, sigil, dates, restRaw] = m;
    // "#color" right after the date picks a color; any other "#word" stays part of the name
    let color = null;
    let rest = restRaw;
    const colorMatch = restRaw.match(/^#(\w+)\s+/);
    if (colorMatch && COLORS.includes(colorMatch[1].toLowerCase())) {
      color = colorMatch[1].toLowerCase();
      rest = restRaw.slice(colorMatch[0].length);
    }
    rest = rest.replace(/^\{[^}]*\}\s*/, '');
    const [name, desc] = splitNameDesc(rest);
    const tilde = dates.indexOf('~');
    const a = tilde >= 0 ? dates.slice(0, tilde) : dates;
    let b = tilde >= 0 ? dates.slice(tilde + 1) : null;
    const kind = sigil === '@' ? 'period' : sigil === '=' ? 'marker' : 'event';
    if (kind === 'marker' && b != null) { warnings.push({ lineNo, text: raw.trim(), why: 'marker' }); b = null; }
    let start = parseDate(a, dateOpts);
    let end = null;
    let openEnd = false;
    if (b != null) {
      if (!b.trim()) { openEnd = true; end = today(); }
      else end = parseDate(b, dateOpts);
    }
    if (!start || (b != null && !openEnd && !end)) { warnings.push({ lineNo, text: raw.trim(), why: 'date' }); return; }
    if (Math.abs(start.year) > MAX_YEAR || (end && Math.abs(end.year) > MAX_YEAR)) { warnings.push({ lineNo, text: raw.trim(), why: 'huge' }); return; }
    if (end && end.value < start.value) {
      if (openEnd) end = start;
      else { [start, end] = [end, start]; warnings.push({ lineNo, text: raw.trim(), why: 'order' }); }
    }
    items.push({ kind, start, end, openEnd, name, desc, color, lineNo, text: raw.trim() });
  });
  if (sortOrder !== 'written') items.sort((x, y) => x.start.value - y.start.value);

  // option values: anything unreadable is reported instead of silently ignored
  const bad = key => warnings.push({ lineNo: optionLine[key].lineNo, text: optionLine[key].text, why: 'value' });
  const read = (key, table) => {
    if (!(key in options)) return null;
    const v = pick(options[key], table);
    if (!v) bad(key);
    return v;
  };
  let orientation = read('orientation', { horizontal: ['horizontal', 'h', '横'], vertical: ['vertical', 'v', '縦'] });
  let look = read('look', { cards: ['cards', 'card', 'カード'], scale: ['scale', 'axis', '時間軸'] });
  if ('style' in options) {
    if (options.style.toLowerCase() === 'axis') { orientation = 'horizontal'; look = 'scale'; }
    else bad('style');
  }
  const density = read('density', { compact: ['compact', '詰める'], comfortable: ['comfortable', 'ゆったり'] });
  const desc = read('desc', { hover: ['hover', 'ホバー'], show: ['show', '表示'] });
  const range = { start: null, end: null };
  for (const key of ['start', 'end']) {
    if (!(key in options)) continue;
    range[key] = parseDate(options[key], dateOpts);
    if (!range[key]) bad(key);
  }
  if (range.start && range.end && range.end.value < range.start.value) [range.start, range.end] = [range.end, range.start];
  let height = 0;
  if ('height' in options) {
    height = parseInt(options.height, 10) || 0;
    if (!height) bad('height');
  }
  if (range.start || range.end) {
    const lo = range.start ? range.start.value : -Infinity;
    const hi = range.end ? range.end.value : Infinity;
    for (const it of items) {
      const e = (it.end || it.start).value;
      if (it.start.value < lo || e > hi) warnings.push({ lineNo: it.lineNo, text: it.text, why: 'range' });
    }
  }
  warnings.sort((a, b) => a.lineNo - b.lineNo);
  return {
    items, options, warnings, orientation, look, density, desc, range, height, optionLang,
    title: options.title || '',
    today: 'today' in options,
  };
}

/* ── formatting ──────────────────────────────────── */

const group3 = n => (Math.abs(n) >= 10000 ? n.toLocaleString('en-US') : String(n));

class Formatter {
  constructor(settings) {
    this.lang = resolveLang(settings.language);
    this.t = STRINGS[this.lang];
    this.iso = settings.dateFormat === 'iso';
    this.custom = settings.dateFormat === 'custom' ? (settings.customDateFormat || 'YYYY-MM-DD') : null;
    this.bce = settings.bceStyle === 'auto' ? (this.lang === 'ja' ? 'ja' : 'bce') : settings.bceStyle;
  }
  monthName(m) {
    return this.lang === 'ja' ? `${m}月` : this.t.months[m - 1];
  }
  year(y) {
    if (y >= 0) return this.lang === 'ja' && !this.iso ? `${group3(y)}年` : group3(y);
    const n = group3(-y);
    switch (this.bce) {
      case 'ja': return `前${n}年`;
      case 'bc': return `${n} BC`;
      case 'minus': return `-${n}`;
      default: return `${n} BCE`;
    }
  }
  // wrap a date written with a bare year number in the chosen BCE marker
  bceWrap(text, y) {
    if (y >= 0) return text;
    switch (this.bce) {
      case 'ja': return `前${text}`;
      case 'bc': return `${text} BC`;
      case 'minus': return `-${text}`;
      default: return `${text} BCE`;
    }
  }
  customDate(d) {
    const pad = n => String(n).padStart(2, '0');
    // split the pattern into tokens and the literal text between them
    const parts = [];
    const re = /YYYY|YY|MMMM|MMM|MM|M|DD|D/g;
    let last = 0;
    let m;
    while ((m = re.exec(this.custom))) {
      if (m.index > last) parts.push({ lit: this.custom.slice(last, m.index) });
      parts.push({ tok: m[0] });
      last = m.index + m[0].length;
    }
    if (last < this.custom.length) parts.push({ lit: this.custom.slice(last) });
    const has = tok => (tok[0] === 'Y' ? true : tok[0] === 'M' ? !!d.month : !!d.day);
    // drop missing parts with the separator after them (or before them when they come last)
    const keep = parts.map(() => true);
    parts.forEach((p, i) => {
      if (!p.tok || has(p.tok)) return;
      keep[i] = false;
      const after = parts[i + 1] && parts[i + 1].lit != null ? i + 1 : -1;
      const before = parts[i - 1] && parts[i - 1].lit != null ? i - 1 : -1;
      const isUnit = j => j >= 0 && /[^\s\-/.,:]/.test(parts[j].lit); // 年, 月, 日 … belong to their number
      const laterToken = parts.slice(i + 2).some(q => q.tok && has(q.tok));
      if (after >= 0 && (isUnit(after) || laterToken)) keep[after] = false;
      else if (before >= 0 && !isUnit(before)) keep[before] = false;
    });
    const n = Math.abs(d.year);
    // "前" and "-" go right before the year; BCE/BC follow the whole date
    const yearPrefix = d.year < 0 && (this.bce === 'ja' || this.bce === 'minus') ? (this.bce === 'ja' ? '前' : '-') : '';
    const out = parts.filter((p, i) => keep[i]).map(p => {
      if (p.lit != null) return p.lit;
      switch (p.tok) {
        case 'YYYY': return yearPrefix + String(n);
        case 'YY': return yearPrefix + pad(n % 100);
        case 'MMMM': case 'MMM': return this.monthName(d.month);
        case 'MM': return pad(d.month);
        case 'M': return String(d.month);
        case 'DD': return pad(d.day);
        default: return String(d.day);
      }
    }).join('');
    return yearPrefix ? out : this.bceWrap(out, d.year);
  }
  date(d) {
    const pad = n => String(n).padStart(2, '0');
    if (this.custom) return this.customDate(d);
    if (this.iso) {
      // ISO-like: negative years keep their sign (-0490-07-14)
      const y = d.year < 0 ? `-${String(-d.year).padStart(4, '0')}` : String(d.year).padStart(4, '0');
      return [y, d.month && pad(d.month), d.day && pad(d.day)].filter(Boolean).join('-');
    }
    if (this.lang === 'ja') return this.year(d.year) + (d.month ? `${d.month}月` : '') + (d.day ? `${d.day}日` : '');
    const mon = d.month ? this.t.months[d.month - 1] : '';
    if (d.day) return `${mon} ${d.day}, ${this.year(d.year)}`;
    if (d.month) return `${mon} ${this.year(d.year)}`;
    return this.year(d.year);
  }
  endText(item) {
    return item.openEnd ? this.t.present : this.date(item.end);
  }
  range(item) {
    const a = item.start;
    const b = item.end;
    if (!b) return this.date(a);
    const sep = this.lang === 'ja' ? '〜' : ' – ';
    if (item.openEnd) return this.date(a) + sep + this.t.present;
    if (!this.iso && !this.custom && this.lang === 'ja' && a.year === b.year && a.year >= 0 && a.month && b.month) {
      return `${this.date(a)}〜${b.month}月${b.day ? b.day + '日' : ''}`;
    }
    return this.date(a) + sep + this.date(b);
  }
  // labels on the axis; showYear marks the first tick and year changes
  tick(t, showYear) {
    const ja = this.lang === 'ja';
    if (t.unit === 'year') return t.year === 0 ? '' : this.year(t.year); // there is no year 0
    const yr = this.year(t.year);
    if (t.unit === 'month') {
      if (ja) return showYear ? `${yr}${t.month}月` : `${t.month}月`;
      return showYear ? `${this.t.months[t.month - 1]} ${yr}` : this.t.months[t.month - 1];
    }
    if (ja) return showYear ? `${yr}${t.month}月${t.day}日` : `${t.month}月${t.day}日`;
    return showYear ? `${this.t.months[t.month - 1]} ${t.day}, ${yr}` : `${this.t.months[t.month - 1]} ${t.day}`;
  }
}

/* ── axis ticks ──────────────────────────────────── */

// Pick a calendar-aware step (days, months or years) for about `count` ticks. The drawn range
// extends half a step past the data at most, and ticks are kept inside it.
const SUB_YEAR_UNITS = [
  ['day', 1, 1 / 365.25], ['day', 2, 2 / 365.25], ['day', 7, 7 / 365.25], ['day', 14, 14 / 365.25],
  ['month', 1, 1 / 12], ['month', 2, 2 / 12], ['month', 3, 3 / 12], ['month', 6, 6 / 12],
];

function buildTicks(min, max, count) {
  if (!(max > min)) { min -= 1 / 24; max += 1 / 24; }
  const rough = (max - min) / Math.max(count, 1);
  const all = [];
  let stepSize;
  const sub = rough < 1 ? SUB_YEAR_UNITS.find(([, , size]) => size >= rough) : null;
  if (sub) {
    const [unit, n, size] = sub;
    stepSize = size;
    const s = fromValue(min - size);
    let cur = unit === 'month' ? { year: s.year, month: Math.floor((s.month - 1) / n) * n + 1, day: 1 } : s;
    for (let guard = 0; guard < 600; guard++) {
      const value = toValue(cur.year, cur.month, cur.day);
      all.push({ unit, value, year: cur.year, month: cur.month, day: cur.day });
      if (value > max + size) break;
      if (unit === 'month') {
        let m = cur.month + n;
        let y = cur.year;
        while (m > 12) { m -= 12; y++; }
        cur = { year: y, month: m, day: 1 };
      } else cur = addDays(cur, n);
    }
  } else {
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
    const step = [1, 2, 5, 10].map(k => k * mag).find(x => x >= rough) || mag * 10;
    stepSize = step;
    const first = Math.floor(min / step) * step;
    for (let v = first, guard = 0; guard < 600 && v <= max + step; v += step, guard++) all.push({ unit: 'year', value: v, year: v });
  }
  // half a step of air at each end, snapped to a tick when one is close
  let lo = min - stepSize / 2;
  let hi = max + stepSize / 2;
  const below = all.filter(t => t.value <= min).pop();
  const above = all.find(t => t.value >= max);
  if (below && below.value >= lo) lo = below.value;
  if (above && above.value <= hi) hi = above.value;
  const ticks = all.filter(t => t.value >= lo - 1e-9 && t.value <= hi + 1e-9);
  return { min: lo, max: hi, ticks };
}

function tickLabels(ticks, fmt) {
  let lastYear = null;
  return ticks.map((t, i) => {
    const showYear = t.unit !== 'year' && (i === 0 || t.year !== lastYear);
    lastYear = t.year;
    return fmt.tick(t, showYear);
  });
}

function dataRange(data) {
  let min = Infinity;
  let max = -Infinity;
  for (const it of data.items) {
    min = Math.min(min, it.start.value);
    max = Math.max(max, (it.end || it.start).value);
  }
  if (data.range.start) min = data.range.start.value;
  if (data.range.end) max = data.range.end.value;
  if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
  return { min, max };
}

// where an item sits inside a fixed range; parts outside are folded to the edge
function clampItem(item, min, max) {
  const s = item.start.value;
  const e = (item.end || item.start).value;
  return {
    s: Math.min(Math.max(s, min), max),
    e: Math.min(Math.max(e, min), max),
    cutStart: s < min,
    cutEnd: e > max,
  };
}

const plainText = s => s
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

/* ── rendering helpers ───────────────────────────── */

// render inline Markdown; resolves once Obsidian has finished (render can be asynchronous)
async function renderInline(plugin, el, text, sourcePath, owner) {
  if (!text) return;
  await MarkdownRenderer.render(plugin.app, text, el, sourcePath, owner);
  const p = el.querySelector(':scope > p');
  if (p && el.children.length === 1) {
    while (p.firstChild) el.appendChild(p.firstChild);
    p.remove();
  }
}

// a small floating note for descriptions on devices with a pointer; placed beside the item
function attachTip(el, text, owner) {
  if (!text || isTouch()) return;
  let tip = null;
  const show = () => {
    if (tip) return;
    tip = document.body.createDiv({ cls: 'ptl-tip' });
    tip.setText(text);
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.right + 8;
    let top = r.top + r.height / 2 - tr.height / 2;
    if (left + tr.width > window.innerWidth - 8) left = r.left - tr.width - 8;
    if (left < 8) { left = Math.min(Math.max(8, r.left), window.innerWidth - tr.width - 8); top = r.bottom + 6; }
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };
  const hide = () => { if (tip) { tip.remove(); tip = null; } };
  el.addEventListener('mouseenter', show);
  el.addEventListener('mouseleave', hide);
  el.addEventListener('focus', show);
  el.addEventListener('blur', hide);
  owner.register(hide);
}

// make an item clickable: first link in the item → note with the same name → mention in this note
function attachLink(plugin, el, item, ctx, fmt, owner) {
  const s = plugin.settings;
  if (!s.linkItems) return null;
  const app = plugin.app;
  const text = `${item.name} ${item.desc}`;
  const m = text.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|\[[^\]]*\]\(([^)\s]+)\)/);
  const name = plainText(item.name).replace(/[(（].*$/, '').trim();
  let target = null;
  if (m && !s.frameLinkWithInnerLinks) {
    el.addClass('ptl-has-links');
    return null;
  }
  if (m && m[1]) target = { link: m[1] };
  else if (m && m[2]) {
    let dest = m[2];
    try { dest = decodeURI(dest); } catch (e) { /* keep as written */ }
    target = /^[a-z][\w+.-]*:/i.test(dest) ? { url: dest } : { link: dest.replace(/\.md(?=#|$)/, '') };
  } else if (name && app.metadataCache.getFirstLinkpathDest(name, ctx.sourcePath)) target = { link: name };
  else if (name && s.searchInNote) target = { search: name };
  if (!target) return null;

  el.addClass('ptl-linked');
  el.setAttr('role', 'link');
  el.setAttr('tabindex', '0');
  const hint = target.url ? fmt.t.open(target.url) : target.link ? fmt.t.open(target.link) : fmt.t.jump;
  if (!item.desc) el.setAttr('title', hint);
  el.setAttr('aria-label', item.desc ? `${plainText(item.name)} — ${plainText(item.desc)}` : hint);
  const go = async newTab => {
    if (target.url) { window.open(target.url); return; }
    if (target.link) { app.workspace.openLinkText(target.link, ctx.sourcePath, newTab); return; }
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!file) return;
    const lines = (await app.vault.cachedRead(file)).split('\n');
    const keys = [target.search, target.search.slice(0, 6)].filter(k => k.length >= 2);
    let found = -1;
    for (const key of keys) {
      let inFence = false;
      for (let i = 0; i < lines.length && found < 0; i++) {
        if (/^\s*```/.test(lines[i])) { inFence = !inFence; continue; }
        if (!inFence && lines[i].includes(key)) found = i;
      }
      if (found >= 0) break;
    }
    if (found < 0) return;
    const leaf = newTab ? app.workspace.getLeaf('tab') : app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { line: found } });
  };
  if (!el.hasClass('ptl-tap-detail')) {
    el.addEventListener('click', evt => {
      if (evt.target.closest('a')) return;
      evt.preventDefault();
      go(evt.metaKey || evt.ctrlKey);
    });
  }
  el.addEventListener('keydown', evt => {
    if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); go(evt.metaKey || evt.ctrlKey); }
  });
  // Obsidian's page preview on hover (Ctrl/⌘ + hover, depending on the user's settings)
  if (target.link && owner) {
    el.addEventListener('mouseover', evt => {
      app.workspace.trigger('hover-link', {
        event: evt, source: 'preview', hoverParent: owner, targetEl: el, linktext: target.link, sourcePath: ctx.sourcePath,
      });
    });
  }
  return go;
}

// an explicit "#color" on the item wins; otherwise follow the configured order
function colorFor(plugin, item, index) {
  const s = plugin.settings;
  if (s.colorMode === 'mono') return 'mono';
  if (item.color) return item.color;
  const order = s.colorOrder.split(/[,\s]+/).map(c => c.trim().toLowerCase()).filter(c => COLORS.includes(c));
  const list = order.length ? order : COLORS;
  return list[index % list.length];
}

// fade the edge of a horizontally scrolling area while there is more to see
function addScrollFade(scroller, owner) {
  scroller.addClass('ptl-fade');
  const update = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    scroller.toggleClass('can-left', scroller.scrollLeft > 2);
    scroller.toggleClass('can-right', scroller.scrollLeft < max - 2);
  };
  scroller.addEventListener('scroll', update, { passive: true });
  observe(scroller, update, owner);
  requestAnimationFrame(update);
}

// run fn now (after layout) and whenever el changes size, until the owner is unloaded
function observe(el, fn, owner) {
  const observer = new ResizeObserver(() => fn());
  observer.observe(el);
  owner.register(() => observer.disconnect());
}

/* ── vertical cards: events first, periods shown as bands in the gutter ── */

function renderCardsVertical(plugin, root, data, ctx, owner, fmt, pending) {
  const wrap = root.createDiv({ cls: 'ptl ptl-vertical' });
  const gutter = wrap.createDiv({ cls: 'ptl-v-gutter' });
  const list = wrap.createDiv({ cls: 'ptl-v-list' });
  const rows = [];
  const periods = [];
  const oneLine = isPhone();

  for (const item of data.items) {
    if (item.kind === 'marker') {
      const marker = list.createDiv({ cls: 'ptl-v-marker' });
      marker.createSpan({ text: `${fmt.date(item.start)}  ${plainText(item.name)}` });
      rows.push({ item, el: marker });
      continue;
    }
    const row = list.createDiv({ cls: 'ptl-v-row' });
    if (item.end) row.addClass('is-span');
    const dateEl = row.createDiv({ cls: 'ptl-v-date' });
    if (item.end && !oneLine) {
      // start and end on their own lines so ranges never wrap mid-date
      dateEl.createDiv({ text: fmt.date(item.start) + (fmt.lang === 'ja' ? '〜' : ' –') });
      dateEl.createDiv({ text: fmt.endText(item) });
    } else dateEl.setText(fmt.range(item));
    row.createDiv({ cls: 'ptl-v-node' });
    const body = row.createDiv({ cls: 'ptl-v-body' });
    pending.push(renderInline(plugin, body.createDiv({ cls: 'ptl-v-title' }), item.name, ctx.sourcePath, owner));
    if (item.desc) pending.push(renderInline(plugin, body.createDiv({ cls: 'ptl-v-desc' }), item.desc, ctx.sourcePath, owner));
    attachLink(plugin, row, item, ctx, fmt, owner);
    if (!item.end && item.color) row.addClass('ptl-c-' + item.color, 'has-color');
    rows.push({ item, el: row });
    if (item.end) {
      const color = colorFor(plugin, item, periods.length);
      row.addClass('ptl-c-' + color);
      periods.push({ item, row, color });
    }
  }
  if (!periods.length) return wrap;

  const drawBands = () => {
    gutter.empty();
    const top0 = list.getBoundingClientRect().top;
    // measure every band first, then pack them top to bottom (works for any item order)
    const bands = periods.map(p => {
      const inside = rows.filter(r => r.item.start.value >= p.item.start.value && r.item.start.value <= p.item.end.value);
      const rects = [p.row, ...inside.map(r => r.el)].map(e => e.getBoundingClientRect());
      return {
        p,
        top: Math.min(...rects.map(r => r.top)) - top0 + 6,
        bottom: Math.max(...rects.map(r => r.bottom)) - top0 - 6,
      };
    }).sort((a, b) => a.top - b.top);
    const laneEnds = [];
    for (const b of bands) {
      let lane = laneEnds.findIndex(end => end < b.top - 2);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = b.bottom;
      const band = gutter.createDiv({ cls: 'ptl-v-band ptl-c-' + b.p.color });
      band.style.top = `${b.top}px`;
      band.style.height = `${Math.max(b.bottom - b.top, 10)}px`;
      band.style.left = `${lane * 7}px`;
      band.setAttr('aria-label', `${fmt.range(b.p.item)} ${plainText(b.p.item.name)}`);
    }
    gutter.style.width = `${laneEnds.length * 7}px`;
  };
  Promise.all(pending).then(() => requestAnimationFrame(drawBands));
  observe(list, drawBands, owner);
  return wrap;
}

/* ── horizontal scale: periods below the axis, events above it ── */

function renderScaleHorizontal(plugin, root, data, ctx, owner, fmt, pending) {
  const items = data.items;
  if (!items.length) return null;
  const raw = dataRange(data);
  const fixed = !!(data.range.start || data.range.end);

  const outer = root.createDiv({ cls: 'ptl ptl-horizontal' });
  const canvas = outer.createDiv({ cls: 'ptl-h-canvas' });
  const above = canvas.createDiv({ cls: 'ptl-h-above' });
  const axis = canvas.createDiv({ cls: 'ptl-h-axis' });
  const below = canvas.createDiv({ cls: 'ptl-h-below' });
  const touch = isTouch();
  const showDesc = plugin.settings.descriptions !== 'hover';

  const placed = [];
  let periodIndex = 0;
  for (const item of items) {
    const isSpan = !!item.end;
    const el = (isSpan ? below : above).createDiv({ cls: isSpan ? 'ptl-h-span' : 'ptl-h-point' });
    if (item.kind === 'marker') el.addClass('is-marker');
    let color = null;
    if (isSpan) color = colorFor(plugin, item, periodIndex++);
    else if (item.color) { color = item.color; el.addClass('has-color'); }
    if (color) el.addClass('ptl-c-' + color);
    if (item.openEnd) el.addClass('is-open');
    pending.push(renderInline(plugin, el.createDiv({ cls: 'ptl-h-label' }), `${fmt.range(item)}  ${item.name}`, ctx.sourcePath, owner));
    if (touch) el.addClass('ptl-tap-detail');
    const go = attachLink(plugin, el, item, ctx, fmt, owner);
    // descriptions: a floating note on hover (pointer), or the detail panel on tap (touch)
    if (item.desc) {
      el.addClass('has-desc');
      attachTip(el, plainText(item.desc), owner);
    }
    if (touch) el.addEventListener('click', evt => {
      if (evt.target.closest('a')) return;
      canvas.querySelectorAll('.is-selected').forEach(n => n.removeClass('is-selected'));
      el.addClass('is-selected');
      showDetail(plugin, root, item, go, fmt, ctx, owner);
    });
    placed.push({ item, el, isSpan, color, stem: isSpan ? null : above.createDiv({ cls: 'ptl-h-stem' }) });
  }
  // with "always show", list the descriptions under the axis, each tied to its item by a dot
  if (showDesc && items.some(it => it.desc)) {
    const legend = root.createDiv({ cls: 'ptl-h-legend' });
    for (const p of placed.filter(q => q.item.desc)) {
      const row = legend.createDiv({ cls: 'ptl-h-legend-row' });
      const name = row.createSpan({ cls: 'ptl-h-legend-name' });
      const dot = name.createSpan({ cls: 'ptl-h-legend-dot' + (p.isSpan ? ' is-span' : '') });
      if (p.color) dot.addClass('ptl-c-' + p.color);
      name.createSpan({ text: plainText(p.item.name) });
      pending.push(renderInline(plugin, row.createSpan({ cls: 'ptl-h-legend-desc' }), p.item.desc, ctx.sourcePath, owner));
    }
  }

  const compact = plugin.settings.density === 'compact';
  const LANE = touch ? (compact ? 28 : 34) : (compact ? 22 : 26);
  const layout = () => {
    if (!outer.clientWidth) return; // hidden: wait for the next resize
    const width = Math.max(outer.clientWidth - 40, Math.min(items.length * 46, 2400), plugin.settings.horizontalMinWidth);
    // fewer ticks when their labels are long (huge years, day labels)
    let axisInfo = buildTicks(raw.min, raw.max, Math.max(3, Math.round(width / 110)));
    const longest = Math.max(...tickLabels(axisInfo.ticks, fmt).map(l => l.length));
    const fit = Math.max(2, Math.floor(width / (longest * 7 + 24)));
    if (fit < axisInfo.ticks.length - 1) axisInfo = buildTicks(raw.min, raw.max, fit);
    const min = fixed && data.range.start ? raw.min : axisInfo.min;
    const max = fixed && data.range.end ? raw.max : axisInfo.max;
    const x = v => ((v - min) / (max - min)) * width;
    let right = width;
    const pack = (group, side) => {
      const laneEnds = [];
      const laneFor = from => {
        const i = laneEnds.findIndex(end => end <= from - 6);
        return i < 0 ? laneEnds.length : i;
      };
      group.sort((a, b) => a.item.start.value - b.item.start.value);
      for (const p of group) {
        const c = clampItem(p.item, min, max);
        p.el.toggleClass('is-cut-start', c.cutStart);
        p.el.toggleClass('is-cut-end', c.cutEnd);
        const left = x(c.s);
        const bar = p.isSpan ? Math.max(x(c.e) - left, 4) : 0;
        p.el.style.width = p.isSpan ? `${bar}px` : '';
        const labelW = p.el.querySelector('.ptl-h-label').scrollWidth + 14;
        const need = Math.max(bar, labelW);
        p.el.toggleClass('is-overflow', p.isSpan && labelW > bar);
        // points hang their label to the left near the right edge, or when it keeps the stack lower
        const normalLane = laneFor(left);
        const canFlip = !p.isSpan && left - need >= 0;
        const flipLane = canFlip ? laneFor(left - need + 5) : Infinity;
        const flip = canFlip && (flipLane < normalLane || left + need > width);
        const from = flip ? left - need + 5 : left;
        const lane = flip ? flipLane : normalLane;
        if (lane === laneEnds.length) laneEnds.push(0);
        laneEnds[lane] = from + need;
        right = Math.max(right, from + need);
        p.el.toggleClass('is-flipped', flip);
        p.el.style.left = `${flip ? left - need + 5 : left}px`;
        if (flip) p.el.style.width = `${need}px`;
        p.el.style[side === 'above' ? 'bottom' : 'top'] = `${lane * LANE + (side === 'above' ? 6 : 4)}px`;
        if (p.stem) {
          p.stem.style.left = `${left}px`;
          p.stem.style.height = `${lane * LANE + 10}px`;
        }
      }
      return laneEnds.length;
    };
    const nAbove = pack(placed.filter(p => !p.isSpan), 'above');
    const nBelow = pack(placed.filter(p => p.isSpan), 'below');
    above.style.height = `${nAbove ? nAbove * LANE + 6 : 0}px`;
    below.style.height = `${nBelow ? nBelow * LANE + 6 : 0}px`;
    canvas.style.width = `${right + 16}px`;

    axis.empty();
    const ticks = axisInfo.ticks.filter(t => t.value >= min - 1e-9 && t.value <= max + 1e-9);
    const labels = tickLabels(ticks, fmt);
    ticks.forEach((t, i) => {
      const tick = axis.createDiv({ cls: 'ptl-h-tick' });
      tick.style.left = `${x(t.value)}px`;
      tick.setText(labels[i]);
    });
  };
  Promise.all(pending).then(() => requestAnimationFrame(layout));
  observe(outer, layout, owner);
  addScrollFade(outer, owner);
  return outer;
}

/* ── horizontal cards: evenly spaced nodes on a line, cards alternating above and below ── */
// Every cell is a direct child of one grid (no subgrid), so rows line up on older engines too.

function renderCardsHorizontal(plugin, root, data, ctx, owner, fmt, pending) {
  const outer = root.createDiv({ cls: 'ptl ptl-cards-h' });
  const track = outer.createDiv({ cls: 'ptl-ch-track' });
  let periodIndex = 0;
  const count = data.items.length;
  data.items.forEach((item, i) => {
    const side = i % 2 ? 'is-below' : 'is-above';
    const cls = [side];
    if (item.end) cls.push('is-span', 'ptl-c-' + colorFor(plugin, item, periodIndex++));
    else if (item.color) cls.push('has-color', 'ptl-c-' + item.color);
    if (item.kind === 'marker') cls.push('is-marker');
    const place = (el, row) => { el.style.gridColumn = String(i + 1); el.style.gridRow = String(row); };

    const card = track.createDiv({ cls: ['ptl-ch-card', ...cls].join(' ') });
    pending.push(renderInline(plugin, card.createDiv({ cls: 'ptl-ch-title' }), item.name, ctx.sourcePath, owner));
    if (item.desc) pending.push(renderInline(plugin, card.createDiv({ cls: 'ptl-ch-desc' }), item.desc, ctx.sourcePath, owner));
    const date = track.createDiv({ cls: ['ptl-ch-date', ...cls].join(' '), text: fmt.range(item) });
    const node = track.createDiv({ cls: ['ptl-ch-node', ...cls].join(' ') });
    if (i === 0) node.addClass('is-first');
    if (i === count - 1) node.addClass('is-last');
    node.createDiv({ cls: 'ptl-ch-dot' });
    if (side === 'is-above') { place(card, 1); place(date, 2); place(node, 3); }
    else { place(node, 3); place(date, 4); place(card, 5); }
    attachLink(plugin, card, item, ctx, fmt, owner);
  });
  addScrollFade(outer, owner);
  return outer;
}

/* ── vertical scale: a time axis running down the page; periods as columns ── */
// Labels are measured after they are rendered, so wrapped (two-line) labels never overlap,
// and everything is laid out again whenever the width changes.

function renderScaleVertical(plugin, root, data, ctx, owner, fmt, pending) {
  const items = data.items;
  if (!items.length) return null;
  const raw = dataRange(data);
  const fixed = !!(data.range.start || data.range.end);
  const showDesc = plugin.settings.descriptions !== 'hover';

  const outer = root.createDiv({ cls: 'ptl ptl-scale-v' });
  const canvas = outer.createDiv({ cls: 'ptl-sv-canvas' });
  const axis = canvas.createDiv({ cls: 'ptl-sv-axis' });
  const cols = canvas.createDiv({ cls: 'ptl-sv-cols' });
  const labelsEl = canvas.createDiv({ cls: 'ptl-sv-labels' });

  // periods get their colors in date order
  let periodIndex = 0;
  const colorOf = new Map();
  for (const item of items.filter(it => it.end).sort((a, b) => a.start.value - b.start.value)) {
    colorOf.set(item, colorFor(plugin, item, periodIndex++));
  }
  const bars = new Map();
  for (const item of colorOf.keys()) {
    const bar = cols.createDiv({ cls: 'ptl-sv-bar ptl-c-' + colorOf.get(item) });
    if (item.openEnd) bar.addClass('is-open');
    bar.setAttr('aria-label', `${fmt.range(item)} ${plainText(item.name)}`);
    bars.set(item, bar);
  }
  const labels = items.map(item => {
    const label = labelsEl.createDiv({ cls: 'ptl-sv-label' + (item.end ? ' is-span' : '') + (item.kind === 'marker' ? ' is-marker' : '') });
    if (colorOf.has(item)) label.addClass('ptl-c-' + colorOf.get(item));
    else if (item.color) label.addClass('has-color', 'ptl-c-' + item.color);
    label.createSpan({ cls: 'ptl-sv-date', text: fmt.range(item) });
    pending.push(renderInline(plugin, label.createSpan({ cls: 'ptl-sv-name' }), item.name, ctx.sourcePath, owner));
    if (item.desc) {
      if (showDesc) pending.push(renderInline(plugin, label.createDiv({ cls: 'ptl-sv-desc' }), item.desc, ctx.sourcePath, owner));
      else attachTip(label, plainText(item.desc), owner);
    }
    attachLink(plugin, label, item, ctx, fmt, owner);
    return label;
  });

  const GAP = 4;
  let lastWidth = -1;
  const layout = () => {
    const width = labelsEl.clientWidth;
    if (!width || width === lastWidth) return; // hidden, or nothing changed
    lastWidth = width;
    const heights = labels.map(l => Math.max(l.offsetHeight, 18) + GAP);
    const axisInfo = buildTicks(raw.min, raw.max, Math.min(12, Math.max(4, Math.round(items.length * 1.2))));
    const min = fixed && data.range.start ? raw.min : axisInfo.min;
    const max = fixed && data.range.end ? raw.max : axisInfo.max;
    const span = max - min || 1;
    // stretch the axis until consecutive labels fit at their true positions (capped)
    let H = Math.max(items.length * 28, 280);
    const order = items.map((it, i) => i).sort((a, b) => items[a].start.value - items[b].start.value);
    const pos = i => clampItem(items[i], min, max).s;
    for (let k = 0; k + 1 < order.length; k++) {
      const dv = pos(order[k + 1]) - pos(order[k]);
      if (dv > 0) H = Math.max(H, (heights[order[k]] * span) / dv);
    }
    H = Math.min(H, Math.max(480, heights.reduce((a, b) => a + b, 0) * 2.2));
    const linear = v => ((v - min) / span) * H;
    // place labels item by item (equal dates stack), then bend the axis to follow them
    const top = new Array(items.length);
    const anchors = [];
    let cursor = 0;
    for (const i of order) {
      const v = pos(i);
      const t = Math.max(linear(v), cursor);
      top[i] = t;
      const last = anchors[anchors.length - 1];
      if (!last || last[0] !== v) anchors.push([v, t]);
      cursor = t + heights[i];
    }
    const y = v => {
      if (!anchors.length || v <= anchors[0][0]) return linear(v) + (anchors.length ? anchors[0][1] - linear(anchors[0][0]) : 0);
      for (let k = 0; k + 1 < anchors.length; k++) {
        const [v0, y0] = anchors[k];
        const [v1, y1] = anchors[k + 1];
        if (v <= v1) return y0 + ((v - v0) / (v1 - v0)) * (y1 - y0);
      }
      const [vl, yl] = anchors[anchors.length - 1];
      return yl + linear(v) - linear(vl);
    };
    const total = Math.max(H, y(max), cursor);
    canvas.style.height = `${total + 12}px`;
    labels.forEach((l, i) => {
      l.style.top = `${top[i]}px`;
      const c = clampItem(items[i], min, max);
      l.toggleClass('is-cut-start', c.cutStart);
      l.toggleClass('is-cut-end', c.cutEnd);
    });

    axis.empty();
    const ticks = axisInfo.ticks.filter(t => t.value >= min - 1e-9 && t.value <= max + 1e-9);
    const text = tickLabels(ticks, fmt);
    ticks.forEach((t, i) => {
      const tick = axis.createDiv({ cls: 'ptl-sv-tick' });
      tick.style.top = `${y(t.value)}px`;
      tick.setText(text[i]);
    });
    const widest = Math.max(0, ...[...axis.children].map(n => n.scrollWidth));
    canvas.style.gridTemplateColumns = `${Math.max(widest + 14, 36)}px auto minmax(0, 1fr)`;

    const colEnds = [];
    for (const [item, bar] of bars) {
      const c = clampItem(item, min, max);
      const t = y(c.s);
      const b = Math.max(y(c.e), t + 6);
      let col = colEnds.findIndex(end => end <= t - 4);
      if (col < 0) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = b;
      bar.style.top = `${t}px`;
      bar.style.height = `${b - t}px`;
      bar.style.left = `${col * 12}px`;
      bar.toggleClass('is-cut-start', c.cutStart);
      bar.toggleClass('is-cut-end', c.cutEnd);
    }
    cols.style.width = `${Math.max(colEnds.length * 12, 4)}px`;
  };
  Promise.all(pending).then(() => requestAnimationFrame(() => { lastWidth = -1; layout(); }));
  observe(labelsEl, layout, owner);
  return outer;
}

// tapping an item on the axis (touch devices) shows its details below the timeline
function showDetail(plugin, root, item, go, fmt, ctx, owner) {
  let panel = root.querySelector(':scope > .ptl-detail');
  if (!panel) {
    panel = root.createDiv({ cls: 'ptl-detail' });
    const after = root.querySelector(':scope > .ptl-horizontal');
    if (after && after.nextSibling) root.insertBefore(panel, after.nextSibling);
  }
  panel.empty();
  const head = panel.createDiv({ cls: 'ptl-detail-head' });
  head.createSpan({ cls: 'ptl-detail-date', text: fmt.range(item) });
  const close = head.createEl('button', { cls: 'ptl-detail-close', text: '×' });
  close.setAttr('aria-label', fmt.t.close);
  close.onclick = () => {
    panel.remove();
    root.querySelectorAll('.is-selected').forEach(n => n.removeClass('is-selected'));
  };
  renderInline(plugin, panel.createDiv({ cls: 'ptl-detail-title' }), item.name, ctx.sourcePath, owner);
  if (item.desc) renderInline(plugin, panel.createDiv({ cls: 'ptl-detail-desc' }), item.desc, ctx.sourcePath, owner);
  if (go) {
    const open = panel.createEl('button', { cls: 'ptl-detail-open', text: fmt.t.go });
    open.onclick = () => go(false);
  }
}

function renderWarnings(root, warnings, fmt) {
  if (!warnings.length) return;
  const box = root.createEl('details', { cls: 'ptl-warn' });
  box.createEl('summary', { text: fmt.t.warnTitle(warnings.length) });
  for (const w of warnings) {
    const row = box.createDiv({ cls: 'ptl-warn-row' });
    row.createSpan({ cls: 'ptl-warn-where', text: `${fmt.t.lineNo(w.lineNo)} · ${fmt.t.why[w.why]}` });
    row.createEl('code', { text: w.text.length > 80 ? w.text.slice(0, 77) + '…' : w.text });
  }
}

/* ── plugin ──────────────────────────────────────── */

class TimelineRender extends MarkdownRenderChild {}

class PlainTimelinePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerMarkdownCodeBlockProcessor(BLOCK, (source, el, ctx) => this.render(source, el, ctx));
    this.addSettingTab(new PlainTimelineSettingTab(this.app, this));
  }

  // override: { orientation, look } used when the block cannot be rewritten (embeds, Canvas, popovers)
  render(source, el, ctx, override) {
    // a re-render in place (from the switch) first releases everything the previous one held
    if (el.ptlOwner) { el.ptlOwner.unload(); el.empty(); }
    const owner = new TimelineRender(el);
    el.ptlOwner = owner;
    ctx.addChild(owner);
    const base = this.settings;
    const fmt = new Formatter(base);
    const data = parseBlock(source, base.sortOrder, { order: base.inputOrder, pivot: base.twoDigitPivot });
    if (data.today) {
      data.items.push({ kind: 'marker', start: today(), end: null, name: fmt.t.today, desc: '', color: 'red', lineNo: 0, text: '' });
      if (base.sortOrder !== 'written') data.items.sort((a, b) => a.start.value - b.start.value);
    }
    // per-block options layered over the global settings
    const view = Object.create(this);
    view.settings = Object.assign({}, base,
      data.density ? { density: data.density } : {},
      data.desc ? { descriptions: data.desc } : {});
    const s = view.settings;
    const orientation = (override && override.orientation) || data.orientation || s.defaultOrientation;
    const defaultLookFor = o => (s.defaultLook === 'auto' ? (o === 'horizontal' ? 'scale' : 'cards') : s.defaultLook);
    const look = (override && override.look) || data.look || defaultLookFor(orientation);

    el.addClass('ptl-host');
    el.toggleClass('ptl-compact', s.density === 'compact');
    el.toggleClass('ptl-desc-hover', s.descriptions === 'hover' && !isTouch());
    el.toggleClass('ptl-touch', isTouch());
    el.toggleClass('ptl-phone', isPhone());

    if (data.title || s.showSwitch) {
      const head = el.createDiv({ cls: 'ptl-head' });
      head.createDiv({ cls: 'ptl-title', text: data.title });
      if (s.showSwitch) {
        const bar = head.createDiv({ cls: 'ptl-switch' });
        const group = (values, current, key) => {
          const g = bar.createDiv({ cls: 'ptl-switch-group' });
          for (const value of values) {
            const btn = g.createEl('button', { text: fmt.t[value] });
            if (value === current) btn.addClass('is-active');
            btn.setAttr('aria-label', fmt.t[value + 'Hint']);
            btn.setAttr('aria-pressed', String(value === current));
            btn.onclick = async () => {
              if (value === current) return;
              const next = key === 'orientation'
                ? { orientation: value, look: data.look ? look : defaultLookFor(value) }
                : { orientation, look: value };
              const saved = await this.setFlags(el, ctx, next, data.optionLang || fmt.lang);
              if (!saved) this.render(source, el, ctx, next);
            };
          }
        };
        group(['vertical', 'horizontal'], orientation, 'orientation');
        group(['cards', 'scale'], look, 'look');
      }
    }
    const renderer = orientation === 'horizontal'
      ? (look === 'cards' ? renderCardsHorizontal : renderScaleHorizontal)
      : (look === 'scale' ? renderScaleVertical : renderCardsVertical);
    const pending = [];
    const box = renderer(view, el, data, ctx, owner, fmt, pending);
    if (box && data.height) {
      box.style.maxHeight = `${data.height}px`;
      box.addClass('has-height');
    }
    if (s.showWarnings) renderWarnings(el, data.warnings, fmt);
  }

  // rewrite the orientation / look lines of this block and save the note; false if not possible.
  // Lines are written only when they differ from the defaults, in the language the block's own
  // options use, right after the block's other leading option lines.
  async setFlags(el, ctx, next, lang) {
    const info = ctx.getSectionInfo && ctx.getSectionInfo(el);
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!info || !file) return false;
    const s = this.settings;
    const defaultLookFor = o => (s.defaultLook === 'auto' ? (o === 'horizontal' ? 'scale' : 'cards') : s.defaultLook);
    const add = [];
    if (next.orientation !== s.defaultOrientation) {
      add.push(lang === 'ja' ? `> 向き ${next.orientation === 'horizontal' ? '横' : '縦'}` : `> orientation ${next.orientation}`);
    }
    if (next.look !== defaultLookFor(next.orientation)) {
      add.push(lang === 'ja' ? `> 見た目 ${next.look === 'scale' ? '時間軸' : 'カード'}` : `> look ${next.look}`);
    }
    await this.app.vault.process(file, text => {
      const lines = text.split('\n');
      const body = lines.slice(info.lineStart + 1, info.lineEnd).filter(line => {
        const m = line.match(OPTION_LINE);
        return !(m && (FLAG_KEYS.has(m[1]) || FLAG_KEYS.has(m[1].toLowerCase())));
      });
      let at = 0;
      while (at < body.length && /^\s*(>|#|$)/.test(body[at])) at++;
      body.splice(at, 0, ...add);
      lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...body);
      return lines.join('\n');
    });
    return true;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // re-render open notes (reading view and Live Preview) so changes show immediately
    this.app.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view;
      if (!view || view.getViewType() !== 'markdown') return;
      if (view.previewMode && typeof view.previewMode.rerender === 'function') view.previewMode.rerender(true);
      if (typeof leaf.rebuildView === 'function' && view.getMode && view.getMode() === 'source') leaf.rebuildView();
    });
  }
}

/* ── settings tab ────────────────────────────────── */

class PlainTimelineSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    const s = p.settings;
    const L = STRINGS[resolveLang(s.language)];
    const t = L.s;
    containerEl.empty();

    const dropdown = (key, label, options, after) => new Setting(containerEl)
      .setName(label[0]).setDesc(label[1])
      .addDropdown(d => {
        for (const [value, text] of options) d.addOption(value, text);
        d.setValue(String(s[key])).onChange(async v => {
          s[key] = v;
          await p.saveSettings();
          if (after) after();
        });
      });
    const toggle = (key, label) => new Setting(containerEl)
      .setName(label[0]).setDesc(label[1])
      .addToggle(tg => tg.setValue(s[key]).onChange(async v => { s[key] = v; await p.saveSettings(); }));

    dropdown('language', t.language, [['auto', t.langAuto], ['en', t.langEn], ['ja', t.langJa]], () => this.display());
    dropdown('defaultOrientation', t.orientation, [['vertical', L.vertical], ['horizontal', L.horizontal]]);
    dropdown('defaultLook', t.look, [['auto', t.lookAuto], ['cards', L.cards], ['scale', L.scale]]);
    dropdown('inputOrder', t.inputOrder, [['ymd', t.orderYmd], ['dmy', t.orderDmy], ['mdy', t.orderMdy]]);
    new Setting(containerEl).setName(t.pivot[0]).setDesc(t.pivot[1])
      .addText(tx => tx.setValue(String(s.twoDigitPivot)).onChange(async v => {
        const n = parseInt(v, 10);
        if (n >= 0 && n <= 99) { s.twoDigitPivot = n; await p.saveSettings(); }
      }));
    dropdown('dateFormat', t.dateFormat, [['localized', t.dfLocalized], ['iso', t.dfIso], ['custom', t.dfCustom]], () => this.display());
    if (s.dateFormat === 'custom') {
      new Setting(containerEl).setName(t.customFormat[0]).setDesc(t.customFormat[1])
        .addText(tx => tx.setValue(s.customDateFormat).onChange(async v => { s.customDateFormat = v; await p.saveSettings(); }));
    }
    dropdown('bceStyle', t.bce, [['auto', t.bceAuto], ['bce', t.bceBce], ['bc', t.bceBc], ['minus', t.bceMinus], ['ja', t.bceJa]]);
    dropdown('descriptions', t.desc, [['show', t.descShow], ['hover', t.descHover]]);
    toggle('linkItems', t.link);
    toggle('searchInNote', t.search);
    toggle('showSwitch', t.switch);
    dropdown('colorMode', t.color, [['theme', t.colorTheme], ['mono', t.colorMono]]);
    new Setting(containerEl).setName(t.colorOrder[0]).setDesc(t.colorOrder[1])
      .addText(tx => tx.setValue(s.colorOrder).onChange(async v => { s.colorOrder = v; await p.saveSettings(); }));
    toggle('frameLinkWithInnerLinks', t.frame);
    dropdown('density', t.density, [['comfortable', t.dComfortable], ['compact', t.dCompact]]);
    dropdown('sortOrder', t.sort, [['chronological', t.sortChrono], ['written', t.sortWritten]]);
    new Setting(containerEl).setName(t.minWidth[0]).setDesc(t.minWidth[1])
      .addText(tx => tx.setValue(String(s.horizontalMinWidth)).onChange(async v => {
        const n = parseInt(v, 10);
        if (n > 0) { s.horizontalMinWidth = n; await p.saveSettings(); }
      }));
    toggle('showWarnings', t.warnings);
  }
}

module.exports = PlainTimelinePlugin;
