import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Toolbar } from '../src/Toolbar';
import { useStore } from '../src/store';
import { THEME_KEY } from '../src/theme';

describe('Toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    useStore.setState({ audience: 'full' });
  });

  it('marks the active audience with aria-pressed', () => {
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /full/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /stakeholder/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switches audience', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: /stakeholder/i }));
    expect(useStore.getState().audience).toBe('stakeholder');
  });

  it('toggles the theme and persists it', () => {
    render(<Toolbar />);
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  // Every control in the header sits on one baseline and is one height. They used to be sized by
  // their own text, so the altimeter (two stacked lines) towered over the audience toggle and the
  // whole bar grew and shrank as the crumb chain gained a layer label. jsdom loads no external
  // stylesheet and measures nothing, so this pins the rule rather than the pixels.
  it('gives every header control the same explicit height', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/chrome.css'), 'utf8');
    for (const sel of ['.altimeter', '.segmented', '.search__input', '.toolbar__icon']) {
      const rule = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
      expect(rule, `${sel} has no rule in chrome.css`).not.toBe('');
      expect(rule, `${sel} must be var(--s-ctl) tall`).toMatch(/height:\s*var\(--s-ctl\)/);
      expect(rule, `${sel} needs border-box or its border breaks the shared height`).toMatch(/box-sizing:\s*border-box/);
    }
  });
});
