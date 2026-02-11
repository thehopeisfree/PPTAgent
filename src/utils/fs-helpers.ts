import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Read a JSON file and parse it */
export async function readJSON<T = unknown>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/** Write an object as JSON to a file */
export async function writeJSON(
  filePath: string,
  data: unknown
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** Append a JSON line to a JSONL file */
export async function appendTrace(
  filePath: string,
  entry: unknown
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(entry) + "\n", "utf-8");
}

/** Compute file paths for a given rollout directory and iteration */
export function rolloutPaths(rolloutDir: string, iter: number) {
  return {
    ir: path.join(rolloutDir, `ir_${iter}.json`),
    html: path.join(rolloutDir, `out_${iter}.html`),
    render: path.join(rolloutDir, `render_${iter}.png`),
    dom: path.join(rolloutDir, `dom_${iter}.json`),
    diag: path.join(rolloutDir, `diag_${iter}.json`),
    patch: path.join(rolloutDir, `patch_${iter}.json`),
    trace: path.join(rolloutDir, "trace.jsonl"),
  };
}

/** Write a string to a file, creating directories as needed */
export async function writeFile(
  filePath: string,
  content: string | Buffer
): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, content);
}
