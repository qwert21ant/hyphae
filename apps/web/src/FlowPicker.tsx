import { useMemo } from 'react';
import { validateModel, resolveProfile } from '@hyphae/schema';
import { useStore } from './store';

/** Lists authored flows; selecting one activates the numbered overlay on the canvas.
 *  A flow whose steps no longer resolve (e.g. a referenced node was deleted) is marked ⚠. */
export function FlowPicker() {
  const model = useStore((s) => s.model);
  const selectedFlowId = useStore((s) => s.selectedFlowId);
  const selectFlow = useStore((s) => s.selectFlow);

  const invalid = useMemo(() => {
    const issues = validateModel(model, resolveProfile(model));
    return new Set(issues.filter((i) => i.kind.startsWith('bad-flow-')).map((i) => i.ref));
  }, [model]);

  if (model.flows.length === 0) return null;
  const selected = model.flows.find((f) => f.id === selectedFlowId) ?? null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, color: '#334155', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', minWidth: 180 }}>
      <div style={{ padding: '5px 8px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Flows</div>
      <div style={{ padding: 4 }}>
        {model.flows.map((f) => (
          <button
            key={f.id}
            onClick={() => selectFlow(f.id === selectedFlowId ? null : f.id)}
            aria-pressed={f.id === selectedFlowId}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px', border: 'none', borderRadius: 4, cursor: 'pointer', background: f.id === selectedFlowId ? '#dbeafe' : 'transparent', fontWeight: f.id === selectedFlowId ? 600 : 400 }}
          >
            {f.name}{invalid.has(f.id) ? ' ⚠' : ''}
          </button>
        ))}
      </div>
      {selected && (
        <ol style={{ margin: 0, padding: '4px 8px 8px 24px', lineHeight: 1.5 }}>
          {[...selected.steps].sort((a, b) => a.order - b.order).map((s) => (
            <li key={s.order} style={{ color: s.kind === 'Return' ? '#64748b' : '#334155' }}>
              {s.message || <em>(no caption)</em>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
