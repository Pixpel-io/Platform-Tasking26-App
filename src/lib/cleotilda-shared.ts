// Client-safe Cleotilda constants (no server imports).

export const CLEOTILDA_ID = "c1e0711d-a000-4000-a000-000000000001";

// Messages sent on a user's behalf by Cleotilda carry this prefix in the body;
// the UI strips it and shows a small "via Cleotilda" logo next to the sender's
// name instead.
export const CLEOTILDA_VIA = "[via:cleotilda]";

export function isViaCleotilda(body: string): boolean {
  return body.startsWith(CLEOTILDA_VIA);
}

export function stripViaCleotilda(body: string): string {
  return isViaCleotilda(body)
    ? body.slice(CLEOTILDA_VIA.length).trimStart()
    : body;
}
