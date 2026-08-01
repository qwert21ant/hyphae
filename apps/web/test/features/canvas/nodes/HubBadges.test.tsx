import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubBadges, HubChip, MAX_BADGES } from '@/features/canvas/nodes/HubBadges';
import { useStore } from '@/state/store';

const badge = (hubName: string, verbClass = 'dataAccess') =>
  ({ hubId: hubName, hubName, verb: 'reads', verbClass }) as never;

describe('HubBadges', () => {
  it('renders nothing without badges', () => {
    const { container } = render(<HubBadges />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per badge', () => {
    render(<HubBadges badges={[badge('Settings')]} />);
    expect(screen.getByText('↳ Settings')).toBeTruthy();
  });

  it('caps the row and shows an overflow count', () => {
    render(<HubBadges badges={[badge('A'), badge('B'), badge('C'), badge('D')]} />);
    expect(screen.getAllByText(/^↳ /)).toHaveLength(MAX_BADGES);
    expect(screen.getByText(`+${4 - MAX_BADGES}`)).toBeTruthy();
  });

  it('truncates a long hub name', () => {
    render(<HubBadges badges={[badge('Player & World Utilities')]} />);
    expect(screen.getByText(/^↳ .{0,14}…$/)).toBeTruthy();
  });

  it('carries the verb class hue as a swatch, never as the text colour', () => {
    // A coloured 9px label would need its own entry in the 33-pair contrast suite for every verb
    // class. The swatch keeps hue = meaning without incurring a text-contrast obligation.
    const { container } = render(<HubBadges badges={[badge('Settings', 'messaging')]} />);
    const swatch = container.querySelector('[data-verb-class="messaging"]') as HTMLElement;
    expect(swatch.style.background).toBe('var(--verb-messaging)');
    expect((screen.getByText('↳ Settings') as HTMLElement).style.color).toBe('var(--tx-2)');
  });
});

describe('HubChip', () => {
  beforeEach(() => useStore.setState({ hubOverrides: {} }));

  it('shows the degree it stands in for', () => {
    render(<HubChip id="h" degree={11} />);
    expect(screen.getByText('hub ×11')).toBeTruthy();
  });

  it('un-quiets the node on click without bubbling to the box', () => {
    const onParentClick = vi.fn();
    render(<div onClick={onParentClick}><HubChip id="h" degree={11} /></div>);
    fireEvent.click(screen.getByText('hub ×11'));
    expect(useStore.getState().hubOverrides).toEqual({ h: false });
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
