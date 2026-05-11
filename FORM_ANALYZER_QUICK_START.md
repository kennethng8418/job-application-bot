# Form Analyzer - Quick Start Guide

## What is it?

A scraping tool that analyzes AshbyHQ job application forms to show you what questions and fields you'll need to fill out BEFORE applying.

## Quick Start (3 steps)

### 1. Add your job URL

Edit `src/analyze-form.ts` line 6:

```typescript
const jobUrls = [
  'https://jobs.ashbyhq.com/YourCompany/job-id/application',
];
```

### 2. Run the analyzer

```bash
npm run analyze
```

### 3. Review the results

- **Console**: See all fields with ✓ (required) or ○ (optional)
- **JSON file**: Exported as `form-analysis-{company}-{date}.json`

## What you'll see

```
📝 Found 8 text input(s)
  ✓ TEXT: First Name
  ✓ TEXT: Last Name
  ✓ EMAIL: Email
  ○ URL: LinkedIn URL

📄 Found 2 textarea(s)
  ✓ TEXTAREA: Why are you interested in this role?

🔘 Analyzing Yes/No button questions...
  ✓ YES/NO: Are you a US Citizen?
  ✓ YES/NO: Do you require visa sponsorship?

📊 SUMMARY:
  Total Fields: 18
  Required: 12
  Optional: 6
```

## Use Cases

1. **Before Applying**: See what info you need to prepare
2. **Compare Jobs**: Analyze multiple applications at once
3. **Bot Testing**: Identify fields your automation might miss
4. **Record Keeping**: Export JSON for future reference

## Tips

- Required fields marked with ✓
- Check the "Open-ended Questions" category for AI answers needed
- Review JSON export for full details
- Non-headless mode lets you watch the scraping

## Need More Info?

See `FORM_ANALYZER_README.md` for full documentation.

---

**Command**: `npm run analyze`
**Files**: `src/analyze-form.ts`, `src/form-analyzer.ts`
