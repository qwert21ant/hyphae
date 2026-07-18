import { describe, it, expect } from 'vitest';
import { parseRef, refKind, isDirectoryRef, joinRef } from '../src/ref';

describe('refKind', () => {
  it('classifies each documented syntax', () => {
    expect(refKind('src/views/cctv/')).toBe('directory');
    expect(refKind('src/main.ts')).toBe('file');
    expect(refKind('src/main.ts#getRouter')).toBe('symbol');
    expect(refKind('src/main.ts#L10-L40')).toBe('lineRange');
    expect(refKind('src/views/**/*.vue')).toBe('glob');
  });

  it('treats a glob as a glob even with a trailing slash or fragment', () => {
    expect(refKind('src/**/')).toBe('glob');
    expect(refKind('src/**/*.ts#Foo')).toBe('glob');
  });
});

describe('parseRef', () => {
  it('splits a symbol ref into path + symbol', () => {
    expect(parseRef('WebService/Program.cs#Program')).toEqual({
      kind: 'symbol', path: 'WebService/Program.cs', symbol: 'Program',
    });
  });

  it('splits a line-range ref into path + numeric bounds', () => {
    expect(parseRef('src/main.ts#L10-L40')).toEqual({
      kind: 'lineRange', path: 'src/main.ts', startLine: 10, endLine: 40,
    });
  });

  it('strips the trailing slash from a directory path', () => {
    expect(parseRef('src/views/cctv/')).toEqual({ kind: 'directory', path: 'src/views/cctv' });
  });

  it('keeps a plain file path intact', () => {
    expect(parseRef('src/main.ts')).toEqual({ kind: 'file', path: 'src/main.ts' });
  });

  it('rejects an empty ref', () => {
    expect(() => parseRef('')).toThrow(/empty/i);
  });
});

describe('isDirectoryRef', () => {
  it('is true only for a trailing-slash ref', () => {
    expect(isDirectoryRef('endpoints/media_gateway/')).toBe(true);
    expect(isDirectoryRef('endpoints/media_gateway')).toBe(false);
    expect(isDirectoryRef('src/**/*.ts')).toBe(false);
  });
});

describe('joinRef', () => {
  it('returns the ref unchanged when there is no root', () => {
    expect(joinRef(null, 'src/main.ts')).toBe('src/main.ts');
  });

  it('prefixes the root, normalising the slash between them', () => {
    expect(joinRef('endpoints/media_gateway/', 'src/main.ts')).toBe('endpoints/media_gateway/src/main.ts');
    expect(joinRef('endpoints/media_gateway', 'src/main.ts')).toBe('endpoints/media_gateway/src/main.ts');
  });

  it('preserves the fragment when joining', () => {
    expect(joinRef('WebService/', 'Program.cs#Program')).toBe('WebService/Program.cs#Program');
  });

  it('ignores the root for an already-absolute ref', () => {
    expect(joinRef('endpoints/mg/', '/etc/hosts')).toBe('/etc/hosts');
  });
});

import { resolveRoot, resolveRef, type RootBearer } from '../src/ref';

/** sys(root endpoints/) > mg(root media_gateway/) > comp(no root); and loose(no root anywhere) */
const tree: RootBearer[] = [
  { id: 'sys', parentId: null, root: 'endpoints/' },
  { id: 'mg', parentId: 'sys', root: 'media_gateway/' },
  { id: 'comp', parentId: 'mg', root: null },
  { id: 'abs', parentId: 'sys', root: '/opt/thing/' },
  { id: 'loose', parentId: null, root: null },
  { id: 'child-of-loose', parentId: 'loose', root: null },
];

describe('resolveRoot', () => {
  it('chains roots from the outermost ancestor inwards', () => {
    expect(resolveRoot(tree, 'mg')).toBe('endpoints/media_gateway/');
  });

  it('inherits the nearest ancestor root when the node declares none', () => {
    expect(resolveRoot(tree, 'comp')).toBe('endpoints/media_gateway/');
  });

  it('returns the top root for a node that declares it', () => {
    expect(resolveRoot(tree, 'sys')).toBe('endpoints/');
  });

  it('returns null when no ancestor declares a root', () => {
    expect(resolveRoot(tree, 'child-of-loose')).toBe(null);
  });

  it('stops chaining at an absolute root', () => {
    expect(resolveRoot(tree, 'abs')).toBe('/opt/thing/');
  });

  it('returns null for an unknown node id', () => {
    expect(resolveRoot(tree, 'nope')).toBe(null);
  });

  it('does not hang on a parentId cycle', () => {
    const cyclic: RootBearer[] = [
      { id: 'a', parentId: 'b', root: null },
      { id: 'b', parentId: 'a', root: null },
    ];
    expect(resolveRoot(cyclic, 'a')).toBe(null);
  });
});

describe('resolveRef', () => {
  it('anchors a ref against the resolved root', () => {
    expect(resolveRef(tree, 'comp', 'src/main.ts')).toBe('endpoints/media_gateway/src/main.ts');
  });

  it('anchors a symbol ref without disturbing the fragment', () => {
    expect(resolveRef(tree, 'comp', 'src/main.ts#getRouter')).toBe('endpoints/media_gateway/src/main.ts#getRouter');
  });

  it('returns null for a ref on an unanchored node', () => {
    expect(resolveRef(tree, 'child-of-loose', 'src/main.ts')).toBe(null);
  });

  it('disambiguates the same ref string under two different roots', () => {
    const two: RootBearer[] = [
      { id: 'fc', parentId: null, root: 'endpoints/full_client/' },
      { id: 'sc', parentId: null, root: 'endpoints/streaming_client/' },
    ];
    expect(resolveRef(two, 'fc', 'src/main.ts')).toBe('endpoints/full_client/src/main.ts');
    expect(resolveRef(two, 'sc', 'src/main.ts')).toBe('endpoints/streaming_client/src/main.ts');
  });
});

import { refOwners } from '../src/ref';

describe('refOwners', () => {
  const owners = [
    { id: 'fc', parentId: null, root: 'endpoints/full_client/', codeRefs: ['src/main.ts'] },
    { id: 'sc', parentId: null, root: 'endpoints/streaming_client/', codeRefs: ['src/main.ts'] },
    { id: 'shared', parentId: 'fc', root: null, codeRefs: ['src/main.ts'] },
  ];

  it('resolves a path back to the single node that claims it', () => {
    expect(refOwners(owners, 'endpoints/streaming_client/src/main.ts')).toEqual(['sc']);
  });

  it('returns every claimant when a path is genuinely shared', () => {
    expect(refOwners(owners, 'endpoints/full_client/src/main.ts').sort()).toEqual(['fc', 'shared']);
  });

  it('returns nothing for an unclaimed path', () => {
    expect(refOwners(owners, 'endpoints/other/src/main.ts')).toEqual([]);
  });

  it('matches on the path, ignoring a symbol fragment', () => {
    const withSymbol = [{ id: 'a', parentId: null, root: 'app/', codeRefs: ['src/main.ts#getRouter'] }];
    expect(refOwners(withSymbol, 'app/src/main.ts')).toEqual(['a']);
  });
});
