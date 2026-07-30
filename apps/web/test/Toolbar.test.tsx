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
});
