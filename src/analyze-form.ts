// Analyze AshbyHQ job application forms
import { AshbyFormAnalyzer } from './form-analyzer';

async function main() {
  // Add job URLs to analyze here
  const jobUrls = [
    'https://jobs.ashbyhq.com/Commure/2c6bf269-a6fa-414f-9082-0de727863a0c/application?utm_source=PnDq6E4Omw&source=X34Yya61zq',
    'https://jobs.ashbyhq.com/check-technologies/f8e220b3-438a-45fc-95b3-423f817eddec/application?utm_source=linkedin',
    'https://jobs.ashbyhq.com/edra/924cd61b-5f39-47b4-9ab2-32ec83dff729/application?utm_source=EppnQVy0Go&source=LinkedIn',
    'https://jobs.ashbyhq.com/traba/fd18499c-3a81-474a-9df8-0b5c9abef246/application?src=LinkedIn',
    'https://jobs.ashbyhq.com/whatnot/19355c48-5f94-4abe-9458-12163838fbc7/application?utm_source=LinkedInJobWrapping',
    'https://jobs.ashbyhq.com/ProximaAI/6959e5ca-709d-4fa4-9cdc-41c4e576faec/application?utm_source=q5V9RL0yK3',
    'https://jobs.ashbyhq.com/imprint/ff86787c-a37c-402a-ab16-a4fec9a68b7e/application?utm_source=2DzDkvddVO',
    'https://jobs.ashbyhq.com/Rogo/71849dc9-85cb-4daa-ac47-a819b11b2ce0/application?src=LinkedIn',
    'https://jobs.ashbyhq.com/glimpse/767a3a59-53d6-4306-afae-6b05a265ba82/application?utm_source=4M0PNbwNk7&src=linkedin',
    'https://jobs.ashbyhq.com/rilla/37228ca3-4e4a-4e3c-9414-d8a2046ff496/application?utm_source=v2R06b6zkn',
    'https://jobs.ashbyhq.com/maybern/b9df4d9a-7247-4a3c-b94a-dd1e23ee1c22/application',
    'https://jobs.ashbyhq.com/go-augment/ca724d16-4ce7-452c-a766-765bc7759e5b/application?utm_source=Bx6ybYPvbD',
    'https://jobs.ashbyhq.com/january/7b1fac0b-9860-441c-bbf7-2cf47b387e00/application?utm_source=LinkedIn_Limited',
  ];

  if (jobUrls.length === 0) {
    console.log('⚠️  No job URLs configured!');
    console.log('Please edit src/analyze-form.ts and add job URLs to analyze.');
    return;
  }

  const analyzer = new AshbyFormAnalyzer();

  try {
    // Initialize analyzer (set to false to see the browser)
    await analyzer.init(false);

    for (const jobUrl of jobUrls) {
      console.log('\n' + '═'.repeat(70));
      console.log('🔍 ANALYZING FORM');
      console.log('═'.repeat(70));

      // Analyze the form
      const result = await analyzer.analyzeForm(jobUrl);

      // Print summary to console
      analyzer.printAnalysis(result);

      // Export to JSON file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const company = result.company || 'unknown';
      const filename = `./form-analysis-${company}-${timestamp}.json`;
      await analyzer.exportToJSON(result, filename);

      // Wait between forms if analyzing multiple
      if (jobUrls.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n✨ Analysis complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await analyzer.close();
  }
}

// Run the analyzer
if (require.main === module) {
  main();
}
