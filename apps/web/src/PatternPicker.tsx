import { useMemo } from 'react';
import { validateModel, resolveProfile } from '@hyphae/schema';
import { useStore } from './store';

/** Lists authored patterns; selecting one draws its shape on the canvas. A pattern that
 *  fails validation (unknown kind, bad member/anchor/ref, bad transition) is marked ⚠. */
export function PatternPicker() {
  const model = useStore((s) => s.model);
  const selectedPatternId = useStore((s) => s.selectedPatternId);
  const selectPattern = useStore((s) => s.selectPattern);

  const invalid = useMemo(() => {
    const issues = validateModel(model, resolveProfile(model));
    return new Set(issues.filter((i) => i.kind.startsWith('pattern-')).map((i) => i.ref));
  }, [model]);

  if (model.patterns.length === 0) return null;
  const selected = model.patterns.find((p) => p.id === selectedPatternId) ?? null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', minWidth: 180 }}>
      <div style={{ padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Patterns</div>
      <div style={{ padding: 4 }}>
        {model.patterns.map((p) => (
          <button
            key={p.id}
            onClick={() => selectPattern(p.id === selectedPatternId ? null : p.id)}
            aria-pressed={p.id === selectedPatternId}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', border: 'none', borderRadius: 4, cursor: 'pointer', background: p.id === selectedPatternId ? '#dbeafe' : 'transparent', fontWeight: p.id === selectedPatternId ? 600 : 400 }}
          >
            {p.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>· {p.kind}</span>{invalid.has(p.id) ? ' ⚠' : ''}
          </button>
        ))}
      </div>
      {selected && (
        <ol style={{ margin: 0, padding: '4px 8px 8px 24px', lineHeight: 1.5 }}>
          {selected.members.map((m) => (
            <li key={m.name}>{m.name}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
