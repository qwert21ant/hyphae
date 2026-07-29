import type { FieldDef, Node } from '@hyphae/schema';

/** Read-only counterparts of the inspector's old editable controls: the model is authored by agents
 *  over MCP, so nothing here writes. Kept out of `SidePanel` because `SidePanel` renders the real
 *  `c4-backend` profile, which defines only `text` and `list` fields — routed through it, the other
 *  four `FieldType`s (`number`, `boolean`, `enum`, `ref`) would have no way to be tested. */

/** Absent, blank, or an empty list. `false` and `0` are values, not absences — omitting them would
 *  make "no" and "zero" indistinguishable from "nobody filled this in". */
export function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0);
}

/** A labelled scalar value. Reuses `.field`'s label/value stack so the panel's rhythm is unchanged
 *  from when this row held an `<input>`. */
export function Row({ label, title, children }: {
  label: string; title?: string; children: React.ReactNode;
}) {
  return (
    <div className="field" title={title}>
      <span>{label}</span>
      <span className="field__value">{children}</span>
    </div>
  );
}

/** A list value, one entry per line — the read-only form of the old newline-separated textarea.
 *  Renders nothing when empty, so an unfilled list costs no vertical space. */
export function ListRow({ label, title, items }: { label: string; title?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="field" title={title}>
      <span>{label}</span>
      <ul className="field__list">
        {items.map((item, i) => <li key={`${i}:${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

/** A node id shown as its clickable name. Losing the ability to *set* a parent or a ref should not
 *  cost the ability to *follow* one. An id that no longer resolves shows dimmed rather than
 *  vanishing — the same treatment `TreePanel` gives a dangling pattern anchor. */
export function NodeLink({ id, nodes, onNavigate }: {
  id: string; nodes: Node[]; onNavigate: (id: string) => void;
}) {
  const target = nodes.find((n) => n.id === id);
  if (!target) return <span className="tree-dim">{id}</span>;
  return <button className="field__link" onClick={() => onNavigate(id)}>{target.name}</button>;
}

/** One profile-defined field, formatted by its declared type. An empty value renders nothing at all:
 *  a short panel is the signal that a node is thinly described, and `model_gaps` is the tool for
 *  auditing that properly. */
export function FieldRow({ def, value, nodes, onNavigate }: {
  def: FieldDef; value: unknown; nodes: Node[]; onNavigate: (id: string) => void;
}) {
  if (isEmptyValue(value)) return null;
  const label = def.label ?? def.key;
  if (def.type === 'list') {
    return <ListRow label={label} title={def.description} items={(value as unknown[]).map(String)} />;
  }
  if (def.type === 'ref') {
    return (
      <Row label={label} title={def.description}>
        <NodeLink id={String(value)} nodes={nodes} onNavigate={onNavigate} />
      </Row>
    );
  }
  return (
    <Row label={label} title={def.description}>
      {def.type === 'boolean' ? (value ? 'yes' : 'no') : String(value)}
    </Row>
  );
}
