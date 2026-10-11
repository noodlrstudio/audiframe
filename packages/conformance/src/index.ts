import {
  parseEnvelope,
  parseBootstrap,
  validateMidi,
  VERSION,
  type Json,
} from "@audiframe/protocol";
export interface Fixture {
  name: string;
  format: "bootstrap" | "envelope" | "midi";
  valid: boolean;
  value: Json;
}
export function runFixtures(fixtures: Fixture[]) {
  return fixtures.map((f) => {
    let accepted = true;
    try {
      if (f.format === "bootstrap") parseBootstrap(f.value);
      else if (f.format === "midi") validateMidi(f.value as number[]);
      else parseEnvelope(f.value);
    } catch {
      accepted = false;
    }
    return {
      name: f.name,
      status: accepted === f.valid ? "PASS" : "FAIL",
      expected: f.valid ? "accept" : "reject",
    };
  });
}
export function report(
  fixtures: Fixture[],
  environment: Record<string, string> = {},
) {
  const results = runFixtures(fixtures);
  return {
    protocolVersion: VERSION,
    suiteVersion: "0.1.0-alpha.1",
    timestamp: new Date().toISOString(),
    environment,
    profiles: {
      core: results.every((r) => r.status === "PASS") ? "PASS" : "FAIL",
      state: "unsupported",
      midi: "unsupported",
      events: "unsupported",
      transport: "unsupported",
      parameters: "unsupported",
      ui: "unsupported",
      files: "unsupported",
    },
    scope: "Wire fixture validation only; no runtime certification",
    results,
  };
}
