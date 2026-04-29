// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const embeddedRepoRoot = "__COSTAR_REPO_ROOT__";
const repoRoot = embeddedRepoRoot.startsWith("__COSTAR_")
  ? path.resolve(__dirname, "..", "..")
  : embeddedRepoRoot;

const serverPath = path.join(repoRoot, "costar-core", "mcp", "costar-mcp-server.mjs");
await import(pathToFileURL(serverPath).href);
