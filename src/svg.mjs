/** Passive, self-contained page SVG from a validated product document. */
import { ProjectError, validateProject } from './model.mjs';
import { planPages } from './layout.mjs';

// XML 1.0 excludes these two otherwise accepted Unicode code points.
// Replace them only in the rendered text; the portable project keeps its input.
const escape = value => value.replace(/[\uFFFE\uFFFF]/gu, '\uFFFD').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const number = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProjectError('page_layout', 'Não foi possível calcular a página.');
  }
  return String(Number(value.toFixed(6)));
};
const rect = box => `x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}"`;
const shorten = (text, limit) => {
  const chars = Array.from(text);
  return chars.length <= limit ? text : chars.slice(0, Math.max(0, limit - 1)).join('') + '…';
};

export function toSvg(rawProject, pageIndex = 0) {
  const project = validateProject(rawProject);
  const plan = planPages(project);
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= plan.pages.length) {
    throw new ProjectError('page_index', 'Escolha uma página existente para exportar.');
  }
  const page = plan.pages[pageIndex];
  const prefix = `page-${pageIndex + 1}`;
  const width = number(plan.width);
  const height = number(plan.height);
  const textWidth = plan.width - 112;
  const header = { x: 56, y: 48, width: textWidth, height: 108 };
  const footer = { x: 56, y: plan.height - 70, width: textWidth, height: 30 };
  const items = new Map(project.items.map(item => [item.id, item]));
  const definitions = [
    `<clipPath id="${prefix}-header"><rect ${rect(header)}/></clipPath>`,
    `<clipPath id="${prefix}-footer"><rect ${rect(footer)}/></clipPath>`,
  ];
  const content = [];
  page.slots.forEach((slot, index) => {
    const item = items.get(slot.itemId);
    if (!item) throw new ProjectError('page_layout', 'Não foi possível calcular a página.');
    const clip = `${prefix}-item-${index + 1}`;
    definitions.push(`<clipPath id="${clip}-photo"><rect ${rect(slot.frame)}/></clipPath>`);
    definitions.push(`<clipPath id="${clip}-label"><rect ${rect(slot.label)}/></clipPath>`);
    content.push(`<rect ${rect(slot.frame)} fill="#f1f3ef"/>`);
    content.push(`<g clip-path="url(#${clip}-photo)"><image x="0" y="0" width="${item.width}" height="${item.height}" transform="matrix(${slot.placement.matrix.map(number).join(' ')})" href="${escape(item.png)}"/></g>`);
    content.push(`<g clip-path="url(#${clip}-label)" font-family="Arial, Helvetica, sans-serif" fill="#202a27">`);
    slot.nameLines.forEach((line, lineIndex) => {
      const marker = project.settings.showNumbers && lineIndex === 0 ? `${String(slot.ordinal).padStart(2, '0')}. ` : '';
      content.push(`<text x="${number(slot.label.x)}" y="${number(slot.label.y + 14 + lineIndex * 18)}" font-size="15" font-weight="600">${escape(marker + line)}</text>`);
    });
    if (slot.detailLine) {
      content.push(`<text x="${number(slot.label.x)}" y="${number(slot.label.y + 50)}" font-size="12" fill="#4c5852">${escape(slot.detailLine)}</text>`);
    }
    content.push('</g>');
  });
  const title = shorten(project.settings.title, Math.max(1, Math.floor(textWidth / 22)));
  const subtitle = shorten(project.settings.subtitle, Math.max(1, Math.floor(textWidth / 10)));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${escape(project.settings.title)} · Página ${page.pageNumber} de ${plan.pages.length}</title>`,
    `<desc>Folha de produtos com imagens internas. Preços informados por quem edita o projeto.</desc>`,
    `<defs>${definitions.join('')}</defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g clip-path="url(#${prefix}-header)" fill="#202a27" font-family="Arial, Helvetica, sans-serif">`,
    `<text x="56" y="88" font-size="36" font-weight="600">${escape(title)}</text>`,
    `<text x="56" y="123" font-size="16" fill="#4c5852">${escape(subtitle)}</text>`,
    '</g>',
    ...content,
    `<g clip-path="url(#${prefix}-footer)" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#4c5852">`,
    `<text x="56" y="${plan.height - 50}">Folha de Contato</text>`,
    `<text x="${plan.width - 56}" y="${plan.height - 50}" text-anchor="end">Página ${page.pageNumber} de ${plan.pages.length}</text>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n');
}
