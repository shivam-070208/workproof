/**
 * Shape check for a report, done by hand so `check` needs no dependency. The same shape
 * is published as JSON Schema in schema/report.schema.json for other tools.
 */
const hex = (n: number) => new RegExp(`^[0-9a-f]{${n}}$`);

type Problem = string;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function expect(problems: Problem[], path: string, ok: boolean, what: string): boolean {
  if (!ok) problems.push(`${path}: expected ${what}`);
  return ok;
}

function checkFigure(problems: Problem[], path: string, f: unknown): void {
  if (!expect(problems, path, isObject(f), "object")) return;
  const fig = f as Record<string, unknown>;
  expect(problems, `${path}.id`, typeof fig.id === "string" && fig.id.length > 0, "non-empty string");
  expect(problems, `${path}.title`, typeof fig.title === "string", "string");
  expect(problems, `${path}.value`, fig.value !== undefined, "a value");
  expect(problems, `${path}.command`, typeof fig.command === "string", "string");
  expect(problems, `${path}.limits`, Array.isArray(fig.limits) && (fig.limits as unknown[]).every((l) => typeof l === "string"), "array of strings");
}

function checkRepository(problems: Problem[], path: string, r: unknown): void {
  if (!expect(problems, path, isObject(r), "object")) return;
  const repo = r as Record<string, unknown>;
  expect(problems, `${path}.name`, typeof repo.name === "string", "string");
  expect(problems, `${path}.head`, typeof repo.head === "string" && hex(40).test(repo.head), "40 hex characters");
  expect(problems, `${path}.fingerprint`, typeof repo.fingerprint === "string" && hex(64).test(repo.fingerprint), "64 hex characters");
  if (expect(problems, `${path}.identity`, isObject(repo.identity), "object")) {
    const id = repo.identity as Record<string, unknown>;
    expect(problems, `${path}.identity.emails`, Array.isArray(id.emails), "array");
    expect(problems, `${path}.identity.names`, Array.isArray(id.names), "array");
    expect(problems, `${path}.identity.count`, typeof id.count === "number" && Number.isFinite(id.count), "number");
    if (id.possiblySplit !== undefined && expect(problems, `${path}.identity.possiblySplit`, isObject(id.possiblySplit), "object")) {
      const ps = id.possiblySplit as Record<string, unknown>;
      expect(problems, `${path}.identity.possiblySplit.names`, Array.isArray(ps.names), "array");
      expect(problems, `${path}.identity.possiblySplit.reasons`, Array.isArray(ps.reasons), "array");
      if (ps.count !== undefined) expect(problems, `${path}.identity.possiblySplit.count`, typeof ps.count === "number" && Number.isFinite(ps.count), "number");
      if (ps.hint !== undefined) expect(problems, `${path}.identity.possiblySplit.hint`, typeof ps.hint === "string", "string");
      if (ps.emails !== undefined) expect(problems, `${path}.identity.possiblySplit.emails`, Array.isArray(ps.emails), "array");
    }
  }
  if (expect(problems, `${path}.environment`, isObject(repo.environment), "object")) {
    const env = repo.environment as Record<string, unknown>;
    expect(problems, `${path}.environment.git`, typeof env.git === "string", "string");
    expect(problems, `${path}.environment.blame`, Array.isArray(env.blame), "array");
  }
  if (expect(problems, `${path}.excluded`, isObject(repo.excluded), "object")) {
    const ex = repo.excluded as Record<string, unknown>;
    expect(problems, `${path}.excluded.botCommits`, typeof ex.botCommits === "number" && Number.isFinite(ex.botCommits), "number");
    expect(problems, `${path}.excluded.files`, typeof ex.files === "number" && Number.isFinite(ex.files), "number");
    expect(problems, `${path}.excluded.linesAddedShare`, typeof ex.linesAddedShare === "number" && Number.isFinite(ex.linesAddedShare), "number");
  }
  if (expect(problems, `${path}.figures`, Array.isArray(repo.figures) && (repo.figures as unknown[]).length > 0, "non-empty array")) {
    (repo.figures as unknown[]).forEach((f, i) => checkFigure(problems, `${path}.figures[${i}]`, f));
  }
}

/** Returns the list of problems; an empty list means the report has the 0.2 shape. */
export function validateReport(value: unknown): Problem[] {
  const problems: Problem[] = [];
  if (!expect(problems, "report", isObject(value), "object")) return problems;
  const r = value as Record<string, unknown>;
  expect(problems, "tool", r.tool === "workproof", '"workproof"');
  expect(problems, "schemaVersion", r.schemaVersion === 2, "2");
  expect(problems, "version", typeof r.version === "string", "string");
  expect(problems, "generatedAt", typeof r.generatedAt === "string" && !Number.isNaN(Date.parse(r.generatedAt as string)), "ISO date");
  expect(problems, "params", isObject(r.params), "object");
  expect(problems, "hash", typeof r.hash === "string" && hex(64).test(r.hash), "64 hex characters");
  if (expect(problems, "repositories", Array.isArray(r.repositories) && (r.repositories as unknown[]).length > 0, "non-empty array")) {
    (r.repositories as unknown[]).forEach((repo, i) => checkRepository(problems, `repositories[${i}]`, repo));
  }
  return problems;
}
