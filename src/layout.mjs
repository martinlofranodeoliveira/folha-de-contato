/** Deterministic page geometry; all lengths use the exported 144 dpi pixels. */
import { validateProject, formatPrice } from './model.mjs';

const freezeBox = (x, y, width, height) => Object.freeze({ x, y, width, height });
function elide(value, count) {
  const characters = Array.from(value);
  return characters.length <= count ? value : characters.slice(0, Math.max(0, count - 1)).join('') + '…';
}
function nameLines(value, width, showNumbers) {
  // A conservative bound for 15px fallback fonts, rather than an average
  // glyph estimate. The renderer prefixes only the first line with '01. '.
  // Final SVG clips remain necessary: this is not font-metric measurement.
  const capacity = line => Math.max(1, Math.floor((width - (showNumbers && line === 0 ? 36 : 0)) / 16));
  const characters = Array.from(value.replace(/\s+/gu, ' ').trim());
  const lines = [];
  while (characters.length && lines.length < 2) {
    const count = capacity(lines.length);
    if (characters.length <= count) { lines.push(characters.splice(0).join('')); break; }
    if (lines.length === 1) { lines.push(characters.splice(0, Math.max(0, count - 1)).join('').trimEnd() + '…'); break; }
    let cut = count;
    const prefix = characters.slice(0, count + 1);
    const space = prefix.lastIndexOf(' ');
    if (space > 0) cut = space;
    lines.push(characters.splice(0, cut).join('').trimEnd());
    while (characters[0] === ' ') characters.shift();
  }
  return Object.freeze(lines);
}
function detail(item, showPrices, width) {
  const amount = showPrices ? formatPrice(item.priceMinor) : '';
  const count = Math.max(1, Math.floor(width / 7.5));
  if (!amount) return elide(item.reference, count);
  if (!item.reference) return amount;
  const available = count - Array.from(amount).length - 3;
  return available > 0 ? elide(item.reference, available) + ' · ' + amount : amount;
}
function placement(item, frame, fit) {
  const swapped = item.rotation === 90 || item.rotation === 270;
  const width = swapped ? item.height : item.width;
  const height = swapped ? item.width : item.height;
  const scale = (fit === 'contain' ? Math.min : Math.max)(frame.width / width, frame.height / height);
  const [cosine, sine] = ({ 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] })[item.rotation];
  const a = scale * cosine;
  const b = scale * sine;
  const c = -scale * sine;
  const d = scale * cosine;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const e = centerX - a * item.width / 2 - c * item.height / 2;
  const f = centerY - b * item.width / 2 - d * item.height / 2;
  return Object.freeze({ matrix: Object.freeze([a, b, c, d, e, f].map(number => number === 0 ? 0 : number)) });
}

export function planPages(value) {
  const project = validateProject(value);
  const config = project.settings;
  let [width, height] = config.paper === 'a4' ? [1191, 1684] : [1224, 1584];
  if (config.orientation === 'landscape') [width, height] = [height, width];
  const cellWidth = (width - 112 - (config.columns - 1) * 18) / config.columns;
  const cellHeight = (height - 94 - 174 - (config.rows - 1) * 18) / config.rows;
  const pageSize = config.columns * config.rows;
  const pages = [];
  for (let start = 0; start < project.items.length; start += pageSize) {
    const entries = project.items.slice(start, start + pageSize);
    const slots = entries.map((entry, index) => {
      const column = index % config.columns;
      const row = Math.floor(index / config.columns);
      const x = 56 + column * (cellWidth + 18);
      const y = 174 + row * (cellHeight + 18);
      const frame = freezeBox(x, y, cellWidth, cellHeight - 64);
      const label = freezeBox(x, y + frame.height + 10, cellWidth, 54);
      return Object.freeze({
        itemId: entry.id, ordinal: start + index + 1, frame, label,
        nameLines: nameLines(entry.name || entry.fileName, label.width, config.showNumbers),
        detailLine: detail(entry, config.showPrices, label.width),
        placement: placement(entry, frame, config.fit),
      });
    });
    pages.push(Object.freeze({ pageNumber: pages.length + 1, slots: Object.freeze(slots) }));
  }
  return Object.freeze({ width, height, pages: Object.freeze(pages) });
}
