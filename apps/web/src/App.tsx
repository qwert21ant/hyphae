import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { useStore } from './store';
import { loadModel } from './api';
import { breadcrumbPath } from './focusView';
import { parseHash, routeToHash, routeOfState, resolveHashRoute, ROOT_ROUTE, type Route } from './hashRoute';
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
/** The outline panel's collapsed strip width and its minimum expanded width — kept as named
 *  constants (rather than bare literals in the `Panel` props and the `rememberOutlineWidth` guard)
 *  so the guard can never drift out of sync with what the panel is actually configured with. */
const OUTLINE_COLLAPSED_SIZE = 26;
const OUTLINE_MIN_SIZE = 160;

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
  //
  // The library's own expand() only restores the width collapse() last recorded (its
  // `expandToSize`, verified in dist/), and that bookkeeping is never touched by a drag that
  // collapses the panel directly — so expand() falls back to minSize after a drag-collapse, and
  // even after a button-collapse the memory doesn't survive a reload. We keep our own record
  // instead: onResize's third argument is the size the panel had just before this change, so any
  // call landing on a real expanded width (never the 26px collapsed strip) updates both a ref and
  // `localStorage['hyphae.outline.width']`, and expand() is followed by an explicit resize() to
  // that remembered pixel width.
  const outlineRef = usePanelRef();
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const lastOutlineWidth = useRef<number | null>(
    typeof localStorage !== 'undefined' ? Number(localStorage.getItem('hyphae.outline.width')) || null : null,
  );
  const rememberOutlineWidth = (px: number) => {
    // Below OUTLINE_MIN_SIZE the library itself snaps any requested resize back to
    // OUTLINE_COLLAPSED_SIZE (anything under (collapsedSize + minSize) / 2 collapses), so a width in
    // that dead band is never a real expanded width — remembering it would make the next expand()
    // immediately re-collapse. Reject anything below minSize, not just at-or-below collapsedSize.
    if (px < OUTLINE_MIN_SIZE) return;
    lastOutlineWidth.current = px;
    if (typeof localStorage !== 'undefined') localStorage.setItem('hyphae.outline.width', String(Math.round(px)));
  };
  const bodyLayout = useDefaultLayout({
    id: 'hyphae.body',
    storage: localStorage,
    onlySaveAfterUserInteractions: true,
  });

  const toggleOutline = () => {
    if (outlineCollapsed) {
      outlineRef.current?.expand();
      if (lastOutlineWidth.current) outlineRef.current?.resize(lastOutlineWidth.current);
    } else {
      const current = outlineRef.current?.getSize().inPixels;
      if (current) rememberOutlineWidth(current);
      outlineRef.current?.collapse();
    }
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
          id="hyphae-pane-outline"
          panelRef={outlineRef}
          defaultSize={240}
          minSize={OUTLINE_MIN_SIZE}
          maxSize="40%"
          collapsible
          collapsedSize={OUTLINE_COLLAPSED_SIZE}
          groupResizeBehavior="preserve-pixel-size"
          style={{ overflow: 'hidden', display: 'flex' }}
          onResize={(_size, _id, prevSize) => {
            setOutlineCollapsed(outlineRef.current?.isCollapsed() ?? false);
            if (prevSize) rememberOutlineWidth(prevSize.inPixels);
          }}
        >
          <TreePanel collapsed={outlineCollapsed} onToggleCollapse={toggleOutline} />
        </Panel>
        <Separator className="sep sep--v" aria-label="resize outline" />
        {/* The canvas is the group's one preserve-relative-size panel, so it absorbs window
            resizes while the side panels keep their pixel width. */}
        <Panel id="hyphae-pane-canvas" minSize="20%" style={{ overflow: 'hidden', display: 'flex' }}>
          <Canvas />
        </Panel>
        <Separator className="sep sep--v" aria-label="resize inspector" />
        <Panel
          id="hyphae-pane-inspector"
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
