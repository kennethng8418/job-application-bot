import dotenv from 'dotenv';
dotenv.config();

import { resumeData } from '../config/resume-data';
import { AshbyJobApplicationBot } from './ashby-bot';
import { GreenhouseJobApplicationBot } from './greenhouse-bot';
import { logSubmission } from './utils/submission-logger';
import { initMongo, closeMongo } from './utils/mongo-client';

function companyFromUrl(url: string): string {
  const embedMatch = url.match(/[?&]for=([^&]+)/);
  if (embedMatch) return embedMatch[1];
  const ghPath = url.match(/greenhouse\.io\/([^/]+)\/jobs\//);
  if (ghPath) return ghPath[1];
  const ashbyPath = url.match(/ashbyhq\.com\/([^/]+)/);
  if (ashbyPath) return ashbyPath[1];
  return 'unknown';
}

type Platform = 'ashby' | 'greenhouse' | 'unknown';

function detectPlatform(url: string): Platform {
  if (url.includes('ashbyhq.com')) return 'ashby';
  if (url.includes('greenhouse.io')) return 'greenhouse';
  return 'unknown';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  await initMongo();

  const jobUrls: string[] = [
    // Add job URLs here (Ashby or Greenhouse). Examples:
    // 'https://jobs.ashbyhq.com/replit/...',
    // 'https://job-boards.greenhouse.io/discord/jobs/...',
    // 'https://job-boards.greenhouse.io/courierhealth/jobs/5093155007?source=linkedin',
    'https://job-boards.greenhouse.io/embed/job_app?for=mixpanel&gh_src=beca423f1&token=7774151',
    'https://job-boards.greenhouse.io/trueanomalyinc/jobs/5092069007',
    'https://job-boards.greenhouse.io/discord/jobs/8520965002?gh_src=5117e0c52us',
    'https://job-boards.greenhouse.io/workato/jobs/8112909002?gh_src=162ubekx2us',
    'https://job-boards.greenhouse.io/growtherapy/jobs/4678587005?gh_src=8d47tscl5us',
    'https://job-boards.greenhouse.io/chime/jobs/8499450002?gh_jid=8499450002&gh_src=35f490fd2',
    'https://job-boards.greenhouse.io/incidentiq/jobs/7498237003?gh_src=9514ca0e3us',
    'https://job-boards.eu.greenhouse.io/stubhubinc/jobs/4755033101?gh_src=47e65a22teu',
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

      try {
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
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Application failed for ${jobUrl}: ${errMsg}`);
        await logSubmission({
          timestamp: new Date().toISOString(),
          company: companyFromUrl(jobUrl),
          status: 'error',
          message: 'Application aborted due to error',
          jobUrl,
          screenshotPath: null,
          durationMs: 0,
          errorDetails: errMsg,
        });
        console.log('  ↪ Continuing to next application...');
      }

      console.log(`${'-'.repeat(70)}\n`);

      if (jobUrls.length > 1) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log('✨ All applications processed!');
  } finally {
    console.log('\n⏳ Browser will stay open for 20 seconds for review...');
    await new Promise(r => setTimeout(r, 20000));
    if (initializedAshby) await ashbyBot.close();
    if (initializedGreenhouse) await greenhouseBot.close();
    await closeMongo();
  }
}

main();
