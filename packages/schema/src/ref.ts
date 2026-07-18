/**
 * A Ref is a plain string pointing at an artifact outside the model. Its kind is
 * inferred from syntax — there is no structured Ref object, because every ref in a
 * real model already fits `path` or `path#Symbol`, and a string stays cheap for an
 * LLM to write and readable in a git diff.
 *
 *   trailing `/`        directory   src/views/cctv/
 *   plain path          file        src/main.ts
 *   path#Symbol         symbol      src/main.ts#getRouter
 *   path#Lstart-Lend    lineRange   src/main.ts#L10-L40
 *   contains `*`        glob        src/views/**\/*.vue
 */
export type RefKind = 'directory' | 'file' | 'symbol' | 'lineRange' | 'glob';

export type ParsedRef = {
  kind: RefKind;
  path: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
};

const LINE_RANGE = /^L(\d+)-L(\d+)$/;

/** Parse a Ref string into its kind and parts. Throws on an empty ref. */
export function parseRef(ref: string): ParsedRef {
  const trimmed = ref.trim();
  if (trimmed === '') throw new Error('Ref is empty');

  // A glob is decided first: `src/**/*.vue` has no fragment and no trailing slash,
  // but is not a file.
  if (trimmed.includes('*')) return { kind: 'glob', path: trimmed };

  const hash = trimmed.indexOf('#');
  if (hash !== -1) {
    const path = trimmed.slice(0, hash);
    const fragment = trimmed.slice(hash + 1);
    const range = LINE_RANGE.exec(fragment);
    if (range) {
      return { kind: 'lineRange', path, startLine: Number(range[1]), endLine: Number(range[2]) };
    }
    return { kind: 'symbol', path, symbol: fragment };
  }

  if (trimmed.endsWith('/')) return { kind: 'directory', path: trimmed.slice(0, -1) };
  return { kind: 'file', path: trimmed };
}

export const refKind = (ref: string): RefKind => parseRef(ref).kind;

/** True only for the trailing-slash directory syntax. A `root` must be one of these. */
export const isDirectoryRef = (ref: string): boolean => {
  const trimmed = ref.trim();
  return trimmed !== '' && !trimmed.includes('*') && !trimmed.includes('#') && trimmed.endsWith('/');
};

/**
 * Prefix `ref` with `root`, collapsing the slash between them. A ref that is already
 * absolute is returned untouched — a root only anchors relative refs.
 */
export function joinRef(root: string | null, ref: string): string {
  if (!root) return ref;
  if (ref.startsWith('/')) return ref;
  const base = root.endsWith('/') ? root.slice(0, -1) : root;
  return base === '' ? ref : `${base}/${ref}`;
}
