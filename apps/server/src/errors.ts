import type { Issue } from '@hyphae/schema';

/** A mutation that would introduce one or more validation issues. */
export class ValidationError extends Error {
  constructor(public readonly issues: Issue[]) {
    super('validation failed');
    this.name = 'ValidationError';
  }
}

/** A mutation that targets an id that does not exist. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
