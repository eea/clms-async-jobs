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
const ENABLED_JOBS = (process.env.ENABLED_JOBS || "create_cdse_batches").split(
  ",",
);

const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
  maxRetriesPerRequest: null,
});

const queueName = "cdse_jobs";
const queue = new Queue(queueName, { connection });

/**
 * Worker setup
 */
const worker = new Worker(
  queueName,
  async (job) => {
    if (!ENABLED_JOBS.includes(job.name)) {
      console.warn(`[Worker] Skipping job: ${job.name}`);
      return;
    }

    const handler = JOBS_MAPPING[job.name];
    if (!handler) {
      throw new Error(`Handler not found for job ${job.name}`);
    }

    console.log(`[Worker] Executing job: ${job.name} - ${job.id}`);

    try {
      const result = await handler(job.data);
      console.log(`[Worker] Job completed: ${job.id}`);
      return result;
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.log(`[Worker] Rate limit hit, retrying...`);
        throw Worker.RateLimitError();
      }
      console.error(`[Worker] Job failed: ${job.id}`, error);
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

/**
 * Optional: start Bull Board UI for monitoring
 */
const startDashboard = async () => {
  const app = fastify();
  const serverAdapter = new FastifyAdapter();

  createBullBoard({
    queues: [new BullMQAdapter(queue) as any],
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
