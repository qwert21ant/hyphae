// Use the Web Crypto global (available in Node 19+ and browsers) so the schema
// package stays isomorphic — it is imported by both the Node server and the
// browser bundle, where `node:crypto` would fail to resolve.
export const newId = (): string => crypto.randomUUID();
export const now = (): string => new Date().toISOString();
