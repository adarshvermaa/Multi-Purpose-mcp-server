// src/services/job.service.ts
import { v4 as uuidv4 } from "uuid";

type Job = {
  id: string;
  projectId: string;
  type: string;
  status: "queued" | "running" | "success" | "failed";
  createdAt: string;
  updatedAt: string;
  result?: any;
};

class JobService {
  private jobs = new Map<string, Job>();
  create(projectId: string, type: string) {
    const id = uuidv4();
    const job: Job = {
      id,
      projectId,
      type,
      status: "queued",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);
    return job;
  }
  update(id: string, patch: Partial<Job>) {
    const job = this.jobs.get(id);
    if (!job) return null;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.jobs.set(id, job);
    return job;
  }
  get(id: string) {
    return this.jobs.get(id) ?? null;
  }
}
export default new JobService();
