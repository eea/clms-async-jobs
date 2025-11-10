import type { CreateCDSEBatches, TypeJobsMapping } from "./types";
import mockData from "./mock-data.json";
import { RateLimitError } from "bullmq";

const PLONE_URL = process.env.PLONE_URL || "http://localhost:8080/Plone";
const PLONE_AUTH_TOKEN = process.env.PLONE_AUTH_TOKEN || "hello1234";

/**
 * Call Plone's @@start-cdse-batch view with provided data.
 */
export async function create_cdse_batches(data: CreateCDSEBatches) {
  const url = `${PLONE_URL}/@@start-cdse-batch`;
  console.log(`[Worker] Calling ${url} ...`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authentication: PLONE_AUTH_TOKEN, // security token check
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Plone returned ${res.status}: ${text}`);
  }

  const json = await res.json();
  console.log("[Worker] Received response:", json);

  return json;
}

/**
 * Mapping between job names and handler functions.
 */
export const JOBS_MAPPING: TypeJobsMapping = {
  create_cdse_batches,
};
