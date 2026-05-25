import * as fs from 'fs';
import * as path from 'path';
import { getCollection } from './mongo-client';

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

// Captured ONCE per process — all submissions in a single bot run share this id.
// Format: YYYY-MM-DDTHH-MM-SS (filesystem-safe — no colons).
const RUN_ID = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace(/-\d{3}Z$/, 'Z'); // strip milliseconds for shorter filenames

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

function writeLog(logFile: string, entry: SubmissionLogEntry): void {
  const entries = readExistingEntries(logFile);
  entries.push(entry);
  fs.writeFileSync(logFile, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function logSubmission(entry: SubmissionLogEntry): Promise<void> {
  const logDir = path.resolve(process.cwd(), 'logs');

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const rollingFile = path.join(logDir, 'submissions.json');
    const runFile = path.join(logDir, `run-${RUN_ID}.json`);

    writeLog(rollingFile, entry);
    writeLog(runFile, entry);

    console.log(`  📝 Logged submission to ${rollingFile} and ${runFile}`);
  } catch (error) {
    console.warn(`  ⚠️  Failed to write submission log: ${error}`);
  }

  const collection = getCollection();
  if (collection) {
    try {
      await collection.insertOne(entry);
      console.log(`  🗄️  Logged submission to MongoDB`);
    } catch (error) {
      console.warn(`  ⚠️  Failed to write submission to MongoDB: ${error}`);
    }
  }
}
