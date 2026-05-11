import * as fs from 'fs';
import * as path from 'path';

export interface SubmissionLogEntry {
  timestamp: string;
  company: string;
  status: 'success' | 'error' | 'unknown';
  message: string;
  jobUrl: string;
  screenshotPath: string | null;
  durationMs: number;
  errorDetails: string | null;
}

function readExistingEntries(logFile: string): SubmissionLogEntry[] {
  if (!fs.existsSync(logFile)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(logFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`  ⚠️  ${logFile} did not contain a JSON array — starting fresh.`);
      return [];
    }
    return parsed as SubmissionLogEntry[];
  } catch (error) {
    console.warn(`  ⚠️  Could not parse ${logFile} (${error}). Starting fresh.`);
    return [];
  }
}

export async function logSubmission(entry: SubmissionLogEntry): Promise<void> {
  const logDir = path.resolve(process.cwd(), 'logs');
  const logFile = path.join(logDir, 'submissions.json');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const entries = readExistingEntries(logFile);
    entries.push(entry);
    fs.writeFileSync(logFile, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`  📝 Logged submission to ${logFile}`);
  } catch (error) {
    console.warn(`  ⚠️  Failed to write submission log: ${error}`);
  }
}
