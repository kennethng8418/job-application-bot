import dotenv from 'dotenv';
dotenv.config();

import { resumeData } from '../config/resume-data';
import { AshbyJobApplicationBot } from './ashby-bot';
import { GreenhouseJobApplicationBot } from './greenhouse-bot';

type Platform = 'ashby' | 'greenhouse' | 'unknown';

function detectPlatform(url: string): Platform {
  if (url.includes('ashbyhq.com')) return 'ashby';
  if (url.includes('greenhouse.io')) return 'greenhouse';
  return 'unknown';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const jobUrls: string[] = [
    // Add job URLs here (Ashby or Greenhouse). Examples:
    // 'https://jobs.ashbyhq.com/replit/...',
    // 'https://job-boards.greenhouse.io/discord/jobs/...',
  ];

  if (jobUrls.length === 0) {
    console.log('⚠️  No job URLs configured!');
    console.log('Edit src/apply.ts and add URLs to the jobUrls array.');
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing ${jobUrls.length} job application(s)${dryRun ? ' [DRY RUN]' : ''}`);
  console.log(`${'='.repeat(70)}\n`);

  const ashbyBot = new AshbyJobApplicationBot(resumeData);
  const greenhouseBot = new GreenhouseJobApplicationBot(resumeData, { dryRun });

  let initializedAshby = false;
  let initializedGreenhouse = false;

  try {
    for (const jobUrl of jobUrls) {
      const platform = detectPlatform(jobUrl);
      console.log(`\n${'-'.repeat(70)}`);

      if (platform === 'ashby') {
        if (!initializedAshby) {
          await ashbyBot.init(false);
          initializedAshby = true;
        }
        await ashbyBot.applyToJob(jobUrl);
      } else if (platform === 'greenhouse') {
        if (!initializedGreenhouse) {
          await greenhouseBot.init(false);
          initializedGreenhouse = true;
        }
        await greenhouseBot.applyToJob(jobUrl);
      } else {
        console.log(`⏭️  Skipping unsupported URL: ${jobUrl}`);
      }

      console.log(`${'-'.repeat(70)}\n`);

      if (jobUrls.length > 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log('✨ All applications processed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('\n⏳ Browser will stay open for 20 seconds for review...');
    await new Promise(r => setTimeout(r, 20000));
    if (initializedAshby) await ashbyBot.close();
    if (initializedGreenhouse) await greenhouseBot.close();
  }
}

main();
