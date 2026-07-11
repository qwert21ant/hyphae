import { useMemo, useState } from 'react';
import { useStore } from './store';
import type { Node } from '@hyphae/schema';

/** Rank a node name against a lowercased query: 0 exact, 1 prefix, 2 substring, 3 no match. */
function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 3;
}

/** Toolbar search: jump to any node by name. Matches names case-insensitively (exact → prefix →
 *  substring), and picking a result reveals it (focus its parent + select). */
export function SearchBox() {
  const nodes = useStore((s) => s.model.nodes);
  const revealNode = useStore((s) => s.revealNode);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Node[];
    return nodes
      .map((n) => ({ n, r: rank(n.name, q) }))
      .filter((x) => x.r < 3)
      .sort((a, b) => a.r - b.r)
      .slice(0, 10)
      .map((x) => x.n);
  }, [nodes, query]);

  const nameOf = (id: string | null) => (id ? nodes.find((n) => n.id === id)?.name : null);

  const pick = (n: Node | undefined) => {
    if (!n) return;
    revealNode(n.id);
    setQuery('');
    setActive(0);
    setOpen(false);
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Escape') { setQuery(''); setActive(0); setOpen(false); return; }
    if (!results.length) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (ev.key === 'Enter') { ev.preventDefault(); pick(results[active] ?? results[0]); }
  };

  return (
    <div className="search" style={{ position: 'relative' }}>
      <input
        aria-label="search nodes"
        placeholder="Search nodes…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {open && results.length > 0 && (
        <ul
          className="search-results"
          style={{ position: 'absolute', zIndex: 10, background: '#fff', border: '1px solid #ccc', margin: 0, padding: 0, listStyle: 'none', maxHeight: 280, overflowY: 'auto', minWidth: 220 }}
        >
          {results.map((n, i) => (
            <li
              key={n.id}
              onMouseDown={(e) => { e.preventDefault(); pick(n); }}
              onMouseEnter={() => setActive(i)}
              style={{ padding: '2px 8px', cursor: 'pointer', background: i === active ? '#eef' : undefined }}
            >
              {n.name} <small>· {n.type}{nameOf(n.parentId) ? ` · ${nameOf(n.parentId)}` : ''}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
