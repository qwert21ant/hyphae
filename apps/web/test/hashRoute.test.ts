import { describe, it, expect } from 'vitest';
import { parseHash, routeToHash, routeOfState, resolveHashRoute, ROOT_ROUTE, type Route } from '../src/hashRoute';

describe('hashRoute', () => {
  describe('parseHash', () => {
    it('maps an empty/root hash to the root route', () => {
      expect(parseHash('')).toEqual(ROOT_ROUTE);
      expect(parseHash('#')).toEqual(ROOT_ROUTE);
      expect(parseHash('#  ')).toEqual(ROOT_ROUTE);
    });

    it('reads each prefixed route', () => {
      expect(parseHash('#node/abc-123')).toEqual({ kind: 'node', id: 'abc-123' });
      expect(parseHash('#flow/f1')).toEqual({ kind: 'flow', id: 'f1' });
      expect(parseHash('#pattern/p1')).toEqual({ kind: 'pattern', id: 'p1' });
    });

    it('decodes a percent-encoded id', () => {
      expect(parseHash('#node/a%20b')).toEqual({ kind: 'node', id: 'a b' });
      expect(parseHash('#node/a%2Fb')).toEqual({ kind: 'node', id: 'a/b' });
    });

    it('rejects an unparseable hash (including a legacy bare id)', () => {
      expect(parseHash('#abc-123')).toBeNull();
      expect(parseHash('#node/')).toBeNull();
      expect(parseHash('#thing/x')).toBeNull();
    });
  });

  describe('routeToHash', () => {
    it('turns the root route into an empty hash', () => {
      expect(routeToHash(ROOT_ROUTE)).toBe('');
    });

    it('encodes each kind with its prefix', () => {
      expect(routeToHash({ kind: 'node', id: 'abc-123' })).toBe('#node/abc-123');
      expect(routeToHash({ kind: 'flow', id: 'f1' })).toBe('#flow/f1');
      expect(routeToHash({ kind: 'pattern', id: 'p1' })).toBe('#pattern/p1');
      expect(routeToHash({ kind: 'node', id: 'a b' })).toBe('#node/a%20b');
    });

    it('round-trips any route', () => {
      const routes: Route[] = [
        ROOT_ROUTE,
        { kind: 'node', id: 'plain' },
        { kind: 'node', id: 'with space' },
        { kind: 'node', id: 'weird#frag/slash' },
        { kind: 'flow', id: 'f 1' },
        { kind: 'pattern', id: 'p/1' },
      ];
      for (const r of routes) expect(parseHash(routeToHash(r))).toEqual(r);
    });
  });

  describe('routeOfState', () => {
    it('prefers a pattern, then a flow, then the focus', () => {
      expect(routeOfState({ focusId: 'n1', selectedFlowId: 'f1', selectedPatternId: 'p1' })).toEqual({ kind: 'pattern', id: 'p1' });
      expect(routeOfState({ focusId: 'n1', selectedFlowId: 'f1', selectedPatternId: null })).toEqual({ kind: 'flow', id: 'f1' });
      expect(routeOfState({ focusId: 'n1', selectedFlowId: null, selectedPatternId: null })).toEqual({ kind: 'node', id: 'n1' });
      expect(routeOfState({ focusId: null, selectedFlowId: null, selectedPatternId: null })).toEqual(ROOT_ROUTE);
    });
  });

  describe('resolveHashRoute', () => {
    const exists = { node: (id: string) => ['a', 'b'].includes(id), flow: (id: string) => id === 'f1', pattern: (id: string) => id === 'p1' };

    it('keeps a route naming an existing entity', () => {
      expect(resolveHashRoute('#node/a', exists)).toEqual({ route: { kind: 'node', id: 'a' }, rewrite: false });
      expect(resolveHashRoute('#flow/f1', exists)).toEqual({ route: { kind: 'flow', id: 'f1' }, rewrite: false });
      expect(resolveHashRoute('#pattern/p1', exists)).toEqual({ route: { kind: 'pattern', id: 'p1' }, rewrite: false });
    });

    it('coerces an unknown id to root and asks for a rewrite', () => {
      expect(resolveHashRoute('#node/nope', exists)).toEqual({ route: ROOT_ROUTE, rewrite: true });
      expect(resolveHashRoute('#flow/nope', exists)).toEqual({ route: ROOT_ROUTE, rewrite: true });
      expect(resolveHashRoute('#pattern/nope', exists)).toEqual({ route: ROOT_ROUTE, rewrite: true });
    });

    it('coerces an unparseable hash to root and asks for a rewrite', () => {
      expect(resolveHashRoute('#legacy-bare-id', exists)).toEqual({ route: ROOT_ROUTE, rewrite: true });
    });

    it('leaves the root hash at root without rewriting', () => {
      expect(resolveHashRoute('', exists)).toEqual({ route: ROOT_ROUTE, rewrite: false });
      expect(resolveHashRoute('#', exists)).toEqual({ route: ROOT_ROUTE, rewrite: false });
    });
  });
});
