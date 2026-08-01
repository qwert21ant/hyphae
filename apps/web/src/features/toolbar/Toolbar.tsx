import { useStore } from '@/state/store';
import { Altimeter } from './Altimeter';
import { SearchBox } from './SearchBox';
import { applyTheme, nextTheme } from '@/state/theme';

const AUDIENCES = ['stakeholder', 'full'] as const;

/** The app's one header: wordmark, altimeter, search, audience, theme. Extracted from App so App
 *  is left holding only the panel layout it already has plenty of logic for. */
export function Toolbar() {
  const audience = useStore((s) => s.audience);
  const setAudience = useStore((s) => s.setAudience);
  // Theme lives in the store (not local state) so Canvas can read it too, to drive React Flow's own
  // colorMode — the attribute is already correct before React mounts (index.html), and the store's
  // initial value is read the same way, so there is no flash of the wrong theme either way.
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const toggleTheme = () => {
    const next = nextTheme(theme);
    applyTheme(next);
    setTheme(next);
  };

  return (
    <header className="toolbar">
      <span className="toolbar__word">HYPHAE</span>
      <Altimeter />
      <SearchBox />
      <div className="toolbar__right">
        <div className="segmented" role="group" aria-label="detail level">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              className="segmented__option"
              onClick={() => setAudience(a)}
              aria-pressed={audience === a}
            >
              {a}
            </button>
          ))}
        </div>
        <button
          className="toolbar__icon"
          onClick={toggleTheme}
          aria-label={`theme: ${theme}`}
          title={`Switch to ${nextTheme(theme)} theme`}
        >
          ◐
        </button>
      </div>
    </header>
  );
}
