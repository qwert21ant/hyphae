import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { HyphaeModelSchema, emptyModel, type HyphaeModel } from '@hyphae/schema';

const DEBOUNCE_MS = 500;

export class ModelStore {
  private model: HyphaeModel;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly file: string) {
    this.model = existsSync(file)
      ? HyphaeModelSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
      : emptyModel();
  }

  get(): HyphaeModel {
    return this.model;
  }

  /** Validate, store in memory, schedule a debounced atomic write. */
  set(next: unknown): HyphaeModel {
    this.model = HyphaeModelSchema.parse(next);
    this.scheduleSave();
    return this.model;
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeNow(), DEBOUNCE_MS);
  }

  /** Force a pending write immediately (used by tests / shutdown). */
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
