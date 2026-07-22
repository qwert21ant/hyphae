import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PatternMemberData } from './patternView';
import { NODE_W, NODE_H } from './layout';

const BINDING_COLOR: Record<PatternMemberData['binding'], { bg: string; border: string; tag: string }> = {
  node: { bg: '#f0fdf4', border: '#16a34a', tag: 'node' },
  ref: { bg: '#fefce8', border: '#ca8a04', tag: 'ref' },
  none: { bg: '#f8fafc', border: '#94a3b8', tag: '' },
};

export function PatternMemberNode({ data }: NodeProps) {
  const d = data as PatternMemberData;
  const c = BINDING_COLOR[d.binding] ?? BINDING_COLOR.none;
  return (
    <div
      style={{
        width: NODE_W, height: NODE_H, padding: '6px 10px', boxSizing: 'border-box',
        border: `1px solid ${c.border}`, background: c.bg, borderRadius: 6,
        fontSize: 12, lineHeight: 1.25, textAlign: 'center',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, overflow: 'hidden',
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
