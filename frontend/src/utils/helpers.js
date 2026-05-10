// ─── Date formatting ──────────────────────────────────────────────────────────
export const formatDate = (d) =>
  new Date(d).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

// ─── Badge helpers ────────────────────────────────────────────────────────────
export const statusBadge = (s) => ({
  draft: "badge-neutral",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red",
  deprecated: "badge-neutral",
  implemented: "badge-blue",
}[s] || "badge-neutral");

export const priorityBadge = (p) => ({
  must_have: "badge-red",
  should_have: "badge-amber",
  could_have: "badge-blue",
  wont_have: "badge-neutral",
}[p] || "badge-neutral");

export const priorityLabel = (p) => ({
  must_have: "Must Have",
  should_have: "Should Have",
  could_have: "Could Have",
  wont_have: "Won't Have",
}[p] || p);

export const scoreColor = (s) =>
  s >= 0.75 ? "score-high" : s >= 0.5 ? "score-mid" : "score-low";

// ─── Trigger a file download from a Blob ─────────────────────────────────────
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}