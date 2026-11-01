import type { Reporter, TestResult } from '@playwright/test/reporter';

/** The B8 acceptance line: the flight test prints 20. */
export default class FlightReporter implements Reporter {
  onTestEnd(_test: { title: string }, result: TestResult): void {
    const note = result.annotations.find((annotation) => annotation.type === 'flight-rows');
    if (note?.description) process.stdout.write(`flight test: ${note.description}\n`);
  }
}
