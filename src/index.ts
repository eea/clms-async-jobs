import { JOBS_MAPPING } from "./jobs";
import { Worker, Queue, RateLimitError } from "bullmq";
import { createBullBoard } from "@bull-board/api";
import { FastifyAdapter } from "@bull-board/fastify";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import fastify from "fastify";
import IORedis from "ioredis";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");
const REDIS_DB = parseInt(process.env.REDIS_DB || "0");
const ENABLED_CDSE_JOBS = (
  process.env.ENABLED_CDSE_JOBS || "create_cdse_batches"
).split(",");
const ENABLED_DOWNLOADTOOL_JOBS = (
  process.env.ENABLED_DOWNLOADTOOL_JOBS || "downloadtool_updates"
).split(",");

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  maxRetriesPerRequest: null,
});

const cdseQueueName = "cdse_jobs";
const cdseQueue = new Queue(cdseQueueName, { connection });

const downloadtoolQueueName = "downloadtool_jobs";
const downloadtoolQueue = new Queue(downloadtoolQueueName, { connection });

/**
 * Worker setup
 */
const createWorker = (queueName: string, enabledJobs: string[]) =>
  new Worker(
    queueName,
    async (job) => {
      if (!enabledJobs.includes(job.name)) {
        console.warn(`[Worker:${queueName}] Skipping job: ${job.name}`);
        return;
      }

      const handler = JOBS_MAPPING[job.name];
      if (!handler) {
        throw new Error(`Handler not found for job ${job.name}`);
      }

      console.log(
        `[Worker:${queueName}] Executing job: ${job.name} - ${job.id}`,
      );

      try {
        const result = await handler(job.data);
        console.log(`[Worker:${queueName}] Job completed: ${job.id}`);
        return result;
      } catch (error) {
        if (error instanceof RateLimitError) {
          console.log(`[Worker:${queueName}] Rate limit hit, retrying...`);
          throw Worker.RateLimitError();
        }
        console.error(`[Worker:${queueName}] Job failed: ${job.id}`, error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 1,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  );

const cdseWorker = createWorker(cdseQueueName, ENABLED_CDSE_JOBS);
const downloadtoolWorker = createWorker(
  downloadtoolQueueName,
  ENABLED_DOWNLOADTOOL_JOBS,
);

/**
 * Optional: start Bull Board UI for monitoring
 */
const startDashboard = async () => {
  const app = fastify();
  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    queues: [
      new BullMQAdapter(cdseQueue) as any,
      new BullMQAdapter(downloadtoolQueue) as any,
    ],
    serverAdapter,
  });

  serverAdapter.setBasePath("/ui");
  app.register(serverAdapter.registerPlugin(), {
    basePath: "/ui",
    prefix: "/ui",
  });

  const port = parseInt(process.env.PORT || "3000");
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`🚀 Bull Board running at http://localhost:${port}/ui`);
};

startDashboard().catch(console.error);
