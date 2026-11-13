
import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { makeRepo } from "./fixture.js";
import {
  analyseRepo,
  buildReport,
  checkReport,
} from "../src/index.js";

const SEED = 0x51f15e;
const KEY = "0123456789abcdef0123456789abcdef";
const ITERATIONS = 1000;

const params = {
  author: ["ada@example.com"],
  depth: 2,
  threshold: 0.5,
  minCommits: 1,
  paths: false,
  emails: false,
  sample: 1,
  fingerprintKey: KEY,
};

const meta = {
  version: "0.7.1",
  generatedAt: "2026-01-01T00:00:00.000Z",
};

function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function pick<T>(items: T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  assert.ok(item !== undefined);
  return item;
}

function mutateReport(report: any, random: () => number) {
  const mutated = clone(report);

  const mutations: Array<() => void> = [
    () => {
      mutated.schemaVersion = "invalid";
    },
    () => {
      mutated.schemaVersion = 999999;
    },
    () => {
      mutated.hash = "x".repeat(64);
    },
    () => {
      mutated.repositories = null;
    },
    () => {
      mutated.figures = null;
    },
    () => {
      mutated.params = null;
    },
    () => {
      mutated.generatedAt = "invalid-date";
    },
    () => {
      mutated.hash = "__proto__";
    },
    () => {
      mutated.schemaVersion = Infinity;
    },
  ];

  pick(mutations, random)();

  return mutated;
}

function mutateJson(json: string, random: () => number): string {
  const mutations: Array<() => string> = [
    // Duplicate key: JSON.parse keeps the last occurrence.
    () => json.replace(
      '"schemaVersion":',
      '"schemaVersion":1,"schemaVersion":',
    ),

    // Invalid schema version.
    () => json.replace(
      /"schemaVersion":\s*\d+/,
      '"schemaVersion":999999',
    ),

    // Prototype pollution-shaped input.
    () => json.replace(
      /\{/,
      '{"__proto__":{"polluted":true},',
    ),

    // Truncated JSON.
    () => json.slice(0, Math.floor(random() * json.length)),

    // Non-finite numeric literal after JSON parsing.
    () => json.replace(/\d+/, "1e999"),

    // Unicode combining character in a string.
    () => json.replace(
      /"name":\s*"([^"]*)"/,
      '"name":"$1\u0301"',
    ),
  ];

  return pick(mutations, random)();
}

function assertStructuredResult(result: ReturnType<typeof checkReport>) {
  assert.equal(typeof result.ok, "boolean");

  if (!result.ok) {
    assert.ok(
      Array.isArray(result.problems),
      "rejected reports must return a problems array",
    );

    assert.ok(
      result.problems.length > 0,
      "rejected reports must explain why",
    );
  }
}

test("seeded report fuzzing never crashes checkReport", async () => {
  const repoPath = await makeRepo();

  try {
    const report = buildReport(
      [await analyseRepo(repoPath, params)],
      params,
      meta,
    );

    // Baseline: an untouched report must pass.
    assert.equal(checkReport(report).ok, true);

    const random = seededRandom(SEED);

    for (let i = 0; i < ITERATIONS; i++) {
      const mutated = mutateReport(report, random);

      try {
        const result = checkReport(mutated);
        assertStructuredResult(result);
      } catch (error) {
        assert.fail(
          `seed=${SEED}, iteration=${i}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } finally {
    await rm(repoPath, { recursive: true, force: true });
  }
});

test("seeded JSON mutations are rejected cleanly or checked", async () => {
  const repoPath = await makeRepo();

  try {
    const report = buildReport(
      [await analyseRepo(repoPath, params)],
      params,
      meta,
    );

    const json = JSON.stringify(report);
    const random = seededRandom(SEED);

    for (let i = 0; i < ITERATIONS; i++) {
      const mutatedJson = mutateJson(json, random);

      try {
        const parsed: unknown = JSON.parse(mutatedJson);
        const result = checkReport(parsed);

        assertStructuredResult(result);
      } catch (error) {
        // Syntax errors from truncation are expected.
        if (error instanceof SyntaxError) {
          continue;
        }

        assert.fail(
          `seed=${SEED}, iteration=${i}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  } finally {
    await rm(repoPath, { recursive: true, force: true });
  }
});

test("known invalid report mutations are rejected", async () => {
  const repoPath = await makeRepo();

  try {
    const report = buildReport(
      [await analyseRepo(repoPath, params)],
      params,
      meta,
    );

    const invalidSchema = {
      ...report,
      schemaVersion: 999999,
    };

    const invalidHash = {
      ...report,
      hash: "0".repeat(64),
    };

    for (const invalid of [invalidSchema, invalidHash]) {
      const result = checkReport(invalid);

      assert.equal(result.ok, false);
      assert.ok(result.problems.length > 0);
    }
  } finally {
    await rm(repoPath, { recursive: true, force: true });
  }
});

test("canonical-equivalent JSON formatting preserves report validity", async () => {
  const repoPath = await makeRepo();

  try {
    const report = buildReport(
      [await analyseRepo(repoPath, params)],
      params,
      meta,
    );

    const compact = JSON.stringify(report);
    const pretty = JSON.stringify(JSON.parse(compact), null, 2);

    const parsedCompact = JSON.parse(compact);
    const parsedPretty = JSON.parse(pretty);

    assert.equal(checkReport(parsedCompact).ok, true);
    assert.equal(checkReport(parsedPretty).ok, true);
  } finally {
    await rm(repoPath, { recursive: true, force: true });
  }
});
