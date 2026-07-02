import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, SNAPSHOT_PATH } from "./similarIndex.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../../../..");
const JOB_PATH = join(REPO_ROOT, "pipelines/spark/jobs/similar_listings.py");

function inputPath(): string {
  if (existsSync(SNAPSHOT_PATH)) return SNAPSHOT_PATH;
  return join(DATA_DIR, "listings.json");
}

function outputPath(): string {
  return process.env.SPARK_SIMILAR_INDEX_PATH ?? join(DATA_DIR, "similar-index.json");
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, shell: process.platform === "win32", stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

export async function runSimilarSparkJob(): Promise<void> {
  const input = inputPath();
  const output = outputPath();
  const useDocker = (process.env.SPARK_USE_DOCKER ?? "1").trim() !== "0";

  console.log(`[spark] job input=${input} output=${output} docker=${useDocker}`);

  if (useDocker) {
    const composeFile = join(REPO_ROOT, "infra/docker-compose.yml");
    await runCommand(
      "docker",
      [
        "compose",
        "-f",
        composeFile,
        "--profile",
        "spark",
        "run",
        "--rm",
        "--user",
        "root",
        "spark",
        "/opt/spark/bin/spark-submit",
        "--master",
        "local[*]",
        "/jobs/similar_listings.py",
        "--input",
        `/data/${input.endsWith("snapshot.json") ? "listings.snapshot.json" : "listings.json"}`,
        "--output",
        "/data/similar-index.json",
      ],
      REPO_ROOT,
    );
    return;
  }

  const sparkSubmit = process.env.SPARK_SUBMIT ?? "spark-submit";
  await runCommand(
    sparkSubmit,
    ["--master", "local[*]", JOB_PATH, "--input", input, "--output", output],
    REPO_ROOT,
  );
}

export function isSparkAutoRunEnabled(): boolean {
  const flag = (process.env.SPARK_AUTO_RUN ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}
