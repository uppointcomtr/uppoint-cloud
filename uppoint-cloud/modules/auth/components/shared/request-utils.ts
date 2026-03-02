"use client";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}

export function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutesPart = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secondsPart = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}
