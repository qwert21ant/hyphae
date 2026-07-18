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
