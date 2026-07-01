import { useEffect } from 'react';
import { useStore } from './store';
import { loadModel } from './api';
import { breadcrumbPath } from './focusView';
import { hashToFocusId, focusIdToHash, resolveHashFocus } from './hashRoute';
import { c4Backend, allowedChildTypes, topLevelTypes } from '@hyphae/schema';
import { Canvas } from './Canvas';
import { SidePanel } from './SidePanel';
import './styles.css';

/** Adopt the URL hash as the focus, validated against the loaded model. A hash naming an
 *  unknown node (stale or hand-typed) rewrites the URL to root instead of showing a blank
 *  canvas; replaceState (not push) keeps the bad URL out of history. */
function applyHashFocus() {
  const { model, setFocus } = useStore.getState();
  const { focusId, rewrite } = resolveHashFocus(window.location.hash, (id) => model.nodes.some((n) => n.id === id));
  if (rewrite) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  setFocus(focusId);
}

export function App() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const setModel = useStore((s) => s.setModel);
  const addNode = useStore((s) => s.addNode);

  useEffect(() => {
    loadModel()
      .then(({ model, version }) => {
        setModel(model, version);
        // Validate the deep-linked focus now that the model is loaded (see applyHashFocus).
        applyHashFocus();
      })
      .catch((e) => console.error('load failed', e));
    const es = new EventSource('/events');
    es.addEventListener('changed', (e) => {
      const version = Number((e as MessageEvent).data);
      if (version > useStore.getState().ownVersion) void useStore.getState().syncFromServer();
    });
    return () => es.close();
  }, [setModel]);

  // Keep the focused node in the URL hash: refresh restores it and the browser Back button
  // walks focus history. The store stays the source of truth; the hash mirrors it.
  useEffect(() => {
    const initial = hashToFocusId(window.location.hash);
    if (initial) useStore.getState().setFocus(initial);

    // store → URL: a focus change the URL doesn't already reflect becomes a history entry.
    const unsub = useStore.subscribe((s, prev) => {
      if (s.focusId === prev.focusId) return;
      if (hashToFocusId(window.location.hash) === s.focusId) return;
      const url = focusIdToHash(s.focusId) || window.location.pathname + window.location.search;
      window.history.pushState(null, '', url);
    });

    // URL → store: Back/Forward and manual hash edits, validated against the model. pushState
    // above fires neither event, so this never echoes back into a push.
    const onNav = () => applyHashFocus();
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
      </header>
      <div className="body">
        <Canvas />
        <SidePanel />
      </div>
    </div>
  );
}
