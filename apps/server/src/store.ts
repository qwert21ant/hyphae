import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  HyphaeModelSchema, NodeSchema, ConnectionSchema, FlowSchema, PatternSchema, emptyModel, newId, now,
  newIssues, resolveProfile,
  type HyphaeModel, type Node, type Connection, type Flow, type Pattern, type PatternMember, type PatternTransition, type Position,
} from '@hyphae/schema';
import { ValidationError, NotFoundError } from './errors';

const DEBOUNCE_MS = 500;

export type NodeInput = Partial<Node> & { name: string; type: string };
export type ConnectionInput = Partial<Connection> & { from: string; to: string; type: string };
export type FlowInput = Partial<Flow> & { name: string };
// `members`/`transitions` entries carry zod-defaulted fields (e.g. `description`) that need not be
// supplied by callers — only the name-bearing keys are required; the rest fill in at parse time.
export type PatternInput = Partial<Omit<Pattern, 'members' | 'transitions'>> & {
  name: string;
  kind: string;
  members?: Array<Partial<PatternMember> & { name: string }>;
  transitions?: Array<Partial<PatternTransition> & { from: string; to: string }>;
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
    }, { ignoreFlowRefs: true });
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
    this.commit({ ...this.model, connections: this.model.connections.filter((c) => c.id !== id) }, { ignoreFlowRefs: true });
  }

  addFlow(input: FlowInput): Flow {
    const flow = FlowSchema.parse({ ...input, id: input.id ?? newId() });
    this.commit({ ...this.model, flows: [...this.model.flows, flow] });
    return flow;
  }

  updateFlow(id: string, patch: Partial<Flow>): Flow {
    const existing = this.model.flows.find((f) => f.id === id);
    if (!existing) throw new NotFoundError(`flow ${id} not found`);
    const updated = FlowSchema.parse({ ...existing, ...patch, id });
    this.commit({ ...this.model, flows: this.model.flows.map((f) => (f.id === id ? updated : f)) });
    return updated;
  }

  deleteFlow(id: string): void {
    if (!this.model.flows.some((f) => f.id === id)) throw new NotFoundError(`flow ${id} not found`);
    this.commit({ ...this.model, flows: this.model.flows.filter((f) => f.id !== id) });
  }

  addPattern(input: PatternInput): Pattern {
    const pattern = PatternSchema.parse({ ...input, id: input.id ?? newId() });
    this.commit({ ...this.model, patterns: [...this.model.patterns, pattern] });
    return pattern;
  }

  updatePattern(id: string, patch: Partial<Pattern>): Pattern {
    const existing = this.model.patterns.find((p) => p.id === id);
    if (!existing) throw new NotFoundError(`pattern ${id} not found`);
    const updated = PatternSchema.parse({ ...existing, ...patch, id });
    this.commit({ ...this.model, patterns: this.model.patterns.map((p) => (p.id === id ? updated : p)) });
    return updated;
  }

  deletePattern(id: string): void {
    if (!this.model.patterns.some((p) => p.id === id)) throw new NotFoundError(`pattern ${id} not found`);
    this.commit({ ...this.model, patterns: this.model.patterns.filter((p) => p.id !== id) });
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

  /** Validate the candidate model; reject if it adds an issue, else commit + bump + save + notify.
   *  `ignoreFlowRefs` lets a node/connection delete proceed even if it strands a flow step or a
   *  pattern's node reference — the flow/pattern is left flagged-invalid (spec: deletes mark
   *  flows/patterns invalid, they do not block on them). */
  private commit(next: HyphaeModel, opts: { ignoreFlowRefs?: boolean } = {}): void {
    let issues = newIssues(this.model, next, resolveProfile(next));
    if (opts.ignoreFlowRefs) {
      issues = issues.filter((i) => i.kind !== 'bad-flow-endpoint' && i.kind !== 'bad-flow-via'
        && i.kind !== 'pattern-member-bad-node' && i.kind !== 'pattern-bad-anchor' && i.kind !== 'pattern-unanchored-ref');
    }
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
