import "dotenv/config";
import { runSimilarSparkJob } from "./runJob.js";

runSimilarSparkJob().catch((err) => {
  console.error("[spark] job failed:", err);
  process.exit(1);
});
