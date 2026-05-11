// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { resumeData } from '../config/resume-data';
import { AshbyJobApplicationBot } from './ashby-bot';

// Main execution
async function main() {
  // Add your AshbyHQ job posting URLs here
  const jobUrls = [
    // AshbyHQ examples:
    
    // 'https://jobs.ashbyhq.com/maybern/b9df4d9a-7247-4a3c-b94a-dd1e23ee1c22/application',
    // 'https://jobs.ashbyhq.com/go-augment/ca724d16-4ce7-452c-a766-765bc7759e5b/application?utm_source=Bx6ybYPvbD',
    // 'https://jobs.ashbyhq.com/january/7b1fac0b-9860-441c-bbf7-2cf47b387e00/application?utm_source=LinkedIn_Limited',
    // 'https://jobs.ashbyhq.com/edra/924cd61b-5f39-47b4-9ab2-32ec83dff729/application?utm_source=EppnQVy0Go&source=LinkedIn',
    // 'https://jobs.ashbyhq.com/ProximaAI/6959e5ca-709d-4fa4-9cdc-41c4e576faec/application?utm_source=q5V9RL0yK3',
    // 'https://jobs.ashbyhq.com/Rogo/71849dc9-85cb-4daa-ac47-a819b11b2ce0/application?src=LinkedIn',
    // 'https://jobs.ashbyhq.com/imprint/ff86787c-a37c-402a-ab16-a4fec9a68b7e/application?utm_source=2DzDkvddVO'
    'https://jobs.ashbyhq.com/ProximaAI/6959e5ca-709d-4fa4-9cdc-41c4e576faec/application?utm_source=q5V9RL0yK3'
  ];

  if (jobUrls.length === 0) {
    console.log('⚠️  No AshbyHQ job URLs configured!');
    console.log('Please edit src/apply.ts and add your job URLs to the jobUrls array.');
    console.log('\nExample:');
    console.log('  https://jobs.ashbyhq.com/company/job-id/application');
    return;
  }

  // Validate all URLs are AshbyHQ
  const invalidUrls = jobUrls.filter(url => !url.includes('ashbyhq.com'));
  if (invalidUrls.length > 0) {
    console.log('⚠️  Non-AshbyHQ URLs detected:');
    invalidUrls.forEach(url => console.log(`  - ${url}`));
    console.log('\nThis bot only supports AshbyHQ applications.');
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing ${jobUrls.length} AshbyHQ job application(s)`);
  console.log(`${'='.repeat(70)}\n`);

  const bot = new AshbyJobApplicationBot(resumeData);

  try {
    await bot.init(false); // Set to true for headless mode

    for (const jobUrl of jobUrls) {
      console.log(`\n${'-'.repeat(70)}`);
      await bot.applyToJob(jobUrl);
      console.log(`${'-'.repeat(70)}\n`);

      // Wait between applications to avoid rate limiting
      if (jobUrls.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('✨ All applications processed!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Keep browser open for manual review
    console.log('\n⏳ Browser will stay open for 30 seconds for review...');
    await new Promise(resolve => setTimeout(resolve, 20000));
    await bot.close();
  }
}

// Run the bot
if (require.main === module) {
  main();
}

export { AshbyJobApplicationBot };
