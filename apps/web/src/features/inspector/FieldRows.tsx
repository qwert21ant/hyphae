import type { FieldDef, Node } from '@hyphae/schema';
import { fieldLayout, type FieldLayout } from './fieldLayout';

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

/** A labelled value, in one of two treatments: a scannable grid row for a scalar, or a stacked
 *  block at full panel width for prose or a list. `fieldLayout()` decides which. */
export function Row({ label, title, layout = 'grid', children }: {
  label: string; title?: string; layout?: FieldLayout; children: React.ReactNode;
}) {
  if (layout === 'stack') {
    return (
      <div className="field field--stack" title={title}>
        <span className="field__label hy-micro">{label}</span>
        <div className="field__value">{children}</div>
      </div>
    );
  }
  return (
    <div className="field field--grid" title={title}>
      <span className="field__label hy-micro">{label}</span>
      <span className="field__value">{children}</span>
    </div>
  );
}

/** A list value, one entry per line — the read-only form of the old newline-separated textarea.
 *  Renders nothing when empty, so an unfilled list costs no vertical space. Always stacked: entries
 *  need their own lines, so a grid treatment makes no sense here. */
export function ListRow({ label, title, items }: { label: string; title?: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="field field--stack" title={title}>
      <span className="field__label hy-micro">{label}</span>
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
    // node.fields is loosely-typed model JSON; an agent can write a bare string into a list-typed
    // field. Render it as the one item it evidently means, rather than crashing on `.map`.
    const items = Array.isArray(value) ? value.map(String) : [String(value)];
    return <ListRow label={label} title={def.description} items={items} />;
  }
  const layout = fieldLayout(def.type, value);
  if (def.type === 'ref') {
    return (
      <Row label={label} title={def.description} layout={layout}>
        <NodeLink id={String(value)} nodes={nodes} onNavigate={onNavigate} />
      </Row>
    );
  }
  return (
    <Row label={label} title={def.description} layout={layout}>
      {def.type === 'boolean' ? (value ? 'yes' : 'no') : String(value)}
    </Row>
  );
}
