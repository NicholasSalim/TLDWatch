/**
 * The browser's requests to TLDWatch's own API. Neither helper throws: a
 * failed request, or an answer that isn't TLDWatch's, comes back as `fallback`.
 */

/** The JSON answer to a GET, or `fallback` if it failed. */
export async function getJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, init);
    return response.ok ? ((await response.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Sends JSON and reads the JSON answer. A refusal (an error status whose body
 * carries a `status`, like "rejected") is an answer too, so callers can show
 * why; anything else that isn't OK comes back as `fallback`.
 */
export async function postJson<T>(url: string, body: unknown, fallback: T, method = "POST"): Promise<T> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await response.json().catch(() => null);
    const isRefusal = !!data && typeof data === "object" && "status" in data;
    return response.ok || isRefusal ? (data as T) : fallback;
  } catch {
    return fallback;
  }
}
