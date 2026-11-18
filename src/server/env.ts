/** Reading the server's environment variables, failing loudly when one is wrong. */
import "server-only";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** A whole-number setting, or `fallback` when it isn't set. */
export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a whole number, got "${raw}"`);
  }
  return value;
}
