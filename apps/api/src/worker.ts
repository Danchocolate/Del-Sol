import { runJobs } from './modules/notifications/worker.js';
import { db } from './lib/db.js';
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
while (!stopping) {
  try {
    await runJobs();
  } catch {
    process.stderr.write('{"level":"error","event":"JOB_FAILURE"}\n');
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
await db.$disconnect();
