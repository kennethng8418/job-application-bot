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

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'submissions.json');

function readExistingEntries(): SubmissionLogEntry[] {
  if (!fs.existsSync(LOG_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`  ⚠️  ${LOG_FILE} did not contain a JSON array — starting fresh.`);
      return [];
    }
    return parsed as SubmissionLogEntry[];
  } catch (error) {
    console.warn(`  ⚠️  Could not parse ${LOG_FILE} (${error}). Starting fresh.`);
    return [];
  }
}

export async function logSubmission(entry: SubmissionLogEntry): Promise<void> {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const entries = readExistingEntries();
    entries.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`  📝 Logged submission to ${LOG_FILE}`);
  } catch (error) {
    console.warn(`  ⚠️  Failed to write submission log: ${error}`);
  }
}
