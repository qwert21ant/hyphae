import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PatternMemberData } from './patternView';
import { NODE_W, NODE_H } from './layout';
import { useStore } from './store';

const BINDING_COLOR: Record<PatternMemberData['binding'], { bg: string; border: string; tag: string }> = {
  node: { bg: '#f0fdf4', border: '#16a34a', tag: 'node' },
  ref: { bg: '#fefce8', border: '#ca8a04', tag: 'ref' },
  none: { bg: '#f8fafc', border: '#94a3b8', tag: '' },
};

export function PatternMemberNode({ data }: NodeProps) {
  const d = data as PatternMemberData;
  const c = BINDING_COLOR[d.binding] ?? BINDING_COLOR.none;
  const revealNode = useStore((s) => s.revealNode);
  // Only a member bound to a node that exists is navigable. Navigate by nodeId: this box's React
  // Flow id is the MEMBER NAME, so it is never a valid focus target.
  const goto = d.nodeId;
  return (
    <div
      role={goto ? 'button' : undefined}
      tabIndex={goto ? 0 : undefined}
      title={goto ? `Go to ${d.detail}` : undefined}
      // stopPropagation: the canvas click stream would otherwise also select this box by member name.
      onClick={goto ? (ev) => { ev.stopPropagation(); revealNode(goto); } : undefined}
      onKeyDown={goto ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); revealNode(goto); } } : undefined}
      style={{
        width: NODE_W, height: NODE_H, padding: '6px 10px', boxSizing: 'border-box',
        border: `1px solid ${c.border}`, background: c.bg, borderRadius: 6,
        fontSize: 12, lineHeight: 1.25, textAlign: 'center',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden',
        cursor: goto ? 'pointer' : 'default',
      }}
    >
      <Handle id="l" type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle id="t" type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle id="r" type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: 'none' }} />
      <Handle id="b" type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: 'none' }} />
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
      {d.detail && (
        <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {c.tag ? `${c.tag}: ` : ''}{d.detail}
        </div>
      )}
      {d.description && (
        <div style={{ fontSize: 9, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.description}</div>
      )}
    </div>
  );
}
