import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const APP_DB_IMPORT_ALLOWLIST = new Set([
  "app/api/health/route.ts",
  "app/api/internal/instances/provisioning/claim/route.ts",
  "app/api/internal/instances/provisioning/report/route.ts",
]);

function collectFilesRecursively(rootDir: string): string[] {
  const entries = readdirSync(rootDir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectFilesRecursively(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function hasImport(source: string, aliasPrefix: string): boolean {
  const escaped = aliasPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const staticImport = new RegExp(`from\\s+["']${escaped}`, "m");
  const dynamicImport = new RegExp(`import\\(\\s*["']${escaped}`, "m");
  return staticImport.test(source) || dynamicImport.test(source);
}

function relativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

interface ModuleGraphResult {
  modules: Set<string>;
  edges: Map<string, Set<string>>;
}

function buildModuleGraph(): ModuleGraphResult {
  const modulesRoot = path.join(process.cwd(), "modules");
  const moduleFiles = collectFilesRecursively(modulesRoot).filter((filePath) =>
    /\.(ts|tsx|mts|cts)$/.test(filePath),
  );

  const modules = new Set<string>();
  const edges = new Map<string, Set<string>>();

  for (const filePath of moduleFiles) {
    const rel = relativePath(filePath);
    const match = rel.match(/^modules\/([^/]+)\//);
    if (!match) {
      continue;
    }

    const sourceModule = match[1]!;
    modules.add(sourceModule);
    if (!edges.has(sourceModule)) {
      edges.set(sourceModule, new Set());
    }

    const source = readFileSync(filePath, "utf8");
    const importMatches = source.matchAll(/from\s+["']@\/modules\/([^/"']+)\//g);

    for (const importMatch of importMatches) {
      const targetModule = importMatch[1]!;
      modules.add(targetModule);
      if (!edges.has(targetModule)) {
        edges.set(targetModule, new Set());
      }

      if (targetModule !== sourceModule) {
        edges.get(sourceModule)?.add(targetModule);
      }
    }
  }

  return { modules, edges };
}

function findModuleCycles(graph: ModuleGraphResult): string[] {
  const { modules, edges } = graph;
  const cycles = new Set<string>();
  const visited = new Set<string>();
  const stack = new Set<string>();
  const pathStack: string[] = [];

  const dfs = (node: string) => {
    visited.add(node);
    stack.add(node);
    pathStack.push(node);

    for (const next of edges.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
        continue;
      }

      if (!stack.has(next)) {
        continue;
      }

      const cycleStart = pathStack.indexOf(next);
      if (cycleStart === -1) {
        continue;
      }

      const cyclePath = [...pathStack.slice(cycleStart), next];
      cycles.add(cyclePath.join(" -> "));
    }

    pathStack.pop();
    stack.delete(node);
  };

  for (const moduleName of modules) {
    if (!visited.has(moduleName)) {
      dfs(moduleName);
    }
  }

  return [...cycles].sort();
}

describe("module boundary guardrail", () => {
  it("blocks importing app layer from modules/db/lib/components", () => {
    const roots = ["modules", "db", "lib", "components"];
    const candidateFiles = roots
      .flatMap((root) => collectFilesRecursively(path.join(process.cwd(), root)))
      .filter((filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath));
    const violations: string[] = [];

    for (const filePath of candidateFiles) {
      const source = readFileSync(filePath, "utf8");
      if (hasImport(source, "@/app/")) {
        violations.push(relativePath(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks importing db layer directly from app entry points except explicit allowlist", () => {
    const appDir = path.join(process.cwd(), "app");
    const entryFiles = collectFilesRecursively(appDir).filter((filePath) =>
      /(?:route\.ts|page\.tsx|actions\.ts)$/.test(filePath),
    );
    const violations: string[] = [];

    for (const filePath of entryFiles) {
      const rel = relativePath(filePath);
      if (APP_DB_IMPORT_ALLOWLIST.has(rel)) {
        continue;
      }

      const source = readFileSync(filePath, "utf8");
      if (hasImport(source, "@/db/")) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks importing modules layer directly from db repositories", () => {
    const dbDir = path.join(process.cwd(), "db");
    const dbFiles = collectFilesRecursively(dbDir).filter((filePath) =>
      /\.(ts|tsx|mts|cts)$/.test(filePath),
    );
    const violations: string[] = [];

    for (const filePath of dbFiles) {
      const source = readFileSync(filePath, "utf8");
      if (hasImport(source, "@/modules/")) {
        violations.push(relativePath(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps modules graph acyclic", () => {
    const graph = buildModuleGraph();
    const cycles = findModuleCycles(graph);
    expect(cycles).toEqual([]);
  });
});
