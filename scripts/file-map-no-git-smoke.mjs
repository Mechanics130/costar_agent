// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checkResult = existsSync(path.join(repoRoot, ".git"))
  ? runCheckInCopiedTree()
  : runFileMapCheck(repoRoot);

assert.equal(
  checkResult.status,
  0,
  `file-map check should work without .git\nstdout:\n${checkResult.stdout}\nstderr:\n${checkResult.stderr}`
);

console.log("CoStar file-map no-git smoke passed.");

function runCheckInCopiedTree() {
  const tempRoot = path.join(os.tmpdir(), `costar-file-map-no-git-smoke-${process.pid}`);
  const targetRoot = path.join(tempRoot, "costar_agent");
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });

  for (const file of listGitPublicFiles()) {
    const from = path.join(repoRoot, file);
    const to = path.join(targetRoot, file);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }

  try {
    return runFileMapCheck(targetRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function listGitPublicFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git ls-files failed");
  }
  return result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith("node_modules/"));
}

function runFileMapCheck(cwd) {
  return spawnSync(process.execPath, ["scripts/generate-file-map.mjs", "--check"], {
    cwd,
    encoding: "utf8"
  });
}
