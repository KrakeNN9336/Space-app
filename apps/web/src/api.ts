import type { AnalyzeRequest, AnalyzeResponse, ApiError, CropsResponse, HealthResponse } from "@field-shift/shared";

/** Thrown for any non-2xx answer; `code` comes from the contract error body when present. */
export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    const err = (body as ApiError | null)?.error;
    throw new ApiRequestError(err?.code ?? "INTERNAL", err?.message ?? res.statusText, res.status);
  }
  return body as T;
}

export const getHealth = () => request<HealthResponse>("/api/health");
export const getCrops = () => request<CropsResponse>("/api/crops");
export const analyze = (body: AnalyzeRequest) =>
  request<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
