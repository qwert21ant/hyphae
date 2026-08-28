import { Fragment, createElement, type ReactNode } from 'react';

/**
 * The two inline marks model prose may carry: `**bold**` and `` `code` ``.
 *
 * Deliberately NOT markdown. There is no italic, because `_` is ubiquitous inside identifiers and
 * `snake_case_name` would italicise — this exists to make contract names *more* readable, not less.
 * There are no links, lists or headings: the inspector's typography is tight and the model is not
 * a document.
 *
 * Returns React elements, never an HTML string — nothing here reaches `dangerouslySetInnerHTML`,
 * so injection is structurally impossible rather than sanitised against.
 *
 * An unmatched or empty marker renders as literal text, so a model file stays readable raw and a
 * half-typed mark never eats the rest of a description.
 */

// Ordered alternation: a code span wins over bold, so `**x**` inside backticks stays literal.
// Both require at least one non-marker character, which is what makes `****` and ` `` ` literal.
const MARK = /`([^`]+)`|\*\*((?:(?!\*\*)[\s\S])+)\*\*/g;

export function renderRichText(text: string): ReactNode {
  if (!text) return null;
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;

  MARK.lastIndex = 0;
  for (let m = MARK.exec(text); m !== null; m = MARK.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [, code, bold] = m;
    if (code !== undefined) {
      parts.push(createElement('code', { key: key++, className: 'rich-code' }, code));
    } else {
      parts.push(createElement('strong', { key: key++ }, bold));
    }
    last = m.index + m[0].length;
  }
  if (last === 0) return text;              // no marks at all — hand back the plain string
  if (last < text.length) parts.push(text.slice(last));
  return createElement(Fragment, null, ...parts);
}
