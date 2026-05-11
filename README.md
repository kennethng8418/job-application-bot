# AshbyHQ Job Application Bot

Automated job application submission for AshbyHQ-powered career pages using Playwright, TypeScript, and Claude AI.

## Features

- **AshbyHQ specialized** - Optimized specifically for AshbyHQ application forms
- **Auto-fill personal information** - Name, email, phone, LinkedIn, GitHub, portfolio, legal name
- **Resume upload** - Automatically uploads your resume (waits for AshbyHQ to parse it)
- **AI-powered answers** - Uses Claude AI to generate personalized answers to application questions
- **Common questions** - Handles sponsorship, remote work, start date questions
- **Visual feedback** - Watch the form being filled in real-time
- **Safe operation** - Manual review before submission (does NOT auto-submit)

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A resume file (PDF format recommended)

## Setup

1. **Install dependencies**

```bash
npm install
```

2. **Install Playwright browsers**

```bash
npx playwright install
```

3. **Configure your resume data**

Edit `config/resume-data.ts` with your information:

```typescript
export const resumeData: ResumeData = {
  personalInfo: {
    firstName: 'Your First Name',
    lastName: 'Your Last Name',
    email: 'your.email@example.com',
    phone: '+1-555-123-4567',
    location: 'Your City, State',
    linkedin: 'https://linkedin.com/in/yourprofile',
    github: 'https://github.com/yourusername',
    portfolio: 'https://yourwebsite.com',
  },
  resumePath: './resumes/resume.pdf',
  preferences: {
    sponsorship: 'no',
    remote: 'yes',
    startDate: '2 weeks',
  },
  aiConfig: {
    enabled: true,
    background: `Your professional background and story.
    Mention how you got into programming, your experience, and what you're passionate about.
    This helps Claude generate personalized answers to application questions.`,
    maxTokens: 500,
  },
};
```

4. **Set up AI answer generation (Optional but Recommended)**

To enable AI-powered answers for text questions like "How'd you get into programming?":

**Option 1: Use .env file (Recommended)**

Edit the `.env` file and add your API key:

```bash
ANTHROPIC_API_KEY=sk-ant-your-actual-api-key-here
```

**Option 2: Set environment variable**

```bash
export ANTHROPIC_API_KEY='sk-ant-your-actual-api-key-here'
```

**Option 3: Add directly in config**

Edit `config/resume-data.ts`:

```typescript
aiConfig: {
  enabled: true,
  apiKey: 'sk-ant-your-actual-api-key-here',
  background: `Your professional story here...`,
}
```

Get your API key from: https://console.anthropic.com/

5. **Add your resume**

Place your resume PDF in the `resumes/` folder:

```bash
cp /path/to/your/resume.pdf ./resumes/resume.pdf
```

6. **Add job URLs**

Edit `src/apply.ts` and add AshbyHQ job posting URLs:

```typescript
const jobUrls = [
  'https://jobs.ashbyhq.com/company/job-id/application',
  'https://jobs.ashbyhq.com/another-company/another-job-id/application',
  // Add more AshbyHQ URLs here...
];
```

## Usage

**Run in development mode** (visible browser):

```bash
npm run dev
```

**Build and run**:

```bash
npm run build
npm start
```

## How It Works

1. **Browser Launch** - Opens browser and navigates to AshbyHQ job posting
2. **Form Detection** - Waits for the application form to load
3. **Resume Upload** - Uploads your resume file first (waits 20 seconds for AshbyHQ to parse)
4. **Auto-fill** - Fills in personal information fields using AshbyHQ-specific selectors
5. **Questions** - Attempts to answer common questions (sponsorship, remote, start date)
6. **AI-Powered Answers** - Detects text area questions (e.g., "How'd you get into programming?") and uses Claude AI to generate personalized, professional responses based on your background
7. **Manual Review** - Pauses for you to review before submission (does NOT auto-submit)

## AI Answer Generation

When enabled, the bot uses Claude AI to automatically answer open-ended questions like:

- "How'd you get into programming?"
- "Why are you interested in this role?"
- "Tell us about yourself"
- "What are you looking for in your next role?"

**How it works:**
1. Bot detects text area fields in the application
2. Extracts the question from labels, placeholders, or aria-labels
3. Sends the question to Claude AI along with your background context
4. Claude generates a personalized 2-4 sentence response
5. Response is automatically filled into the field

**Customizing AI responses:**
Edit your `background` in `config/resume-data.ts` to personalize answers:

```typescript
aiConfig: {
  enabled: true,
  background: `I got into programming in high school when I built a game using Python.
  I'm passionate about backend systems and distributed architectures.
  I have 5 years of experience with Go, Kubernetes, and PostgreSQL.
  I'm looking for a role where I can work on scalable infrastructure.`,
}
```

The more detailed your background, the better the AI-generated answers will be!

## Important Notes

- **Manual Review**: The bot fills the form but does NOT submit automatically. Always review before submitting.
- **AshbyHQ Only**: This bot is specialized for AshbyHQ applications only.
- **Custom Questions**: Each job may have unique questions. The bot handles common ones, but you may need to fill some manually.
- **Rate Limiting**: The bot waits between applications to avoid triggering rate limits.
- **Form Variations**: AshbyHQ forms may vary by company. If fields aren't filling, you may need to customize the selectors.

## Customization

### Update Field Selectors

If certain fields aren't being filled, inspect the form and update selectors in `src/ashby-bot.ts` → `fillPersonalInfo()` method:

```typescript
const fieldMappings = [
  { selector: 'input[name="custom-field"]', value: 'your value' },
];
```

### Add Custom Question Handlers

Add logic in the `handleAdditionalQuestions()` method in `src/ashby-bot.ts` to handle job-specific questions.

### Headless Mode

To run without visible browser, edit `src/apply.ts` and update the `init()` call:

```typescript
await bot.init(true); // true = headless
```

### Adjust Resume Parse Wait Time

AshbyHQ takes time to parse your resume. If you need more/less time, edit `src/ashby-bot.ts:122`:

```typescript
await this.page.waitForTimeout(10000); // Adjust milliseconds as needed
```

## Architecture

The project uses a modular architecture:

```
src/
├── base-application-bot.ts   # Base interface
├── ashby-bot.ts               # AshbyHQ implementation
├── ai-answer-generator.ts     # Claude AI integration
└── apply.ts                   # Main application script
```

## Troubleshooting

**Resume not uploading?**
- Ensure the path in `config/resume-data.ts` is correct
- Check file exists in `resumes/` folder
- Try using PDF format (most compatible)

**Fields not filling?**
- AshbyHQ forms vary by company
- Inspect the page to find the correct selectors
- Update selectors in `src/ashby-bot.ts`

**Browser not launching?**
- Run `npx playwright install` to install browsers

**AI answers not working?**
- Ensure `ANTHROPIC_API_KEY` is set in your environment
- Check that `aiConfig.enabled` is `true` in `config/resume-data.ts`
- Verify your API key is valid at https://console.anthropic.com/

**Non-AshbyHQ URL?**
- This bot only works with AshbyHQ (jobs.ashbyhq.com)
- Check the URL contains `ashbyhq.com`

## Ethical Usage

This tool is for personal use to streamline repetitive form filling. Please:
- Review each application before submitting
- Don't spam applications
- Respect company rate limits
- Ensure all information is accurate

## License

MIT
