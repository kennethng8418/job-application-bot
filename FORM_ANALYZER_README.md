# AshbyHQ Form Analyzer

Scrape and analyze AshbyHQ job application forms to understand what fields and questions you need to fill out before applying.

## Features

- 🔍 **Scrapes all form fields** from AshbyHQ job applications
- 📊 **Categorizes questions** (Personal Info, EEOC, Work Authorization, etc.)
- ✅ **Identifies required vs optional fields**
- 📋 **Extracts all answer options** for radio/checkbox questions
- 💾 **Exports to JSON** for record-keeping
- 🎯 **Detects field types** (text, textarea, file upload, Yes/No, radio, checkbox, select)

## Installation

Already installed with the main bot! No additional dependencies needed.

## Usage

### 1. Edit the URL list

Open `src/analyze-form.ts` and add the job URLs you want to analyze:

```typescript
const jobUrls = [
  'https://jobs.ashbyhq.com/Rogo/71849dc9-85cb-4daa-ac47-a819b11b2ce0/application?src=LinkedIn',
  'https://jobs.ashbyhq.com/Company/job-id/application',
  // Add more URLs...
];
```

### 2. Run the analyzer

```bash
npm run analyze
```

The browser will open (non-headless by default) and you'll see the analysis in the console.

### 3. View results

Results are displayed in the console AND exported to a JSON file:
- Filename format: `form-analysis-{company}-{date}.json`
- Example: `form-analysis-Rogo-2025-05-05.json`

## Example Output

### Console Output

```
═══════════════════════════════════════════════════════════════════════
🔍 ANALYZING FORM
═══════════════════════════════════════════════════════════════════════

🏢 Company: Rogo
💼 Job Title: Software Engineer

📝 Found 8 text input(s)
  ✓ TEXT: First Name
  ✓ TEXT: Last Name
  ✓ EMAIL: Email
  ✓ PHONE: Phone Number
  ○ URL: LinkedIn URL
  ○ URL: GitHub URL
  ○ TEXT: Portfolio Website
  ✓ TEXT: Location

📄 Found 2 textarea(s)
  ✓ TEXTAREA: Why are you interested in this role?
  ○ TEXTAREA: Tell us about a challenging project

📎 Found 1 file input(s)
  ✓ FILE: Resume (application/pdf)

🔘 Analyzing Yes/No button questions...
  ✓ YES/NO: Are you a US Citizen or Permanent Resident?
  ✓ YES/NO: Do you require visa sponsorship?
  ✓ YES/NO: Are you at least 18 years old?

🔘 Analyzing radio button questions...
  ○ RADIO: Please select your gender
      - Male
      - Female
      - Non-binary
      - Decline to self-identify

☑️  Analyzing checkbox questions...
  ✓ CHECKBOX: How did you hear about us?
      - LinkedIn
      - Indeed
      - Glassdoor
      - Referral
      - Other

═══════════════════════════════════════════════════════════════════════
📊 FORM ANALYSIS SUMMARY
═══════════════════════════════════════════════════════════════════════

🏢 Company: Rogo
💼 Job Title: Software Engineer
🔗 URL: https://jobs.ashbyhq.com/Rogo/71849dc9-85cb-4daa-ac47-a819b11b2ce0/application
⏰ Analyzed: 5/5/2025, 2:30:45 PM

📈 STATISTICS:
  Total Fields: 18
  Required: 12
  Optional: 6

📋 FIELDS BY TYPE:
  TEXT: 8
  YESNO-BUTTON: 3
  TEXTAREA: 2
  RADIO: 2
  CHECKBOX: 2
  FILE: 1

🏷️  FIELDS BY CATEGORY:
  Personal Information: 8
  Work Authorization: 3
  Open-ended Questions: 2
  EEOC Demographics: 2
  Referral: 2
  Documents: 1

✅ FEATURES:
  Resume Upload: Yes
  Cover Letter: No
  EEOC Questions: Yes
  Visa Questions: Yes

═══════════════════════════════════════════════════════════════════════

💾 Analysis exported to: ./form-analysis-Rogo-2025-05-05.json
```

### JSON Export Structure

```json
{
  "jobUrl": "https://jobs.ashbyhq.com/Rogo/71849dc9-85cb-4daa-ac47-a819b11b2ce0/application",
  "jobTitle": "Software Engineer",
  "company": "Rogo",
  "analyzedAt": "2025-05-05T14:30:45.123Z",
  "fields": [
    {
      "type": "text",
      "label": "First Name",
      "id": "12345-first-name",
      "required": true,
      "placeholder": "Enter your first name",
      "detectedCategory": "Personal Information"
    },
    {
      "type": "yesno-button",
      "label": "Are you a US Citizen or Permanent Resident?",
      "required": true,
      "options": ["Yes", "No"],
      "detectedCategory": "Work Authorization"
    },
    {
      "type": "radio",
      "label": "Do you now, or will you in the future require visa sponsorship?",
      "required": true,
      "options": [
        "No",
        "Yes, I will need to transfer an existing work visa",
        "Yes, I will require a new visa sponsorship"
      ],
      "description": "Visa sponsorship is considered on a case-by-case basis",
      "detectedCategory": "Work Authorization"
    },
    {
      "type": "checkbox",
      "label": "How did you hear about us?",
      "required": true,
      "options": ["LinkedIn", "Indeed", "Glassdoor", "Referral", "Other"],
      "detectedCategory": "Referral"
    },
    {
      "type": "file",
      "label": "Resume",
      "required": true,
      "description": "application/pdf",
      "detectedCategory": "Documents"
    },
    {
      "type": "textarea",
      "label": "Why are you interested in this role?",
      "required": true,
      "placeholder": "Tell us what excites you...",
      "detectedCategory": "Open-ended Questions"
    }
  ],
  "summary": {
    "totalFields": 18,
    "requiredFields": 12,
    "optionalFields": 6,
    "fieldsByType": {
      "text": 8,
      "yesno-button": 3,
      "textarea": 2,
      "radio": 2,
      "checkbox": 2,
      "file": 1
    },
    "fieldsByCategory": {
      "Personal Information": 8,
      "Work Authorization": 3,
      "Open-ended Questions": 2,
      "EEOC Demographics": 2,
      "Referral": 2,
      "Documents": 1
    },
    "hasResumeUpload": true,
    "hasCoverLetter": false,
    "hasEEOC": true,
    "hasVisaQuestions": true
  }
}
```

## Field Types Detected

| Type | Description | Examples |
|------|-------------|----------|
| `text` | Single-line text input | First Name, Last Name, Location |
| `email` | Email address field | Email |
| `phone` | Phone number field | Phone Number |
| `url` | URL field | LinkedIn, GitHub, Portfolio |
| `textarea` | Multi-line text | Cover letter, Why are you interested? |
| `file` | File upload | Resume, Cover Letter |
| `yesno-button` | Yes/No button questions | US Citizen, Visa Sponsorship |
| `radio` | Radio button questions | Gender, Sponsorship type |
| `checkbox` | Checkbox questions | How did you hear about us? |
| `select` | Dropdown menus | Country, State |

## Field Categories

The analyzer automatically categorizes fields into:

- **Personal Information** - Name, email, phone, LinkedIn, GitHub, location
- **Work Authorization** - Citizenship, visa sponsorship, work authorization
- **EEOC Demographics** - Gender, race, veteran status
- **Work Preferences** - Remote/hybrid, location hubs, start date
- **Documents** - Resume, cover letter uploads
- **Referral** - How did you hear about us?
- **Open-ended Questions** - Why interested, tell us about yourself, etc.
- **Age Verification** - Are you 18+?
- **Other** - Uncategorized fields

## Use Cases

### 1. **Pre-Application Planning**
Analyze a form before applying to see what information you'll need to prepare:
```bash
npm run analyze
```

Check the JSON to see all required fields and prepare your answers in advance.

### 2. **Compare Multiple Job Applications**
Analyze multiple forms to see which companies ask similar questions:
```typescript
const jobUrls = [
  'https://jobs.ashbyhq.com/Company1/job-id/application',
  'https://jobs.ashbyhq.com/Company2/job-id/application',
  'https://jobs.ashbyhq.com/Company3/job-id/application'
];
```

### 3. **Identify Missing Bot Handlers**
If the bot is failing to fill certain fields, use the analyzer to see what field types are present and add handlers accordingly.

### 4. **Export for Record-Keeping**
Keep a JSON file of each application's questions for future reference.

## Configuration

### Headless Mode

Edit `src/analyze-form.ts` line 16:
```typescript
await analyzer.init(true);  // true = headless (no browser window)
await analyzer.init(false); // false = visible browser (default)
```

### Custom Export Filename

Edit `src/analyze-form.ts` around line 30:
```typescript
const filename = `./custom-analysis-${company}.json`;
await analyzer.exportToJSON(result, filename);
```

## Programmatic Usage

You can also use the analyzer programmatically:

```typescript
import { AshbyFormAnalyzer } from './src/form-analyzer';

const analyzer = new AshbyFormAnalyzer();
await analyzer.init(false);

const result = await analyzer.analyzeForm('https://jobs.ashbyhq.com/...');

// Access the data
console.log(result.summary.totalFields);
console.log(result.fields);

// Export
await analyzer.exportToJSON(result, 'my-analysis.json');

await analyzer.close();
```

## Tips

1. **Run before applying** - Analyze the form first to see what you'll need
2. **Check required fields** - Focus on the `✓` marked fields in the output
3. **Review open-ended questions** - These require AI or manual answers
4. **Export for comparison** - Keep JSON files to compare different companies
5. **Use for testing** - Test your bot on forms you've already analyzed

## Limitations

- Only works with AshbyHQ forms
- May not detect dynamically loaded fields (AJAX)
- Custom JavaScript components may not be recognized
- Conditional questions (based on previous answers) may not appear

## Troubleshooting

### "No fields found"
- Check if the URL is correct
- Make sure the page has fully loaded (increase wait time)
- Try non-headless mode to see what's happening

### "Cannot find label"
- Some fields may not have proper labels
- Check the JSON export for `name` or `id` attributes

### "Export failed"
- Make sure you have write permissions in the current directory
- Check if there's enough disk space

## Integration with Main Bot

Use the analyzer to:
1. **Identify missing handlers** - See what field types your bot doesn't handle yet
2. **Update resume data** - Make sure you have all the info needed in your config
3. **Test AI prompts** - See what open-ended questions the AI will need to answer
4. **Plan automation** - Decide which jobs are worth automating vs manual application

---

**Created**: 2025-05-05
**Part of**: AshbyHQ Job Application Bot
**See also**: `BOT_FEATURES.md`, `README.md`, `IMPROVEMENT_SUGGESTIONS.md`
