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
    skipped: n => `${n} line${n > 1 ? 's' : ''} could not be read`,
    why: { date: 'unreadable date', syntax: 'not a timeline line', color: 'unknown color (ignored)', order: 'end is before start (swapped)', option: 'unreadable option' },
    lineNo: n => `line ${n}`,
    s: {
      language: ['Language', 'Language of the plugin interface and date labels.'],
      langAuto: 'Follow Obsidian', langEn: 'English', langJa: '日本語',
      orientation: ['Default orientation', 'Used when a block has no orientation line. Each block can override it with the switch or "> orientation horizontal".'],
      look: ['Default look', 'Cards space items evenly and suit events; Scale draws lengths in proportion to time and suits periods. "Auto" uses cards when vertical and scale when horizontal. Each block can override it with "> look cards" or "> look scale".'],
      lookAuto: 'Auto',
      inputOrder: ['Date order in blocks', 'How you write dates inside timeline blocks. Separators "-", "/", "." or none are all accepted (e.g. 2026-10-21, 2026/10/21, 20261021, 202610; or 21/10/2026, 21102026, 211026 in day-first order).'],
      orderYmd: 'Year–month–day (YYYY-MM-DD, YYYYMMDD, YYYYMM)', orderDmy: 'Day–month–year (DD/MM/YYYY, DDMMYYYY, DDMMYY)', orderMdy: 'Month–day–year (MM/DD/YYYY, MMDDYYYY, MMDDYY)',
      pivot: ['Two-digit years', 'Two-digit years up to this number are read as 20xx, the rest as 19xx.'],
      dateFormat: ['Date format', 'How dates are written next to each item.'],
      dfCustom: 'Custom pattern',
      customFormat: ['Custom pattern', 'Tokens: YYYY, YY, MMM, MM, M, DD, D. Parts a date does not have are left out.'],
      dfLocalized: 'Localized (Jul 14, 1789 / 1789年7月14日)', dfIso: 'ISO (1789-07-14)',
      bce: ['Years before the common era', 'How negative years are labelled.'],
      bceAuto: 'Match language', bceBce: '490 BCE', bceBc: '490 BC', bceMinus: '-490', bceJa: '前490年',
      desc: ['Descriptions', 'Text after "|" in each line. Can be overridden per block with "> desc hover" or "> desc show".'],
      descShow: 'Always show', descHover: 'Show on hover only',
      link: ['Clickable items', 'Clicking an item opens its first link, a note with the same name, or the place in this note where it is mentioned.'],
      search: ['Fall back to this note', 'If an item has no link and no matching note, jump to the first mention of its name in the current note.'],
      switch: ['Orientation switch', 'Show the Vertical / Horizontal and Cards / Scale buttons on each timeline.'],
      color: ['Period colors', 'Colors used for periods (items with a date range).'],
      colorOrder: ['Color order', 'Comma-separated order in which periods get colors. Available: blue, green, purple, orange, cyan, pink, yellow, red, gray. A single item can pick its own color with "#red" right after the date.'],
      frame: ['Whole item clickable when it has links', 'Off: if an item contains links, only those links are clickable. On: the item itself also opens its first link.'],
      colorTheme: 'Theme colors', colorMono: 'Monochrome',
      density: ['Density', 'Spacing between items. Can be overridden per block with "> density compact".'], dComfortable: 'Comfortable', dCompact: 'Compact',
      sort: ['Order', 'Order of items in a timeline.'], sortChrono: 'Chronological', sortWritten: 'As written',
      minWidth: ['Horizontal minimum width', 'Minimum width (px) of the horizontal axis before it scrolls.'],
      warnings: ['Show warnings', 'List lines that could not be read under the timeline.'],
    },
  },
  ja: {
    vertical: '縦', horizontal: '横', cards: 'カード', scale: '時間軸',
    verticalHint: '縦に並べる', horizontalHint: '横に並べる',
    cardsHint: '等間隔のカード(出来事向き)', scaleHint: '長さを時間に比例させる(期間向き)',
    open: t => `${t} を開く`, jump: 'このノート内の記述へ移動', go: '開く', close: '閉じる',
    present: '現在', today: '今日',
    months: null,
    skipped: n => `読めない行が${n}行あります`,
    why: { date: '日付が読めない', syntax: '年表の行の形ではない', color: '知らない色(無視)', order: '終わりが始まりより前(入れ替え)', option: '指定が読めない' },
    lineNo: n => `${n}行目`,
    s: {
      language: ['言語', 'プラグインの表示と日付の言語。'],
      langAuto: 'Obsidianに合わせる', langEn: 'English', langJa: '日本語',
      orientation: ['既定の向き', '向きの行がないブロックに使う。各ブロックは切り替えボタンか「> 向き 横」で個別に変えられる。'],
      look: ['既定の見た目', 'カードは項目を等間隔に並べ、出来事向き。時間軸は長さを時間に比例させ、期間向き。「自動」は縦ならカード、横なら時間軸。各ブロックは「> 見た目 カード」「> 見た目 時間軸」で個別に変えられる。'],
      lookAuto: '自動',
      inputOrder: ['ブロック内の日付の順番', '年表ブロックに書く日付の並び。区切りは「-」「/」「.」なしのどれでもよい(例: 2026-10-21、2026/10/21、20261021、202610。日-月-年の順なら 21/10/2026、21102026、211026)。'],
      orderYmd: '年-月-日(YYYY-MM-DD・YYYYMMDD・YYYYMM)', orderDmy: '日-月-年(DD/MM/YYYY・DDMMYYYY・DDMMYY)', orderMdy: '月-日-年(MM/DD/YYYY・MMDDYYYY・MMDDYY)',
      pivot: ['2桁の年', 'この数以下の2桁の年は20xx年、それより大きければ19xx年として読む。'],
      dateFormat: ['日付の書き方', '各項目の横に出す日付の形式。'],
      dfCustom: '自分で指定',
      customFormat: ['日付の書式', '使える記号: YYYY, YY, MMM, MM, M, DD, D。日付にない部分は省く。'],
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
      warnings: ['警告を表示', '読めなかった行を年表の下に出す。'],
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

/* ── calendar ─────────────────────────────────────── */

// milliseconds at the start of a calendar day, valid for any year (including negative ones)
function utc(y, m, d) {
  if (m > 12) { y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1; }
  const t = new Date(Date.UTC(2000, m - 1, 1));
  t.setUTCFullYear(y);
  return t.getTime() + (d - 1) * 864e5;
}
const daysInMonth = (y, m) => Math.round((utc(y, m + 1, 1) - utc(y, m, 1)) / 864e5);
// a date as a fractional year, measured in real days
function toValue(y, m, d) {
  const start = utc(y, 1, 1);
  return y + (utc(y, m || 1, d || 1) - start) / (utc(y + 1, 1, 1) - start);
}
function fromValue(v) {
  const y = Math.floor(v);
  const start = utc(y, 1, 1);
  const t = new Date(start + (v - y) * (utc(y + 1, 1, 1) - start) + 1000);
  return { year: y, month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}
function makeDate(year, month, day) {
  return { year, month, day, value: toValue(year, month, day) };
}
function today() {
  const n = new Date();
  return makeDate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/* ── parsing ─────────────────────────────────────── */

// Input dates. The order of the parts is a setting (YMD, DMY or MDY); separators can be
// "-", "/", "." or none. Without separators the number of digits decides the shape:
//   YMD: YYYY, YYYYMM, YYYYMMDD     DMY: YYYY, DDMMYY, DDMMYYYY     MDY: YYYY, MMDDYY, MMDDYYYY
// (month + year in day-first or month-first order needs a separator: 10/2026)
// A leading "-" marks a year before the common era. Two-digit years next to a month
// (19-03-04, 04/03/19) follow the two-digit-year setting; a bare number is always a literal year.
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
    if (n <= 4) parts = [body];
    else if (order === 'ymd') {
      if (n === 6) parts = [body.slice(0, 4), body.slice(4)];
      else if (n === 8) parts = [body.slice(0, 4), body.slice(4, 6), body.slice(6)];
      else if (n === 5 || n > 8) parts = [body];
      else return null;
    } else {
      if (n === 6 || n === 8) parts = [body.slice(0, 2), body.slice(2, 4), body.slice(4)];
      else return null;
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

const FLAG_LINE = /^\s*>\s*(orientation|向き|look|見た目|style)(\s|$)/i;
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

function parseBlock(source, sortOrder, dateOpts) {
  const items = [];
  const options = {};
  const warnings = [];
  source.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    const lineNo = index + 1;
    if (!line || line.startsWith('#')) return;
    if (line.startsWith('>')) {
      const [keyRaw, ...value] = line.slice(1).trim().split(/\s+/);
      const key = OPTION_ALIASES[keyRaw] || OPTION_ALIASES[keyRaw.toLowerCase()];
      if (!key) { warnings.push({ lineNo, text: line, why: 'option' }); return; }
      options[key] = value.join(' ').trim();
      return;
    }
    const m = line.match(/^([-@=*])\s*\[([^\]]*)\]\s*(.*)$/);
    if (!m) { warnings.push({ lineNo, text: line, why: 'syntax' }); return; }
    const [, sigil, dates, restRaw] = m;
    let color = null;
    const colorMatch = restRaw.match(/^#(\w+)\s*/);
    if (colorMatch) {
      const c = colorMatch[1].toLowerCase();
      if (COLORS.includes(c)) color = c;
      else warnings.push({ lineNo, text: line, why: 'color' });
    }
    const rest = restRaw.replace(/^#\w+\s*/, '').replace(/^\{[^}]*\}\s*/, '');
    const [name, desc] = splitNameDesc(rest);
    const tilde = dates.indexOf('~');
    const a = tilde >= 0 ? dates.slice(0, tilde) : dates;
    const b = tilde >= 0 ? dates.slice(tilde + 1) : null;
    let start = parseDate(a, dateOpts);
    let end = null;
    let openEnd = false;
    if (b != null) {
      if (!b.trim()) { openEnd = true; end = today(); }
      else end = parseDate(b, dateOpts);
    }
    if (!start || (b != null && !openEnd && !end)) { warnings.push({ lineNo, text: line, why: 'date' }); return; }
    if (end && end.value < start.value) {
      if (openEnd) end = start;
      else { [start, end] = [end, start]; warnings.push({ lineNo, text: line, why: 'order' }); }
    }
    items.push({ kind: sigil === '@' ? 'period' : sigil === '=' ? 'marker' : 'event', start, end, openEnd, name, desc, color, lineNo });
  });
  if (sortOrder !== 'written') items.sort((x, y) => x.start.value - y.start.value);

  const pick = (value, table) => {
    const v = (value || '').toLowerCase();
    for (const [result, words] of Object.entries(table)) if (words.includes(v)) return result;
    return null;
  };
  let orientation = pick(options.orientation, { horizontal: ['horizontal', 'h', '横'], vertical: ['vertical', 'v', '縦'] });
  let look = pick(options.look, { cards: ['cards', 'card', 'カード'], scale: ['scale', 'axis', '時間軸'] });
  if (options.style && options.style.toLowerCase() === 'axis') { orientation = 'horizontal'; look = 'scale'; }
  const density = pick(options.density, { compact: ['compact', '詰める'], comfortable: ['comfortable', 'ゆったり'] });
  const desc = pick(options.desc, { hover: ['hover', 'ホバー'], show: ['show', '表示'] });
  const range = {
    start: options.start ? parseDate(options.start, dateOpts) : null,
    end: options.end ? parseDate(options.end, dateOpts) : null,
  };
  return {
    items, options, warnings, orientation, look, density, desc, range,
    title: options.title || '',
    today: 'today' in options,
    height: parseInt(options.height, 10) || 0,
  };
}

/* ── formatting ──────────────────────────────────── */

class Formatter {
  constructor(settings) {
    this.lang = resolveLang(settings.language);
    this.t = STRINGS[this.lang];
    this.iso = settings.dateFormat === 'iso';
    this.custom = settings.dateFormat === 'custom' ? (settings.customDateFormat || 'YYYY-MM-DD') : null;
    this.bce = settings.bceStyle === 'auto' ? (this.lang === 'ja' ? 'ja' : 'bce') : settings.bceStyle;
  }
  year(y) {
    if (y >= 0) return this.lang === 'ja' && !this.iso ? `${y}年` : `${y}`;
    const n = -y;
    switch (this.bce) {
      case 'ja': return `前${n}年`;
      case 'bc': return `${n} BC`;
      case 'minus': return `-${n}`;
      default: return `${n} BCE`;
    }
  }
  date(d) {
    const pad = n => String(n).padStart(2, '0');
    if (this.custom) {
      let pattern = this.custom;
      // drop parts the date does not have (and the separator next to them)
      if (!d.day) pattern = pattern.replace(/[^A-Za-z]*D{1,2}[^A-Za-z]*/, m => (/^[^A-Za-z]/.test(m) && /[^A-Za-z]$/.test(m) ? m[0] : ''));
      if (!d.month) pattern = pattern.replace(/[^A-Za-z]*M{1,4}[^A-Za-z]*/, m => (/^[^A-Za-z]/.test(m) && /[^A-Za-z]$/.test(m) ? m[0] : ''));
      const months = STRINGS.en.months;
      return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, tok => {
        switch (tok) {
          case 'YYYY': return d.year < 0 ? this.year(d.year) : String(d.year);
          case 'YY': return d.year < 0 ? this.year(d.year) : pad(Math.abs(d.year) % 100);
          case 'MMMM': case 'MMM': return d.month ? months[d.month - 1] : '';
          case 'MM': return d.month ? pad(d.month) : '';
          case 'M': return d.month ? String(d.month) : '';
          case 'DD': return d.day ? pad(d.day) : '';
          default: return d.day ? String(d.day) : '';
        }
      }).replace(/^[^\dA-Za-z前]+|[^\dA-Za-z年]+$/g, '');
    }
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
    if (t.unit === 'year') return t.year < 0 ? this.year(t.year) : String(t.year);
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

// Pick a calendar-aware step (days, months or years) for about `count` ticks between min and
// max, and widen the range outward to whole steps so both ends carry a tick.
const SUB_YEAR_UNITS = [
  ['day', 1, 1 / 365.25], ['day', 2, 2 / 365.25], ['day', 7, 7 / 365.25], ['day', 14, 14 / 365.25],
  ['month', 1, 1 / 12], ['month', 2, 2 / 12], ['month', 3, 3 / 12], ['month', 6, 6 / 12],
];

function buildTicks(min, max, count) {
  if (!(max > min)) max = min + 1 / 12;
  const rough = (max - min) / Math.max(count, 1);
  const ticks = [];
  const sub = SUB_YEAR_UNITS.find(([, , size]) => size >= rough);
  if (sub && rough < 1) {
    const [unit, n] = sub;
    const s = fromValue(min);
    let cur;
    if (unit === 'month') cur = { y: s.year, m: Math.floor((s.month - 1) / n) * n + 1, d: 1 };
    else cur = { y: s.year, m: s.month, d: s.day };
    for (let guard = 0; guard < 400; guard++) {
      const value = toValue(cur.y, cur.m, cur.d);
      ticks.push({ unit, value, year: cur.y, month: cur.m, day: cur.d });
      if (value >= max) break;
      if (unit === 'month') {
        cur.m += n;
        while (cur.m > 12) { cur.m -= 12; cur.y += 1; }
      } else {
        const t = new Date(utc(cur.y, cur.m, cur.d) + n * 864e5);
        cur = { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
      }
    }
  } else {
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
    const step = [1, 2, 5, 10].map(k => k * mag).find(x => x >= rough) || mag * 10;
    const first = Math.floor(min / step) * step;
    for (let v = first, guard = 0; guard < 400; v += step, guard++) {
      ticks.push({ unit: 'year', value: v, year: v });
      if (v >= max) break;
    }
  }
  return { min: ticks[0].value, max: ticks[ticks.length - 1].value, ticks };
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
  if (!isFinite(min)) { min = 0; max = 1; }
  return { min, max };
}

const plainText = s => s
  .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

/* ── rendering helpers ───────────────────────────── */

function renderInline(plugin, el, text, sourcePath, owner) {
  if (!text) return;
  MarkdownRenderer.render(plugin.app, text, el, sourcePath, owner);
  const p = el.querySelector(':scope > p');
  if (p && el.children.length === 1) {
    while (p.firstChild) el.appendChild(p.firstChild);
    p.remove();
  }
}

// a small floating note for descriptions on devices with a pointer
function attachTip(el, text, owner) {
  if (!text || isTouch()) return;
  let tip = null;
  const show = () => {
    if (tip) return;
    tip = document.body.createDiv({ cls: 'ptl-tip' });
    tip.setText(text);
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - tr.width - 8);
    const top = r.top - tr.height - 6 > 8 ? r.top - tr.height - 6 : r.bottom + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => { if (tip) { tip.remove(); tip = null; } };
  el.addEventListener('mouseenter', show);
  el.addEventListener('mouseleave', hide);
  el.addEventListener('focus', show);
  el.addEventListener('blur', hide);
  owner.register(hide);
}

// make an item clickable: first link in the item → note with the same name → mention in this note
function attachLink(plugin, el, item, ctx, fmt, hoverParent) {
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
    const dest = decodeURI(m[2]);
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
  if (target.link && hoverParent) {
    el.addEventListener('mouseover', evt => {
      app.workspace.trigger('hover-link', {
        event: evt, source: 'preview', hoverParent, targetEl: el, linktext: target.link, sourcePath: ctx.sourcePath,
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
  const observer = new ResizeObserver(update);
  observer.observe(scroller);
  owner.register(() => observer.disconnect());
  requestAnimationFrame(update);
}

/* ── vertical cards: events first, periods shown as bands in the gutter ── */

function renderCardsVertical(plugin, root, data, ctx, owner, fmt) {
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
    renderInline(plugin, body.createDiv({ cls: 'ptl-v-title' }), item.name, ctx.sourcePath, owner);
    if (item.desc) renderInline(plugin, body.createDiv({ cls: 'ptl-v-desc' }), item.desc, ctx.sourcePath, owner);
    attachLink(plugin, row, item, ctx, fmt, owner);
    if (!item.end && item.color) row.addClass('ptl-c-' + item.color, 'has-color');
    rows.push({ item, el: row });
    if (item.end) {
      const color = colorFor(plugin, item, periods.length);
      row.addClass('ptl-c-' + color);
      periods.push({ item, row, color });
    }
  }
  if (!periods.length) return;

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
  requestAnimationFrame(drawBands);
  const observer = new ResizeObserver(drawBands);
  observer.observe(list);
  owner.register(() => observer.disconnect());
}

/* ── horizontal scale: periods below the axis, events above it ── */

function renderScaleHorizontal(plugin, root, data, ctx, owner, fmt) {
  const items = data.items;
  if (!items.length) return;
  const raw = dataRange(data);

  const outer = root.createDiv({ cls: 'ptl ptl-horizontal' });
  if (data.height) outer.style.maxHeight = `${data.height}px`;
  const canvas = outer.createDiv({ cls: 'ptl-h-canvas' });
  const above = canvas.createDiv({ cls: 'ptl-h-above' });
  const axis = canvas.createDiv({ cls: 'ptl-h-axis' });
  const below = canvas.createDiv({ cls: 'ptl-h-below' });
  const touch = isTouch();
  const hoverDesc = plugin.settings.descriptions === 'hover';

  const placed = [];
  let periodIndex = 0;
  for (const item of items) {
    const isSpan = !!item.end;
    const el = (isSpan ? below : above).createDiv({ cls: isSpan ? 'ptl-h-span' : 'ptl-h-point' });
    if (item.kind === 'marker') el.addClass('is-marker');
    if (isSpan) el.addClass('ptl-c-' + colorFor(plugin, item, periodIndex++));
    else if (item.color) el.addClass('ptl-c-' + item.color, 'has-color');
    if (item.openEnd) el.addClass('is-open');
    renderInline(plugin, el.createDiv({ cls: 'ptl-h-label' }), `${fmt.range(item)}  ${item.name}`, ctx.sourcePath, owner);
    if (touch) el.addClass('ptl-tap-detail');
    const go = attachLink(plugin, el, item, ctx, fmt, owner);
    // descriptions: a floating note on hover (desktop), or the detail panel on tap (touch)
    if (item.desc) {
      el.addClass('has-desc');
      if (!touch) attachTip(el, plainText(item.desc), owner);
    }
    if (touch) el.addEventListener('click', evt => {
      if (evt.target.closest('a')) return;
      showDetail(plugin, outer, item, go, fmt, ctx, owner);
    });
    placed.push({ item, el, isSpan, stem: isSpan ? null : above.createDiv({ cls: 'ptl-h-stem' }) });
  }
  // with "always show", list the descriptions under the axis as a compact legend
  if (!hoverDesc && !touch && items.some(it => it.desc)) {
    const legend = root.createDiv({ cls: 'ptl-h-legend' });
    for (const item of items.filter(it => it.desc)) {
      const row = legend.createDiv({ cls: 'ptl-h-legend-row' });
      row.createSpan({ cls: 'ptl-h-legend-name', text: plainText(item.name) });
      renderInline(plugin, row.createSpan({ cls: 'ptl-h-legend-desc' }), item.desc, ctx.sourcePath, owner);
    }
  }

  const LANE = plugin.settings.density === 'compact' ? 22 : 26;
  const layout = () => {
    const width = Math.max((outer.clientWidth || 700) - 24, items.length * 46, plugin.settings.horizontalMinWidth);
    const axisInfo = buildTicks(raw.min, raw.max, Math.max(3, Math.round(width / 110)));
    const { min, max } = axisInfo;
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
        const left = x(p.item.start.value);
        const bar = p.isSpan ? Math.max(x(p.item.end.value) - left, 4) : 0;
        p.el.style.width = p.isSpan ? `${bar}px` : '';
        const need = Math.max(bar, p.el.querySelector('.ptl-h-label').scrollWidth + 14);
        // points may hang their label to the left when that keeps the stack lower
        const normalLane = laneFor(left);
        const canFlip = !p.isSpan && left - need >= 0;
        const flipLane = canFlip ? laneFor(left - need) : Infinity;
        const flip = canFlip && (flipLane < normalLane || (left + need > width + 8 && flipLane <= normalLane));
        const from = flip ? left - need : left;
        const lane = flip ? flipLane : normalLane;
        if (lane === laneEnds.length) laneEnds.push(0);
        laneEnds[lane] = from + need;
        right = Math.max(right, from + need);
        p.el.toggleClass('is-flipped', flip);
        p.el.style.left = flip ? `${left - need + 10}px` : `${left}px`;
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
    const labels = tickLabels(axisInfo.ticks, fmt);
    axisInfo.ticks.forEach((t, i) => {
      const tick = axis.createDiv({ cls: 'ptl-h-tick' });
      tick.style.left = `${x(t.value)}px`;
      tick.setText(labels[i]);
    });
  };
  requestAnimationFrame(layout);
  const observer = new ResizeObserver(layout);
  observer.observe(outer);
  owner.register(() => observer.disconnect());
  addScrollFade(outer, owner);
}

/* ── horizontal cards: evenly spaced nodes on a line, cards alternating above and below ── */
// Every cell is a direct child of one grid (no subgrid), so rows line up on older engines too.

function renderCardsHorizontal(plugin, root, data, ctx, owner, fmt) {
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
    renderInline(plugin, card.createDiv({ cls: 'ptl-ch-title' }), item.name, ctx.sourcePath, owner);
    if (item.desc) renderInline(plugin, card.createDiv({ cls: 'ptl-ch-desc' }), item.desc, ctx.sourcePath, owner);
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
}

/* ── vertical scale: a time axis running down the page; periods as columns ── */

function renderScaleVertical(plugin, root, data, ctx, owner, fmt) {
  const items = data.items;
  if (!items.length) return;
  const raw = dataRange(data);
  const axisInfo = buildTicks(raw.min, raw.max, Math.min(12, Math.max(4, Math.round(items.length * 1.2))));
  const { min, max } = axisInfo;
  const ROW = plugin.settings.density === 'compact' ? 22 : 28;
  const showDesc = plugin.settings.descriptions === 'show';
  const labelH = it => (it.desc && showDesc ? ROW * 1.7 : ROW);
  // stretch the axis until consecutive labels fit at their true positions (capped)
  let H = Math.max(items.length * ROW, 320);
  for (let i = 0; i + 1 < items.length; i++) {
    const dv = items[i + 1].start.value - items[i].start.value;
    if (dv > 0) H = Math.max(H, (labelH(items[i]) * (max - min)) / dv);
  }
  H = Math.min(H, Math.max(480, items.length * ROW * 2.4));
  const linear = v => ((v - min) / (max - min)) * H;
  // where each label lands, item by item (equal dates stack instead of overlapping)
  const order = items.map((it, i) => i).sort((a, b) => items[a].start.value - items[b].start.value);
  const labelTop = new Array(items.length);
  const anchors = [];
  let cursor = 0;
  for (const i of order) {
    const it = items[i];
    const top = Math.max(linear(it.start.value), cursor);
    labelTop[i] = top;
    const last = anchors[anchors.length - 1];
    if (!last || last[0] !== it.start.value) anchors.push([it.start.value, top]);
    cursor = top + labelH(it);
  }
  // time → y: proportional where labels fit, gently stretched where they were pushed
  const y = v => {
    if (!anchors.length || v <= anchors[0][0]) return linear(v) + (anchors.length ? anchors[0][1] - linear(anchors[0][0]) : 0);
    for (let i = 0; i + 1 < anchors.length; i++) {
      const [v0, y0] = anchors[i];
      const [v1, y1] = anchors[i + 1];
      if (v <= v1) return y0 + ((v - v0) / (v1 - v0)) * (y1 - y0);
    }
    const [vl, yl] = anchors[anchors.length - 1];
    return yl + linear(v) - linear(vl);
  };
  H = Math.max(H, y(max), cursor);

  const outer = root.createDiv({ cls: 'ptl ptl-scale-v' });
  if (data.height) outer.style.maxHeight = `${data.height}px`;
  const canvas = outer.createDiv({ cls: 'ptl-sv-canvas' });
  canvas.style.height = `${H + 24}px`;
  const axis = canvas.createDiv({ cls: 'ptl-sv-axis' });
  const cols = canvas.createDiv({ cls: 'ptl-sv-cols' });
  const labelsEl = canvas.createDiv({ cls: 'ptl-sv-labels' });

  const tickText = tickLabels(axisInfo.ticks, fmt);
  axisInfo.ticks.forEach((t, i) => {
    const tick = axis.createDiv({ cls: 'ptl-sv-tick' });
    tick.style.top = `${y(t.value)}px`;
    tick.setText(tickText[i]);
  });
  // the axis column is as wide as its longest label
  requestAnimationFrame(() => {
    const widest = Math.max(0, ...[...axis.children].map(c => c.scrollWidth));
    canvas.style.gridTemplateColumns = `${Math.max(widest + 14, 36)}px auto 1fr`;
  });

  // periods: vertical bars packed into columns
  const colEnds = [];
  let periodIndex = 0;
  const barColor = new Map();
  for (const item of items.filter(it => it.end).sort((a, b) => a.start.value - b.start.value)) {
    const top = y(item.start.value);
    const bottom = Math.max(y(item.end.value), top + 6);
    let col = colEnds.findIndex(end => end <= top - 4);
    if (col < 0) { col = colEnds.length; colEnds.push(0); }
    colEnds[col] = bottom;
    const color = colorFor(plugin, item, periodIndex++);
    barColor.set(item, color);
    const bar = cols.createDiv({ cls: 'ptl-sv-bar ptl-c-' + color });
    if (item.openEnd) bar.addClass('is-open');
    bar.style.top = `${top}px`;
    bar.style.height = `${bottom - top}px`;
    bar.style.left = `${col * 12}px`;
    bar.setAttr('aria-label', `${fmt.range(item)} ${plainText(item.name)}`);
  }
  cols.style.width = `${Math.max(colEnds.length * 12, 4)}px`;

  items.forEach((item, i) => {
    const label = labelsEl.createDiv({ cls: 'ptl-sv-label' + (item.end ? ' is-span' : '') + (item.kind === 'marker' ? ' is-marker' : '') });
    if (barColor.has(item)) label.addClass('ptl-c-' + barColor.get(item));
    else if (item.color) label.addClass('has-color', 'ptl-c-' + item.color);
    label.style.top = `${labelTop[i]}px`;
    label.createSpan({ cls: 'ptl-sv-date', text: fmt.range(item) });
    renderInline(plugin, label.createSpan({ cls: 'ptl-sv-name' }), item.name, ctx.sourcePath, owner);
    if (item.desc) {
      if (showDesc) renderInline(plugin, label.createDiv({ cls: 'ptl-sv-desc' }), item.desc, ctx.sourcePath, owner);
      else attachTip(label, plainText(item.desc), owner);
    }
    attachLink(plugin, label, item, ctx, fmt, owner);
  });
}

// tapping an item on the axis (touch devices) shows its details below the timeline
function showDetail(plugin, outer, item, go, fmt, ctx, owner) {
  let panel = outer.parentElement.querySelector(':scope > .ptl-detail');
  if (!panel) panel = outer.parentElement.createDiv({ cls: 'ptl-detail' });
  panel.empty();
  const head = panel.createDiv({ cls: 'ptl-detail-head' });
  head.createSpan({ cls: 'ptl-detail-date', text: fmt.range(item) });
  const close = head.createEl('button', { cls: 'ptl-detail-close', text: '×' });
  close.setAttr('aria-label', fmt.t.close);
  close.onclick = () => panel.remove();
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
  box.createEl('summary', { text: fmt.t.skipped(warnings.length) });
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
    const owner = new TimelineRender(el);
    ctx.addChild(owner);
    const base = this.settings;
    const fmt = new Formatter(base);
    const data = parseBlock(source, base.sortOrder, { order: base.inputOrder, pivot: base.twoDigitPivot });
    if (data.today) {
      data.items.push({ kind: 'marker', start: today(), end: null, name: fmt.t.today, desc: '', color: 'red' });
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
    el.toggleClass('has-title', !!data.title);

    if (data.title) el.createDiv({ cls: 'ptl-title', text: data.title });
    if (s.showSwitch) {
      const bar = el.createDiv({ cls: 'ptl-switch' });
      const group = (values, current, key) => {
        const g = bar.createDiv({ cls: 'ptl-switch-group' });
        for (const value of values) {
          const btn = g.createEl('button', { text: fmt.t[value] });
          if (value === current) btn.addClass('is-active');
          btn.setAttr('aria-label', fmt.t[value + 'Hint']);
          btn.setAttr('aria-pressed', String(value === current));
          btn.onclick = async () => {
            if (value === current) return;
            const next = key === 'orientation' ? { orientation: value, look: data.look ? look : null } : { orientation, look: value };
            if (key === 'orientation' && !data.look) next.look = defaultLookFor(value);
            const saved = await this.setFlags(el, ctx, next, fmt.lang);
            if (!saved) { el.empty(); this.render(source, el, ctx, next); }
          };
        }
      };
      group(['vertical', 'horizontal'], orientation, 'orientation');
      group(['cards', 'scale'], look, 'look');
    }
    const renderer = orientation === 'horizontal'
      ? (look === 'cards' ? renderCardsHorizontal : renderScaleHorizontal)
      : (look === 'scale' ? renderScaleVertical : renderCardsVertical);
    renderer(view, el, data, ctx, owner, fmt);
    if (s.showWarnings) renderWarnings(el, data.warnings, fmt);
  }

  // rewrite the orientation / look lines of this block and save the note; false if not possible.
  // Lines are written only when they differ from the defaults, so blocks stay clean.
  async setFlags(el, ctx, next, lang) {
    const info = ctx.getSectionInfo && ctx.getSectionInfo(el);
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!info || !file) return false;
    const s = this.settings;
    const defaultLookFor = o => (s.defaultLook === 'auto' ? (o === 'horizontal' ? 'scale' : 'cards') : s.defaultLook);
    const head = [];
    if (next.orientation !== s.defaultOrientation) {
      head.push(lang === 'ja' ? `> 向き ${next.orientation === 'horizontal' ? '横' : '縦'}` : `> orientation ${next.orientation}`);
    }
    if (next.look !== defaultLookFor(next.orientation)) {
      head.push(lang === 'ja' ? `> 見た目 ${next.look === 'scale' ? '時間軸' : 'カード'}` : `> look ${next.look}`);
    }
    await this.app.vault.process(file, text => {
      const lines = text.split('\n');
      const body = lines.slice(info.lineStart + 1, info.lineEnd).filter(line => !FLAG_LINE.test(line));
      lines.splice(info.lineStart + 1, info.lineEnd - info.lineStart - 1, ...head, ...body);
      return lines.join('\n');
    });
    return true;
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // re-render open notes so changes show immediately
    this.app.workspace.iterateAllLeaves(leaf => {
      const mode = leaf.view && leaf.view.previewMode;
      if (mode && typeof mode.rerender === 'function') mode.rerender(true);
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
