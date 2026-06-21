/**
 * Migrate a hyphae model JSON file to the current profile-driven schema shape.
 *
 *   pnpm --filter @hyphae/server exec tsx scripts/migrate-model.ts <file...>
 *
 * What it does (idempotent — safe to re-run):
 *  - Node: keeps the core columns; moves legacy domain columns (technology,
 *    responsibilities, invariants, …) into `fields`, keeping only the keys the
 *    active profile defines for that node type. Unknown/dropped non-empty
 *    values are reported, not silently lost.
 *  - Connection: renames `relationCategory` -> `type`; moves transport/intent/…
 *    into `fields` (profile-known keys only).
 *  - Validates the result against the profile + Zod schema before writing.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  c4Backend, effectiveFields, validateModel, resolveProfile, HyphaeModelSchema,
  type Profile,
} from '@hyphae/schema';

const CORE_NODE = new Set(['id', 'name', 'type', 'parentId', 'description', 'codeRefs', 'docRefs', 'createdAt', 'updatedAt', 'fields']);
const CORE_CONN = new Set(['id', 'from', 'to', 'type', 'description', 'direction', 'realizes', 'codeRefs', 'fields']);

type Drop = { entity: string; id: string; key: string };

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Build the `fields` bag from existing fields + legacy top-level keys, keeping only
 *  the keys the profile defines for this kind. Records non-empty dropped values. */
function migrateFields(
  raw: Record<string, unknown>, core: Set<string>, allowed: Set<string>,
  entity: string, id: string, drops: Drop[],
): Record<string, unknown> {
  const candidate: Record<string, unknown> = { ...(raw.fields as Record<string, unknown> ?? {}) };
  for (const [key, value] of Object.entries(raw)) {
    if (core.has(key)) continue;          // core column, handled separately
    if (key in candidate) continue;       // already in the bag
    candidate[key] = value;               // legacy top-level domain field
  }
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (allowed.has(key)) { if (!isEmpty(value)) kept[key] = value; }
    else if (!isEmpty(value)) drops.push({ entity, id, key });
  }
  return kept;
}

function migrate(model: Record<string, unknown>, profile: Profile, drops: Drop[]): Record<string, unknown> {
  const nodes = (model.nodes as Record<string, unknown>[] ?? []).map((n) => {
    const type = String(n.type);
    const allowed = new Set(effectiveFields(profile, type, 'node').map((f) => f.key));
    return {
      id: n.id, name: n.name, type,
      parentId: n.parentId ?? null,
      description: n.description ?? '',
      codeRefs: n.codeRefs ?? [],
      docRefs: n.docRefs ?? [],
      createdAt: n.createdAt, updatedAt: n.updatedAt,
      fields: migrateFields(n, CORE_NODE, allowed, 'node', String(n.id), drops),
    };
  });

  const connections = (model.connections as Record<string, unknown>[] ?? []).map((c) => {
    const type = String(c.type ?? c.relationCategory);
    const allowed = new Set(effectiveFields(profile, type, 'connection').map((f) => f.key));
    // relationCategory is the legacy name for `type` — never treat it as a field.
    const { relationCategory: _rc, ...rest } = c;
    return {
      id: c.id, from: c.from, to: c.to, type,
      description: c.description ?? '',
      direction: c.direction ?? 'Unidirectional',
      realizes: c.realizes ?? [],
      codeRefs: c.codeRefs ?? [],
      fields: migrateFields(rest, CORE_CONN, allowed, 'connection', String(c.id), drops),
    };
  });

  return {
    schemaVersion: 1,
    metadata: model.metadata,
    activeProfile: model.activeProfile ?? profile.id,
    nodes,
    connections,
    flows: model.flows ?? [],
    stateMachines: model.stateMachines ?? [],
    dataTypes: model.dataTypes ?? [],
    requirements: model.requirements ?? [],
    decisions: model.decisions ?? [],
    views: model.views ?? [],
  };
}

function run(file: string): boolean {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const profile = resolveProfile({ activeProfile: String(raw.activeProfile ?? c4Backend.id) } as never);
  const drops: Drop[] = [];
  const migrated = migrate(raw, profile, drops);

  // Validate before writing: Zod shape + referential/field rules.
  const parsed = HyphaeModelSchema.safeParse(migrated);
  if (!parsed.success) {
    console.error(`✗ ${file}: schema parse failed after migration:\n${parsed.error}`);
    return false;
  }
  const issues = validateModel(parsed.data, profile);
  if (issues.length) {
    console.error(`✗ ${file}: ${issues.length} validation issue(s) after migration:`);
    for (const i of issues) console.error(`    [${i.kind}] ${i.ref}: ${i.message}`);
    return false;
  }

  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(parsed.data, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
  console.log(`✓ ${file}: ${parsed.data.nodes.length} nodes, ${parsed.data.connections.length} connections migrated.`);
  if (drops.length) {
    console.log(`  dropped ${drops.length} non-empty field(s) not in the profile:`);
    for (const d of drops) console.log(`    ${d.entity} ${d.id}: ${d.key}`);
  }
  return true;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: tsx scripts/migrate-model.ts <file.json> [more.json ...]');
  process.exit(2);
}
const ok = files.map(run).every(Boolean);
process.exit(ok ? 0 : 1);
