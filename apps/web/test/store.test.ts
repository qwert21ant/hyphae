import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/store';
import { emptyModel } from '@hyphae/schema';

beforeEach(() => useStore.getState().setModel(emptyModel()));

describe('editor store', () => {
  it('adds a node on the active layer', () => {
    useStore.getState().setLayer('Component');
    useStore.getState().addNode('Component');
    const { model } = useStore.getState();
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].type).toBe('Component');
  });

  it('updates a node field', () => {
    useStore.getState().addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    useStore.getState().updateNode(id, { name: 'Renamed' });
    expect(useStore.getState().model.nodes[0].name).toBe('Renamed');
  });

  it('deletes a node and its connections', () => {
    const s = useStore.getState();
    s.addNode('Component');
    s.addNode('Component');
    const [a, b] = useStore.getState().model.nodes.map((n) => n.id);
    s.addConnection(a, b);
    s.deleteNode(a);
    const m = useStore.getState().model;
    expect(m.nodes).toHaveLength(1);
    expect(m.connections).toHaveLength(0);
  });

  it('stores node position in the layer view', () => {
    const s = useStore.getState();
    s.setLayer('Component');
    s.addNode('Component');
    const id = useStore.getState().model.nodes[0].id;
    s.setNodePosition(id, { x: 10, y: 20 });
    const view = useStore.getState().model.views.find((v) => v.layer === 'Component');
    expect(view?.nodePositions[id]).toEqual({ x: 10, y: 20 });
  });
});
