export async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`);
  return data;
}

export async function waitForJob(job, onProgress) {
  const deadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    onProgress(`${job.message} · ${job.progress}%`);
    if (job.status === 'completed') return job.result;
    if (job.status === 'failed') throw new Error(job.message);
    if (Date.now() > deadline) throw new Error('Processing is taking longer than expected. Your saved takeoff is safe; retry shortly.');
    await new Promise(resolve => setTimeout(resolve, 1000));
    job = await request(`/api/jobs/${job.id}`);
  }
}
