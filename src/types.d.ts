export type AsyncFunction = (...args: any[]) => Promise<unknown>;

export type TypeJobsMapping = {
  [key: string]: AsyncFunction;
};

export type CreateCDSEBatches = {
  user_id: string;
  cdse_datasets: string;
};
