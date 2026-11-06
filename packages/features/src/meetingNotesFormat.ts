/**
 * meetingNotesFormat.ts
 *
 * Turns the AI's detailed meeting notes (a small, predictable Markdown subset)
 * into safe HTML, for the Summary tab and the downloadable Word report.
 *
 * Supported: # / ## / ### headings, paragraphs, "-"/"*" bullets and "1." numbered
 * lists (nested by indentation), "- [ ]" / "☐" checkboxes, pipe tables, and
 * inline **bold**, *italic* and `code`.
 *
 * Every piece of text is HTML-escaped BEFORE inline markup is applied, so the
 * model's output can never inject tags or scripts.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(raw: string): string {
  return escapeHtml(raw)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

const LIST_RE = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;
const CHECK_RE = /^\[( |x|X)\]\s+(.*)$/;

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map(c => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

interface ListItem { indent: number; ordered: boolean; html: string; }

function renderList(items: ListItem[]): string {
  // Build nested lists from indentation levels.
  let out = '';
  const stack: { indent: number; ordered: boolean }[] = [];
  for (const item of items) {
    while (stack.length && item.indent < stack[stack.length - 1].indent) {
      out += `</li></${stack.pop()!.ordered ? 'ol' : 'ul'}>`;
    }
    const top = stack[stack.length - 1];
    if (!top || item.indent > top.indent) {
      out += `<${item.ordered ? 'ol' : 'ul'}>`;
      stack.push({ indent: item.indent, ordered: item.ordered });
    } else {
      out += '</li>';
    }
    out += `<li>${item.html}`;
  }
  while (stack.length) out += `</li></${stack.pop()!.ordered ? 'ol' : 'ul'}>`;
  return out;
}

/** Markdown subset → escaped HTML (no wrapping element). */
export function meetingNotesToHtml(markdown: string): string {
  const lines = (markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let para: string[] = [];
  let list: ListItem[] = [];

  const flushPara = () => {
    if (para.length) html.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) html.push(renderList(list));
    list = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flushPara(); flushList(); continue; }

    // Table: a pipe row followed by a separator row.
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara(); flushList();
      const head = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      i--;
      html.push(
        '<table><thead><tr>' + head.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead><tbody>' +
        rows.map(r => '<tr>' + head.map((_, c) => `<td>${inline(r[c] ?? '')}</td>`).join('') + '</tr>').join('') +
        '</tbody></table>',
      );
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); flushList(); html.push('<hr>'); continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara(); flushList();
      const level = Math.min(h[1].length, 3);
      html.push(`<h${level}>${inline(h[2].replace(/\s+#+\s*$/, ''))}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith('☐') || trimmed.startsWith('☑')) {
      flushPara(); flushList();
      html.push(`<p class="check">${trimmed.startsWith('☑') ? '☑' : '☐'} ${inline(trimmed.slice(1).trim())}</p>`);
      continue;
    }

    const li = LIST_RE.exec(line);
    if (li) {
      flushPara();
      let text = li[3];
      const check = CHECK_RE.exec(text);
      if (check) text = `${check[1].trim() ? '☑' : '☐'} ${check[2]}`;
      // Normalise tabs; two spaces per nesting level.
      const indent = li[1].replace(/\t/g, '  ').length;
      list.push({ indent, ordered: /\d/.test(li[2]), html: inline(text) });
      continue;
    }

    // A wrapped continuation of the previous list item.
    if (list.length && /^\s+/.test(line)) {
      list[list.length - 1].html += ' ' + inline(trimmed);
      continue;
    }

    flushList();
    para.push(trimmed);
  }
  flushPara(); flushList();
  return html.join('\n');
}

/** Strips Markdown syntax for plain-text exports (.txt, copy, share). */
export function meetingNotesToPlainText(markdown: string): string {
  return (markdown || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(l => !isTableSeparator(l))
    .map(l => {
      const h = /^(#{1,4})\s+(.*)$/.exec(l.trim());
      if (h) return h[1].length <= 2 ? `\n${h[2].toUpperCase()}` : `\n${h[2]}`;
      if (l.trim().startsWith('|')) return '  ' + splitRow(l).join('  |  ');
      return l
        .replace(/^(\s*)[-*+]\s+\[( |x|X)\]\s+/, (_m, sp, x) => `${sp}${x.trim() ? '☑' : '☐'} `)
        .replace(/^(\s*)[-*+]\s+/, '$1• ');
    })
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A self-contained HTML document styled like a printed report (opens in Word). */
export function meetingNotesToReportDocument(markdown: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #1f2937; max-width: 780px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 20pt; margin: 0 0 4px; color: #111827; }
  h2 { font-size: 14pt; margin: 22px 0 6px; color: #4c1d95; }
  h3 { font-size: 12pt; margin: 16px 0 4px; }
  p { margin: 6px 0; }
  ul, ol { margin: 4px 0 8px 22px; padding: 0; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 12px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; }
  .check { margin-left: 4px; }
</style></head>
<body>
${meetingNotesToHtml(markdown)}
</body></html>`;
}
