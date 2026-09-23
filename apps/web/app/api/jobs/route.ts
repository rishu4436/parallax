import { readJobs, writeJobs } from "@parallax/core/persist";
import type { Job } from "@parallax/core";
import { fail, readJson } from "@/lib/http";

export async function GET() {
  return Response.json({ ok: true, jobs: readJobs() });
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ action: "create" | "pause" | "remove"; job?: Job; id?: string; paused?: boolean }>(request);
    const jobs = readJobs();
    if (body.action === "create" && body.job) {
      return Response.json({ ok: true, jobs: writeJobs([body.job, ...jobs]) });
    }
    if (body.action === "pause" && body.id) {
      return Response.json({
        ok: true,
        jobs: writeJobs(jobs.map((job) => (job.id === body.id ? { ...job, paused: Boolean(body.paused) } : job))),
      });
    }
    if (body.action === "remove" && body.id) {
      return Response.json({ ok: true, jobs: writeJobs(jobs.filter((job) => job.id !== body.id)) });
    }
    return Response.json({ ok: false, message: "Unknown job action" });
  } catch (err) {
    return fail(err);
  }
}
