import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Paths resolve from the PACKAGE root, not the test file — that is what lets the mirrored test
// tree sit at any depth. Do not reach for import.meta.url: under jsdom it is an http URL.
const css = readFileSync(resolve(process.cwd(), 'src/features/inspector/inspector.css'), 'utf8');

function rule(css: string, selector: string): string {
  const m = new RegExp(`^\\${selector}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  expect(m, `${selector} has no rule of its own in inspector.css`).toBeTruthy();
  return m![1];
}

describe('inspector.css', () => {
  it('styles a code span from tokens, with no colour literal', () => {
    const body = rule(css, '.rich-code');
    expect(body).toMatch(/var\(--chip\)/);
    expect(body).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  });
});
