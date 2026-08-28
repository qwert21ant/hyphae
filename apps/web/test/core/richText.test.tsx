import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderRichText } from '@/core/richText';

const html = (text: string) => render(<div>{renderRichText(text)}</div>).container.innerHTML;

describe('renderRichText', () => {
  it('leaves plain prose untouched', () => {
    expect(html('Keeps one path at a time')).toBe('<div>Keeps one path at a time</div>');
  });

  it('renders bold', () => {
    expect(html('a **bold** word')).toBe('<div>a <strong>bold</strong> word</div>');
  });

  it('renders a code span with the styling hook', () => {
    expect(html('reads `MAX_DEPTH` at startup'))
      .toBe('<div>reads <code class="rich-code">MAX_DEPTH</code> at startup</div>');
  });

  it('renders both marks in one string', () => {
    expect(html('**always** set `TZ`'))
      .toBe('<div><strong>always</strong> set <code class="rich-code">TZ</code></div>');
  });

  it('renders adjacent marks with no text between them', () => {
    expect(html('**a**`b`')).toBe('<div><strong>a</strong><code class="rich-code">b</code></div>');
  });

  it('leaves an unclosed marker as literal text', () => {
    expect(html('a **bold word')).toBe('<div>a **bold word</div>');
    expect(html('a `code word')).toBe('<div>a `code word</div>');
  });

  it('leaves a lone backtick and a lone asterisk pair alone', () => {
    expect(html('100% * 2 ` done')).toBe('<div>100% * 2 ` done</div>');
  });

  it('does not italicise snake_case, which is why there is no italic mark', () => {
    expect(html('the max_retry_count setting')).toBe('<div>the max_retry_count setting</div>');
  });

  it('treats an empty mark as literal text rather than an empty element', () => {
    expect(html('**** and ``')).toBe('<div>**** and ``</div>');
  });

  it('does not nest — a code span inside bold stays literal inside the code span', () => {
    expect(html('`**not bold**`'))
      .toBe('<div><code class="rich-code">**not bold**</code></div>');
  });

  it('handles an empty string', () => {
    expect(html('')).toBe('<div></div>');
  });
});
