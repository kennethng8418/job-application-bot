# Submission Log Design

**Date:** 2026-05-11
**Status:** Approved, ready for implementation plan

## Goal

Persist a JSON log of every submission attempt (success, error, or unknown) so the user has a chronological record across runs, with enough detail to debug failures and trace back to the original job posting.

## File Layout

- **Path:** `logs/submissions.json`
- **Format:** Single JSON array. Each submission attempt appends one entry.
- **Created lazily:** if the file does not exist, it is created as `[]` on first write.

## Entry Shape

```ts
interface SubmissionLogEntry {
  timestamp: string;          // ISO 8601, e.g. "2026-05-11T14:30:00.000Z"
  company: string;            // from extractCompanyName(), or "unknown"
  status: "success" | "error" | "unknown";
  message: string;            // human-readable result message
  jobUrl: string;             // page.url() captured at submission time
  screenshotPath: string | null; // path returned by captureSubmissionProof, or null if not captured
  durationMs: number;         // wall time from submit click to verification complete
  errorDetails: string | null; // raw error text when status !== "success", else null
}
```

## Architecture

### New module: `src/utils/submission-logger.ts`

Single exported function:

```ts
export async function logSubmission(entry: SubmissionLogEntry): Promise<void>
```

Behavior:
1. Ensure `logs/` directory exists (mkdir -p semantics).
2. Read `logs/submissions.json`. If missing, treat as empty array.
3. If the file exists but is not valid JSON (corruption), log a warning to console and treat existing contents as empty array — do not throw. The new entry is still written.
4. Push the new entry, write back with `JSON.stringify(arr, null, 2)`.
5. Errors writing the file should be caught and logged; they must not bubble up and break the submission flow.

### Integration in `src/ashby-bot.ts`

In `submitApplication()`:
- Capture `submitStartTime = Date.now()` immediately before clicking the submit button.
- After `verifySubmission()` returns, build a `SubmissionLogEntry` and call `logSubmission(entry)`.
- `durationMs = Date.now() - submitStartTime`.
- `errorDetails` is populated from `result.message` when `result.success === false`. (The existing `SubmissionResult` interface already carries the message — no new detection logic is needed.)

Edge cases that must also be logged:
- **Submit button not found / not clickable:** the current code returns early after a 30s wait. Log this as `status: "unknown"` with `message: "Submit button not found or not clickable"`, `screenshotPath: null`, and `errorDetails` describing the failure.
- **Exception during submission:** the outer `try/catch` in `submitApplication()` already swallows errors. Inside the catch, log `status: "unknown"` with the error text in `errorDetails`.

### Status mapping

The existing `SubmissionResult` has a `success: boolean`. We need three statuses for the log:
- `success` → `result.success === true`
- `error` → `result.success === false` AND verification detected an error message
- `unknown` → `result.success === false` AND no error was detected (the "status unclear" path)

To distinguish error vs. unknown, extend `SubmissionResult` with an optional `status: "success" | "error" | "unknown"` field set by `verifySubmission()`. This is a small additive change to an existing interface.

## Testing

- **Unit tests for `submission-logger.ts`:**
  - Creates the file when missing.
  - Appends to an existing array.
  - Recovers from a corrupt JSON file (logs warning, writes new entry on top of empty array).
  - Does not throw when the filesystem write fails (e.g., permission denied).
- **Manual end-to-end:** run a real submission against a test job page, confirm a new entry appears in `logs/submissions.json` with the expected fields.

## Out of Scope

- Log rotation / size limits. Revisit if `submissions.json` grows beyond a few thousand entries.
- Switching to JSONL format. The array format is fine for current volume.
- Querying / dashboard UI. The file is meant to be inspected manually or with `jq`.
- Email / webhook notifications.

## Trade-offs Considered

- **Array vs. JSONL:** array means rewriting the full file on each write. Acceptable at current scale. JSONL would be more robust for high-volume writes but adds complexity (manual line parsing for reads).
- **Separate success/failed files:** rejected — loses the chronological view, which is the primary use case.
