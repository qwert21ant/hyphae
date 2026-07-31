import { useMemo, useState } from 'react';
import { validateModel, resolveProfile, type Node, type Flow, type Pattern } from '@hyphae/schema';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { useStore } from '@/state/store';

/** The whole model as an outline: nodes by containment, then Flows and Patterns. This is the one
 *  place flows and patterns are selected from (it replaced the floating canvas pickers), and the
 *  only surface that can navigate to a step or a pattern member — the canvas can only show what
 *  fits in the current view. */

type TreeItem = { node: Node; children: TreeItem[] };

/** Nodes nested by `parentId`, in model order. A node whose parent id doesn't resolve is a root,
 *  so nothing can be orphaned out of the outline. */
function buildTree(nodes: Node[]): TreeItem[] {
  const items = new Map<string, TreeItem>(nodes.map((n) => [n.id, { node: n, children: [] }]));
  const roots: TreeItem[] = [];
  for (const n of nodes) {
    const item = items.get(n.id)!;
    const parent = n.parentId ? items.get(n.parentId) : undefined;
    if (parent && parent !== item) parent.children.push(item);
    else roots.push(item);
  }
  return roots;
}

/** The focus and every ancestor of it — the branch the tree opens by itself, so the current view
 *  is always visible in the outline without the user hunting for it. */
function ancestorsOf(nodes: Node[], focusId: string | null): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const open = new Set<string>();
  let cur = focusId ? byId.get(focusId) : undefined;
  while (cur && !open.has(cur.id)) {
    open.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return open;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tree-section">
      <div className="tree-section__title hy-micro">{title}</div>
      {children}
    </div>
  );
}

export function TreePanel({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const selectedId = useStore((s) => s.selectedId);
  const selectedFlowId = useStore((s) => s.selectedFlowId);
  const selectedPatternId = useStore((s) => s.selectedPatternId);
  const offViewStepOrders = useStore((s) => s.offViewStepOrders);
  const setFocus = useStore((s) => s.setFocus);
  const revealNode = useStore((s) => s.revealNode);
  const revealStep = useStore((s) => s.revealStep);
  const selectFlow = useStore((s) => s.selectFlow);
  const selectPattern = useStore((s) => s.selectPattern);

  // Explicit twisty clicks, layered over the auto-opened focus branch (so both can be overridden).
  const [override, setOverride] = useState<Record<string, boolean>>({});

  const roots = useMemo(() => buildTree(model.nodes), [model.nodes]);
  const autoOpen = useMemo(() => ancestorsOf(model.nodes, focusId), [model.nodes, focusId]);
  const nodeName = useMemo(() => new Map(model.nodes.map((n) => [n.id, n.name])), [model.nodes]);
  const invalid = useMemo(() => {
    const issues = validateModel(model, resolveProfile(model));
    return {
      flows: new Set(issues.filter((i) => i.kind.startsWith('bad-flow-')).map((i) => i.ref)),
      patterns: new Set(issues.filter((i) => i.kind.startsWith('pattern-')).map((i) => i.ref)),
    };
  }, [model]);
  const offView = useMemo(() => new Set(offViewStepOrders), [offViewStepOrders]);
  const outlineLayout = useDefaultLayout({
    id: 'hyphae.outline',
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });

  if (collapsed) {
    return (
      <aside className="tree-panel tree-panel--collapsed">
        <button className="tree-toggle" onClick={onToggleCollapse} title="Show model outline" aria-label="show model outline">»</button>
      </aside>
    );
  }

  const rowClass = (active: boolean, current: boolean) =>
    `tree-row${active ? ' tree-row--active' : ''}${current ? ' tree-row--current' : ''}`;

  const renderNode = (item: TreeItem, depth: number): React.ReactNode => {
    const { node, children } = item;
    const open = override[node.id] ?? autoOpen.has(node.id);
    return (
      <div key={node.id}>
        {/* The ROW carries the gesture, not the label: click selects the node in context,
            double-click drills into it — the canvas's gesture. The label stays a <button> so the
            row is still reachable and operable from the keyboard; its click simply bubbles here. */}
        <div
          className={rowClass(node.id === selectedId, node.id === focusId)}
          onClick={() => revealNode(node.id)}
          onDoubleClick={() => setFocus(node.id)}
        >
          {Array.from({ length: depth }, (_, i) => <span key={i} className="tree-guide" />)}
          {children.length > 0 ? (
            <button
              className="tree-twisty"
              // Expanding a branch is not selecting it — without this the twisty would also
              // reveal the node, since the row is now listening.
              onClick={(ev) => { ev.stopPropagation(); setOverride((o) => ({ ...o, [node.id]: !open })); }}
              aria-expanded={open}
              aria-label={`${open ? 'collapse' : 'expand'} ${node.name}`}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="tree-twisty" />
          )}
          <button className="tree-label" title={`${node.name} · ${node.type}`}>
            {node.name}
          </button>
        </div>
        {open && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const renderFlow = (f: Flow) => {
    const selected = f.id === selectedFlowId;
    return (
      <div key={f.id}>
        <div className={`${rowClass(selected, false)} tree-row--detail`} onClick={() => selectFlow(selected ? null : f.id)}>
          <span className="tree-twisty" />
          <button className="tree-label" aria-pressed={selected}>
            {f.name}{invalid.flows.has(f.id) ? <span className="tree-invalid" title="references something missing"> ⚠</span> : ''}
          </button>
        </div>
        {selected && (
          <ol className="tree-steps">
            {[...f.steps].sort((a, b) => a.order - b.order).map((s) => (
              <li
                key={s.order}
                className={s.kind === 'Return' ? 'tree-step tree-step--return' : 'tree-step'}
                onClick={() => revealStep(s)}
                title={`${nodeName.get(s.from) ?? s.from} → ${nodeName.get(s.to) ?? s.to}`}
              >
                <span className="tree-step__order">{s.order}.</span>
                <button className="tree-label">
                  {s.message || <em>(no caption)</em>}
                  {/* ↗ = the current view can't draw this step; clicking it moves the view there. */}
                  {offView.has(s.order) ? <span className="tree-offview" title="not drawn in this view"> ↗</span> : null}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  const renderPattern = (p: Pattern) => {
    const selected = p.id === selectedPatternId;
    const anchorName = p.anchor ? nodeName.get(p.anchor) : undefined;
    return (
      <div key={p.id}>
        <div className={`${rowClass(selected, false)} tree-row--detail`} onClick={() => selectPattern(selected ? null : p.id)}>
          <span className="tree-twisty" />
          <button className="tree-label" aria-pressed={selected}>
            {p.name}{invalid.patterns.has(p.id) ? <span className="tree-invalid" title="references something missing"> ⚠</span> : null}
          </button>
          <span className="chip tree-kind" title={`${p.kind} pattern`}>{p.kind}</span>
          {/* The pattern view replaces the canvas, so the anchor is the way back to the node it
              describes — and knowing WHICH node a pattern is about should not require opening it, so
              it sits on the row. stopPropagation because the row toggles the pattern and this
              navigates away from it; without it one click would do both. A dangling anchor still
              shows, marked, rather than silently vanishing. */}
          {p.anchor && (anchorName
            ? (
              <button
                className="tree-anchor"
                onClick={(ev) => { ev.stopPropagation(); revealNode(p.anchor!); }}
                title={`Go to ${anchorName} — the node this pattern describes`}
              >
                → {anchorName}
              </button>
            )
            : (
              <span className="tree-anchor tree-dim" title="references something missing">
                → {p.anchor}<span className="tree-invalid"> ⚠</span>
              </span>
            ))}
        </div>
        {selected && (
          <ul className="tree-members">
            {p.members.map((m) => {
              const bound = m.nodeId && nodeName.has(m.nodeId) ? m.nodeId : null;
              return (
                <li
                  key={m.name}
                  className={bound ? 'tree-member tree-member--link' : 'tree-member'}
                  onClick={bound ? () => revealNode(bound) : undefined}
                  title={bound ? `Go to ${nodeName.get(bound)}` : undefined}
                >
                  {bound
                    ? <button className="tree-label">{m.name}</button>
                    : <span className="tree-member--static">{m.name}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const nodesSection = (
    <Section title="Nodes">
      {roots.length === 0
        ? <div className="tree-empty">no nodes yet</div>
        : roots.map((r) => renderNode(r, 0))}
    </Section>
  );
  const detailSections = (
    <>
      {model.flows.length > 0 && <Section title="Flows">{model.flows.map(renderFlow)}</Section>}
      {model.patterns.length > 0 && <Section title="Patterns">{model.patterns.map(renderPattern)}</Section>}
    </>
  );
  // A long node tree used to push Flows and Patterns below the fold of a single scroll region, so
  // they get their own. Percentage sizes keep the split proportional as the window height changes.
  // With neither flows nor patterns there is nothing to split, and a Group of one Panel would only
  // add a dead handle — so the body renders plainly, as it always did.
  const hasDetail = model.flows.length > 0 || model.patterns.length > 0;

  return (
    <aside className="tree-panel" aria-label="model outline">
      <div className="tree-panel__head">
        <span className="tree-panel__title">Outline</span>
        <button className="tree-toggle" onClick={onToggleCollapse} title="Hide model outline" aria-label="hide model outline">«</button>
      </div>
      {hasDetail ? (
        <div className="tree-panel__body tree-panel__body--split">
          <Group
            id="hyphae-outline"
            orientation="vertical"
            defaultLayout={outlineLayout.defaultLayout}
            onLayoutChanged={outlineLayout.onLayoutChanged}
          >
            <Panel id="hyphae-pane-nodes" defaultSize="60" minSize="15" className="tree-split__pane">
              {nodesSection}
            </Panel>
            <Separator className="sep sep--h" aria-label="resize node list" />
            <Panel id="hyphae-pane-detail" defaultSize="40" minSize="15" className="tree-split__pane tree-split__pane--detail">
              {detailSections}
            </Panel>
          </Group>
        </div>
      ) : (
        <div className="tree-panel__body">{nodesSection}</div>
      )}
    </aside>
  );
}
