import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  HyphaeModelSchema, NodeSchema, ConnectionSchema, emptyModel, newId, now,
  newIssues, resolveProfile,
  type HyphaeModel, type Node, type Connection, type Position,
} from '@hyphae/schema';
import { ValidationError, NotFoundError } from './errors';

const DEBOUNCE_MS = 500;

export type NodeInput = Partial<Node> & { name: string; type: string };
export type ConnectionInput = Partial<Connection> & {
  from: string;
  to: string;
  relationCategory: Connection['relationCategory'];
};

export class ModelStore {
  private model: HyphaeModel;
  private timer: NodeJS.Timeout | null = null;
  private _version = 0;
  private listeners = new Set<(version: number) => void>();

  constructor(private readonly file: string) {
    this.model = existsSync(file)
      ? HyphaeModelSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
      : emptyModel();
  }

  get(): HyphaeModel {
    return this.model;
  }

  get version(): number {
    return this._version;
  }

  subscribe(listener: (version: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addNode(input: NodeInput): Node {
    const ts = now();
    const node = NodeSchema.parse({ ...input, id: input.id ?? newId(), createdAt: ts, updatedAt: ts });
    this.commit({ ...this.model, nodes: [...this.model.nodes, node] });
    return node;
  }

  updateNode(id: string, patch: Partial<Node>): Node {
    const existing = this.model.nodes.find((n) => n.id === id);
    if (!existing) throw new NotFoundError(`node ${id} not found`);
    const updated = NodeSchema.parse({ ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: now() });
    this.commit({ ...this.model, nodes: this.model.nodes.map((n) => (n.id === id ? updated : n)) });
    return updated;
  }

  deleteNode(id: string): void {
    if (!this.model.nodes.some((n) => n.id === id)) throw new NotFoundError(`node ${id} not found`);
    this.commit({
      ...this.model,
      nodes: this.model.nodes.filter((n) => n.id !== id),
      connections: this.model.connections.filter((c) => c.from !== id && c.to !== id),
    });
  }

  addConnection(input: ConnectionInput): Connection {
    const conn = ConnectionSchema.parse({ ...input, id: input.id ?? newId() });
    this.commit({ ...this.model, connections: [...this.model.connections, conn] });
    return conn;
  }

  updateConnection(id: string, patch: Partial<Connection>): Connection {
    const existing = this.model.connections.find((c) => c.id === id);
    if (!existing) throw new NotFoundError(`connection ${id} not found`);
    const updated = ConnectionSchema.parse({ ...existing, ...patch, id });
    this.commit({ ...this.model, connections: this.model.connections.map((c) => (c.id === id ? updated : c)) });
    return updated;
  }

  deleteConnection(id: string): void {
    if (!this.model.connections.some((c) => c.id === id)) throw new NotFoundError(`connection ${id} not found`);
    this.commit({ ...this.model, connections: this.model.connections.filter((c) => c.id !== id) });
  }

  setNodePosition(layer: string, nodeId: string, pos: Position): void {
    const views = this.model.views.map((v) => ({ ...v, nodePositions: { ...v.nodePositions } }));
    let view = views.find((v) => v.layer === layer);
    if (!view) {
      view = { id: newId(), name: layer, layer, nodePositions: {} };
      views.push(view);
    }
    view.nodePositions[nodeId] = pos;
    this.commit({ ...this.model, views });
  }

  /** Validate the candidate model; reject if it adds an issue, else commit + bump + save + notify. */
  private commit(next: HyphaeModel): void {
    const issues = newIssues(this.model, next, resolveProfile(next));
    if (issues.length) throw new ValidationError(issues);
    this.model = next;
    this._version += 1;
    this.scheduleSave();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this._version);
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeNow(), DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.writeNow();
  }

  private writeNow(): void {
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.model, null, 2) + '\n', 'utf8');
    renameSync(tmp, this.file);
  }
}
