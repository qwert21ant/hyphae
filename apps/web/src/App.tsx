import { useEffect } from 'react';
import { useStore } from './store';
import { loadModel } from './api';
import { breadcrumbPath } from './focusView';
import { c4Backend, allowedChildTypes, topLevelTypes } from '@hyphae/schema';
import { Canvas } from './Canvas';
import { SidePanel } from './SidePanel';
import './styles.css';

export function App() {
  const model = useStore((s) => s.model);
  const focusId = useStore((s) => s.focusId);
  const setFocus = useStore((s) => s.setFocus);
  const setModel = useStore((s) => s.setModel);
  const addNode = useStore((s) => s.addNode);

  useEffect(() => {
    loadModel()
      .then(({ model, version }) => setModel(model, version))
      .catch((e) => console.error('load failed', e));
    const es = new EventSource('/events');
    es.addEventListener('changed', (e) => {
      const version = Number((e as MessageEvent).data);
      if (version > useStore.getState().ownVersion) void useStore.getState().syncFromServer();
    });
    return () => es.close();
  }, [setModel]);

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
