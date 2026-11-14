import type { LogicInput, LogicOutput } from "@field-shift/shared";
import mock from "@field-shift/shared/mock-analyze.json";

/**
 * PLACEHOLDER. Returns the illustrative mock so the API and the UI can be built in parallel.
 * Serhii replaces the body with the real rules (Koppen, stress, scoring, rotation, tillage).
 * The signature is the internal contract from shared/types.ts — do not change it.
 */
export function recommend(_input: LogicInput): LogicOutput {
  const { climate, soil, stress, recommendation } = mock as unknown as LogicOutput;
  return { climate, soil, stress, recommendation };
}
