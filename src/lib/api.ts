"use client";

// Klientens skrivväg: alla mutationer går via /api/verbs/<verb> (server håller verb-nyckeln).

export async function verb<T = Record<string, unknown>>(
  name: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(`/api/verbs/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error ?? `verb ${name} misslyckades (${res.status})`);
  }
  return data as T;
}

export async function runQueue(max = 50): Promise<void> {
  await fetch("/api/runner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max }),
  });
}

export async function intakeUrlPull(projectId: string, pullUrl: string, shotId?: string) {
  const res = await fetch("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, pull_url: pullUrl, shot_id: shotId }),
  });
  const data = await res.json();
  if (!res.ok || data?.ok === false) throw new Error(data?.error ?? "intag misslyckades");
  return data;
}

export async function uploadFile(projectId: string, file: File, shotId?: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("project_id", projectId);
  if (shotId) form.append("shot_id", shotId);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok || data?.ok === false) throw new Error(data?.error ?? "uppladdning misslyckades");
  return data;
}
