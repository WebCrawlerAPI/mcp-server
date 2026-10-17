/** Structured JSON logs. Never pass tokens, secrets or query strings. */
export function log(level: "info" | "warn" | "error", msg: string, fields: object = {}): void {
  process.stdout.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields })}\n`,
  );
}
