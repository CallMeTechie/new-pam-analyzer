import { Fragment, type ReactNode } from 'react';

/**
 * Small Markdown renderer for the manual and the changelog: headings, paragraphs, lists,
 * **bold**, `code` and [links](https://…). Produces React elements, never raw HTML.
 */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) out.push(<strong key={i++}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={i++}>{token.slice(1, -1)}</code>);
    else {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = href && /^(https?:\/\/|\/|#)/.test(href) ? href : undefined;
      out.push(
        safe ? (
          <a key={i++} href={safe} target={safe.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(<p key={key++}>{inline(paragraph.join(' '))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min((heading[1] ?? '#').length + 1, 5);
      const Tag = `h${level}` as 'h2';
      blocks.push(<Tag key={key++}>{inline(heading[2] ?? '')}</Tag>);
    } else if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet?.[1] ?? numbered?.[1]) as string);
    } else if (/^\s+\S/.test(raw) && list) {
      // continuation of a list item
      const items = list.items;
      items[items.length - 1] += ` ${line.trim()}`;
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return (
    <div className="markdown">
      {blocks.map((b, i) => (
        <Fragment key={i}>{b}</Fragment>
      ))}
    </div>
  );
}
