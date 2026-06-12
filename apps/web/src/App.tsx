import { useEffect } from 'react';
import { useStore, layers, layerTypes } from './store';
import { loadModel } from './api';
import { Canvas } from './Canvas';
import { SidePanel } from './SidePanel';
import './styles.css';

export function App() {
  const layer = useStore((s) => s.layer);
  const setLayer = useStore((s) => s.setLayer);
  const setModel = useStore((s) => s.setModel);
  const addNode = useStore((s) => s.addNode);
  const types = layerTypes(layer);

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

  return (
    <div className="app">
      <header className="toolbar">
        <strong>Hyphae</strong>
        <label>
          layer{' '}
          <select aria-label="layer" value={layer} onChange={(e) => setLayer(e.target.value)}>
            {layers.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        {types.map((t) => (
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
