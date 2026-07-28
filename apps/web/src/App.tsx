import { useEffect, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { useStore } from './store';
import { loadModel } from './api';
import { breadcrumbPath } from './focusView';
import { parseHash, routeToHash, routeOfState, resolveHashRoute, ROOT_ROUTE, type Route } from './hashRoute';
import { c4Backend, allowedChildTypes, topLevelTypes } from '@hyphae/schema';
import { Canvas } from './Canvas';
import { SidePanel } from './SidePanel';
import { TreePanel } from './TreePanel';
import { SearchBox } from './SearchBox';
import './styles.css';

/** Put the store into the state a route describes. A pattern or a flow is a selection (the flow's
 *  own first step then decides the focus, see `selectFlow`); a node route is a plain focus with any
 *  flow/pattern selection dropped — the URL names exactly one view at a time. */
function applyRoute(route: Route) {
  const { setFocus, selectFlow, selectPattern } = useStore.getState();
  if (route.kind === 'pattern') { selectPattern(route.id); return; }
  if (route.kind === 'flow') { selectFlow(route.id); return; }
  selectFlow(null); // the store keeps flow/pattern mutually exclusive, so this clears both
  setFocus(route.kind === 'node' ? route.id : null);
}

/** Adopt the URL hash as the current view, validated against the loaded model. A hash naming an
 *  unknown node/flow/pattern (stale, hand-typed, or a pre-Cluster-E bare `#<id>` link) rewrites the
 *  URL to root instead of showing a blank canvas; replaceState (not push) keeps it out of history. */
function applyHashRoute() {
  const { model } = useStore.getState();
  const { route, rewrite } = resolveHashRoute(window.location.hash, {
    node: (id) => model.nodes.some((n) => n.id === id),
    flow: (id) => model.flows.some((f) => f.id === id),
    pattern: (id) => model.patterns.some((p) => p.id === id),
  });
  if (rewrite) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  applyRoute(route);
}

export function App() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const setModel = useStore((s) => s.setModel);
  const addNode = useStore((s) => s.addNode);
  const audience = useStore((s) => s.audience);
  const setAudience = useStore((s) => s.setAudience);

  // The outline panel is collapsible from both ends: the « button drives the panel's imperative
  // API, and dragging the separator to the edge collapses it too. onResize is the single source of
  // truth for the flag, read via isCollapsed() rather than a size threshold — a window too narrow
  // to honour every min size can squeeze the panel under collapsedSize without the panel actually
  // being collapsed. onResize also fires on the layout the group restores from localStorage at
  // mount, so a reload landing on a drag-collapsed width renders the 26px strip instead of the full
  // tree clipped inside it. Under jsdom the library's ResizeObserver never fires (test/setup.ts
  // stubs `observe()` as a no-op), so toggleOutline reads isCollapsed() back itself rather than
  // relying on onResize to catch up — that keeps the flag correct in both the browser and tests.
  const outlineRef = usePanelRef();
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const bodyLayout = useDefaultLayout({
    id: 'hyphae.body',
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });

  const toggleOutline = () => {
    if (outlineCollapsed) outlineRef.current?.expand();
    else outlineRef.current?.collapse();
    setOutlineCollapsed(outlineRef.current?.isCollapsed() ?? !outlineCollapsed);
  };

  useEffect(() => {
    loadModel()
      .then(({ model, version }) => {
        setModel(model, version);
        // Validate the deep-linked view now that the model is loaded (see applyHashRoute).
        applyHashRoute();
      })
      .catch((e) => console.error('load failed', e));
    const es = new EventSource('/events');
    es.addEventListener('changed', (e) => {
      const version = Number((e as MessageEvent).data);
      if (version > useStore.getState().ownVersion) void useStore.getState().syncFromServer();
    });
    return () => es.close();
  }, [setModel]);

  // Keep the current view — focused node, selected flow, or selected pattern — in the URL hash:
  // refresh restores it and the browser Back button walks the history. The store stays the source
  // of truth; the hash mirrors it.
  useEffect(() => {
    // store → URL: a route change the URL doesn't already reflect becomes a history entry. Compared
    // as hashes so a focus change *within* a selected flow (same route) pushes nothing.
    const hashOf = (s: Parameters<typeof routeOfState>[0]) => routeToHash(routeOfState(s));
    const unsub = useStore.subscribe((s, prev) => {
      const next = hashOf(s);
      if (next === hashOf(prev)) return;
      if (routeToHash(parseHash(window.location.hash) ?? ROOT_ROUTE) === next) return;
      window.history.pushState(null, '', next || window.location.pathname + window.location.search);
    });

    // URL → store: Back/Forward and manual hash edits, validated against the model. pushState
    // above fires neither event, so this never echoes back into a push.
    const onNav = () => applyHashRoute();
    window.addEventListener('popstate', onNav);
    window.addEventListener('hashchange', onNav);
    return () => {
      unsub();
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
    };
  }, []);

  const crumbs = breadcrumbPath(model, focusId);
  const focusNode = focusId ? model.nodes.find((n) => n.id === focusId) : null;
  const addable = focusNode ? allowedChildTypes(c4Backend, focusNode.type) : topLevelTypes(c4Backend);

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Hyphae</strong>
        <nav className="breadcrumbs" aria-label="breadcrumbs">
          {crumbs.map((c, i) => (
            <span key={c.id ?? '__root__'}>
              {i > 0 && <span className="crumb-sep"> › </span>}
              <button className="crumb" onClick={() => setFocus(c.id)}>{c.name}</button>
            </span>
          ))}
        </nav>
        {addable.map((t) => (
          <button key={t} onClick={() => addNode(t)}>add {t}</button>
        ))}
        <SearchBox />
        <div className="audience-toggle" role="group" aria-label="detail level" style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['stakeholder', 'full'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAudience(a)}
              aria-pressed={audience === a}
              style={{ fontWeight: audience === a ? 700 : 400, textTransform: 'capitalize' }}
            >
              {a}
            </button>
          ))}
        </div>
      </header>
      <Group
        className="body"
        id="hyphae-body"
        orientation="horizontal"
        defaultLayout={bodyLayout.defaultLayout}
        onLayoutChanged={bodyLayout.onLayoutChanged}
      >
        <Panel
          id="outline"
          panelRef={outlineRef}
          defaultSize={240}
          minSize={160}
          maxSize="40%"
          collapsible
          collapsedSize={26}
          groupResizeBehavior="preserve-pixel-size"
          style={{ overflow: 'hidden', display: 'flex' }}
          onResize={() => setOutlineCollapsed(outlineRef.current?.isCollapsed() ?? false)}
        >
          <TreePanel collapsed={outlineCollapsed} onToggleCollapse={toggleOutline} />
        </Panel>
        <Separator className="sep sep--v" />
        {/* The canvas is the group's one preserve-relative-size panel, so it absorbs window
            resizes while the side panels keep their pixel width. */}
        <Panel id="canvas" minSize="20%" style={{ overflow: 'hidden', display: 'flex' }}>
          <Canvas />
        </Panel>
        <Separator className="sep sep--v" />
        <Panel
          id="inspector"
          defaultSize={320}
          minSize={220}
          maxSize="40%"
          groupResizeBehavior="preserve-pixel-size"
          style={{ overflow: 'hidden', display: 'flex' }}
        >
          <SidePanel />
        </Panel>
      </Group>
    </div>
  );
}
