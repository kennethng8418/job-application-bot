# AshbyHQ Job Application Bot - Feature Summary

## Overview
Automated job application bot for AshbyHQ-powered application forms. Uses Playwright for browser automation and Claude AI (Anthropic) for intelligent question answering.

---

## Core Features

### 1. **Resume Upload**
- **Function**: `uploadResume()`
- **Location**: `src/ashby-bot.ts:173-210`
- Automatically detects and uploads PDF resume
- Tries multiple file input selectors
- Waits 10 seconds for file processing
- **Supported formats**: PDF

### 2. **Personal Information Filling**
- **Function**: `fillPersonalInfo()`
- **Location**: `src/ashby-bot.ts:51-171`
- **Fields handled**:
  - First Name
  - Last Name
  - Legal Name
  - Email
  - Phone Number
  - LinkedIn URL
  - GitHub URL
  - Portfolio/Website
  - Location/City
  - Full Name (combined field)

- **Strategy**:
  1. **Label-based filling** (primary method)
     - Case-insensitive label matching
     - Handles labels with `for` attribute
     - Works with IDs starting with numbers
  2. **Selector-based filling** (fallback)
     - Uses placeholder, name, and ID attributes
     - Skips already-filled fields

---

## Question Handlers

### 3. **Yes/No Button Questions**

#### a. US Citizen/Permanent Resident
- **Location**: `src/ashby-bot.ts:296-314`
- **Pattern**: `/US Citizen.*Permanent Resident|Permanent Resident.*US Citizen/i`
- **Handler Type**: Button-based (div with `yesno` class)
- **Logic**: Clicks YES if `usCitizen !== false`

#### b. Visa Sponsorship (Button-based)
- **Location**: `src/ashby-bot.ts:315-333`
- **Pattern**: `/sponsorship/i`
- **Handler Type**: Button-based (div with `yesno` class)
- **Comment**: `// Check if this is any sponsorship question (BUTTON-BASED Yes/No)`
- **Logic**:
  - Clicks NO if `requiresVisaSponsorship !== true`
  - Clicks YES if `requiresVisaSponsorship === true`

#### c. Age Verification (18+)
- **Location**: `src/ashby-bot.ts:336-364`
- **Pattern**: `/at least 18|18 years|age.*18|over 18/i`
- **Handler Type**: Button-based (div with `yesno` class)
- **Logic**: Always clicks YES

#### d. Work Authorization
- **Location**: `src/ashby-bot.ts:366-407`
- **Pattern**: `/legally authorized.*work|work authorization|authorized.*work.*country/i`
- **Handler Type**: Button-based (div with `yesno` class)
- **Exclusion**: Skips if question contains "sponsorship"
- **Logic**: Clicks YES if `legallyAuthorizedToWork !== false`

#### e. In-Office/Hybrid Work
- **Location**: `src/ashby-bot.ts:401-417`
- **Pattern**: `/in.*office.*days.*week|office.*\d+.*days|collaborative.*office|on.*site.*days/i`
- **Handler Type**: Button-based (div with `yesno` class)
- **Logic**: Always clicks YES (flexible with office/hybrid/remote)

#### f. Generic Yes/No Questions (AI-powered)
- **Location**: `src/ashby-bot.ts:419-444`
- **Handler Type**: Button-based (div with `yesno` class)
- **Condition**: Only runs if:
  - AI is enabled
  - Question wasn't already handled by specific handlers
- **Logic**: Uses Claude AI's `answerYesNoQuestion()` method

---

### 4. **Radio Button Questions**

#### a. Gender (EEOC)
- **Location**: `src/ashby-bot.ts:462-489`
- **Pattern**: `/^gender|input gender/i`
- **Handler Type**: Radio buttons in fieldset
- **Options**: Male, Female, Non-binary, Decline to self-identify
- **Source**: `resumeData.personalInfo.gender`

#### b. Race/Ethnicity (EEOC)
- **Location**: `src/ashby-bot.ts:491-518`
- **Pattern**: `/race|ethnicity|eeoc_race|hispanic or latino/i`
- **Handler Type**: Radio buttons in fieldset
- **Options**: Various race/ethnicity options
- **Source**: `resumeData.personalInfo.race`

#### c. Veteran Status (EEOC)
- **Location**: `src/ashby-bot.ts:520-547`
- **Pattern**: `/veteran|eeoc_veteran_status|protected veteran/i`
- **Handler Type**: Radio buttons in fieldset
- **Options**: Protected veteran status options
- **Source**: `resumeData.personalInfo.veteranStatus`

#### d. Visa Sponsorship (Radio-based)
- **Location**: `src/ashby-bot.ts:548-600`
- **Pattern**: `/sponsorship|require.*visa|visa.*sponsorship/i`
- **Handler Type**: Radio buttons in fieldset
- **Comment**: `// Sponsorship question (RADIO-BASED with multiple options)`
- **Logic**:
  - If `requiresVisaSponsorship !== true`: Selects "No"
  - If `requiresVisaSponsorship === true`: Selects first "Yes" option
- **Handles multi-option questions**:
  - "No"
  - "Yes, I will need to transfer an existing work visa"
  - "Yes, I will require a new visa sponsorship"

#### e. Office Hub Location
- **Location**: `src/ashby-bot.ts:602-673`
- **Pattern**: `/within.*miles.*hub|hub.*location|located.*hub|reside.*hub|preferred.*working.*location|select.*location|office.*location.*hub|50.*miles/i`
- **Handler Type**: Radio buttons OR checkboxes in fieldset
- **Logic**: Matches user's city from `personalInfo.location` to available hub options
- **Supported cities**:
  - New York
  - San Francisco
  - Los Angeles
  - Seattle
  - Boston
  - Austin
  - Chicago
  - Denver

---

### 5. **Checkbox Questions**

#### a. Office Location Checkboxes
- **Location**: `src/ashby-bot.ts:596-648`
- **Pattern**: `/office hub|office location|located.*office|within.*miles.*office/i`
- **Handler Type**: Checkboxes in fieldset
- **Logic**: Checks boxes matching user's location
- **Use case**: Multiple office location selection

#### b. "How did you hear about us?" (Checkbox version)
- **Location**: `src/ashby-bot.ts:651-698`
- **Pattern**: `/how did you hear|where did you hear|how.*you.*find.*opportunity|source of referral/i`
- **Handler Type**: Checkboxes in fieldset
- **Logic**:
  - Skips if no checkboxes found (likely text input)
  - Selects "LinkedIn" option
  - Handles label offset (fieldset legend)
- **Uses**: Retry logic with `checkWithRetry()`

---

### 6. **Text Input & Combobox Questions**

#### a. "How did you hear about us?" (Combobox version)
- **Location**: `src/ashby-bot.ts:700-732`
- **Pattern**: `/how did you hear|where did you hear|how.*you.*find.*opportunity/i`
- **Handler Type**: Combobox/autocomplete (`role="combobox"`)
- **Logic**:
  - Fills with "LinkedIn"
  - Presses Enter to confirm selection
- **Uses**: `fillWithRetry()` for validation

#### b. Text Areas (Cover Letter, Additional Info)
- **Location**: `src/ashby-bot.ts:734-798`
- **Handler Type**: `<textarea>` elements
- **Exclusions**:
  - reCAPTCHA fields
  - Hidden fields
- **Logic**: Uses Claude AI to generate contextual answers
- **Use case**: Open-ended questions requiring explanations

#### c. Text Input Questions
- **Location**: `src/ashby-bot.ts:800-870`
- **Handler Type**: `<input type="text">` elements
- **Special handling**:
  - **Location questions**: Auto-fills from `personalInfo.location`
    - Pattern: `/location|time.*zone|where.*you.*based|city.*state|where.*are.*you/i`
  - **Generic questions**: Uses Claude AI
    - Pattern: Questions containing `?` or keywords like "how", "why", "what", "where", "when", "please", "tell us", "describe", "explain"
  - **Combobox fields**: Presses Enter after filling

---

## AI Integration

### 7. **Claude AI Answer Generation**
- **File**: `src/ai-answer-generator.ts`
- **Model**: `claude-sonnet-4-5`
- **Features**:
  - Resume-aware (uploads PDF as context)
  - Personalized background context
  - Configurable max tokens

#### AI Prompt Rules
**Location**: `src/ai-answer-generator.ts:63-71`

1. **Resume Context**: Uses resume to provide accurate, specific details
2. **Yes/No Questions**: Answers ONLY with "Yes" or "No"
3. **Visa Questions**: Returns "N/A" or "None" if sponsorship not required
4. **Referral Source**: Returns "LinkedIn" (single word)
5. **Location Questions**: Returns ONLY the location from resume (e.g., "New York City, NY")
6. **Open-ended Questions**: Provides 2-4 sentence professional answers
7. **Natural Tone**: Conversational and genuine
8. **No Prefixes**: No "Answer:" or extra text

#### AI Methods

**a. `generateAnswer(question: string)`**
- **Location**: `src/ai-answer-generator.ts:40-114`
- General-purpose answer generation
- Handles text inputs, textareas, and open-ended questions
- Returns contextual answers based on resume

**b. `answerYesNoQuestion(question: string)`**
- **Location**: `src/ai-answer-generator.ts:116-163`
- Specialized for Yes/No questions
- Returns only "Yes" or "No"
- Uses minimal tokens (max: 10)
- Considers user's location, preferences, and profile

---

## Retry & Error Handling

### 8. **Retry Helper Functions**
- **File**: `src/utils/retry-helper.ts`

#### a. `clickWithRetry()`
- **Location**: `src/utils/retry-helper.ts:10-32`
- **Retries**: 3 attempts
- **Backoff**: Exponential (500ms, 1000ms, 1500ms)
- **Timeout**: 5 seconds per attempt
- **Returns**: `true` if successful, `false` if all attempts failed

#### b. `fillWithRetry()`
- **Location**: `src/utils/retry-helper.ts:42-78`
- **Retries**: 2 attempts
- **Validation**: Checks if value was actually filled
- **Auto-retry**: Clears and retries if validation fails
- **Timeout**: 5 seconds per attempt
- **Returns**: `true` if successful and validated, `false` otherwise

#### c. `checkWithRetry()`
- **Location**: `src/utils/retry-helper.ts:88-130`
- **Retries**: 3 attempts
- **Backoff**: Exponential (500ms, 1000ms, 1500ms)
- **Validation**: Verifies checkbox state after check/uncheck
- **Smart Skip**: Doesn't check if already in desired state
- **Returns**: `true` if successful, `false` if all attempts failed

---

### 9. **Proactive Required Field Filling**
- **Function**: `fillEmptyRequiredFields()`
- **Location**: `src/ashby-bot.ts:1072-1188`
- **When**: Called before first submission attempt
- **Logic**:
  1. Finds all fields with `required` or `aria-required="true"`
  2. Checks if each field is empty
  3. Fills empty fields using AI or config data
  4. Handles: text inputs, textareas, checkboxes, radio buttons
  5. Skips: file inputs (handled separately)

---

### 10. **Validation Error Handler**
- **Function**: `handleValidationErrors()`
- **Location**: `src/ashby-bot.ts:876-1070`
- **Status**: Implemented but not currently called after submission
- **Detection**: Looks for `[role="alert"][aria-live="assertive"]` container
- **Capabilities**:
  - Parses error messages
  - Extracts field names
  - Uses AI to fill missing fields
  - Handles: text, textarea, checkbox, radio, file inputs

---

## Submission

### 11. **Submit Application**
- **Function**: `submitApplication()`
- **Location**: `src/ashby-bot.ts:1190-1298`

#### Workflow:
1. **Proactive Filling**: Calls `fillEmptyRequiredFields()` before submission
2. **Button Detection**: Tries multiple selectors:
   - `.ashby-application-form-submit-button` (AshbyHQ-specific)
   - `button[type="submit"]`
   - `button:has-text("Submit")`
   - `button:has-text("Submit Application")`
   - `button:has-text("Apply")`
   - `button:has-text("Send Application")`
   - `input[type="submit"]`
   - `button.submit`
   - `[data-testid="submit-button"]`
   - `button[aria-label*="Submit"]`
3. **Visibility Check**: Verifies button is visible and enabled
4. **Scroll & Click**: Scrolls into view and clicks with retry logic
5. **Completion**: Waits 2 seconds after successful click

#### Fallback:
- If button not found: Waits 30 seconds for manual submission
- If click fails: Logs warning

---

## Configuration

### 12. **Resume Data Structure**
- **File**: `config/resume-data.ts`

```typescript
{
  personalInfo: {
    firstName: string
    lastName: string
    legalName?: string
    email: string
    phone: string
    location: string
    linkedin?: string
    github?: string
    portfolio?: string
    gender?: string
    race?: string
    veteranStatus?: string
  },

  preferences: {
    remote: string  // "Remote", "Hybrid", "On-site"
    workLocation?: string
    usCitizen: boolean
    requiresVisaSponsorship: boolean
    legallyAuthorizedToWork?: boolean
    over18?: boolean
    startDate?: string
  },

  resumePath: string,

  aiConfig?: {
    enabled: boolean
    apiKey?: string
    background?: string
    maxTokens?: number
  }
}
```

---

## Workflow

### 13. **Main Application Flow**
- **Function**: `applyToJob(jobUrl: string)`
- **Location**: `src/ashby-bot.ts:25-48`

#### Steps:
1. Navigate to job URL
2. Wait 2 seconds for form to load
3. **Upload resume** → `uploadResume()`
4. **Fill personal info** → `fillPersonalInfo()`
5. **Handle additional questions** → `handleAdditionalQuestions()`
6. **Submit application** → `submitApplication()`

---

## Execution

### 14. **Main Entry Point**
- **File**: `src/apply.ts`
- **Multi-URL Support**: Can process multiple job URLs sequentially
- **Rate Limiting**: 3-second delay between applications
- **Browser Control**:
  - Non-headless by default (visible browser)
  - Stays open 5 seconds after completion for review
  - Auto-closes after review period

#### Example Usage:
```typescript
const jobUrls = [
  'https://jobs.ashbyhq.com/company/job-id/application'
];

const bot = new AshbyJobApplicationBot(resumeData);
await bot.init(false); // false = non-headless

for (const jobUrl of jobUrls) {
  await bot.applyToJob(jobUrl);
}

await bot.close();
```

---

## Key Technical Details

### Pattern Matching Strategy
- **Case-insensitive**: All pattern matches use `/i` flag
- **Flexible matching**: Uses `.includes()` for label text
- **Multi-pattern support**: Questions can match multiple patterns
- **Priority order**: Specific handlers run before generic AI handler

### Label Offset Handling
- **Issue**: Fieldset legends often counted as first label
- **Solution**: Compare label count vs input count
- **Logic**: If `labels.length > inputs.length`, skip first label (index 0)
- **Applied to**: EEOC questions, location hubs, checkboxes

### Attribute Selectors for IDs
- **Issue**: CSS selectors can't start with numbers
- **Solution**: Use `[id="123abc"]` instead of `#123abc`
- **Usage**: Throughout label-based filling logic

### Combobox Handling
- **Detection**: Checks for `role="combobox"` attribute
- **Action**: Presses Enter after filling to confirm autocomplete selection
- **Use case**: Dropdown suggestions, autocomplete fields

---

## Performance Optimizations

### Wait Times
- **Form load**: 2000ms (initial page load)
- **File upload**: 10000ms (resume processing)
- **Between fields**: 300ms
- **Button interactions**: 500ms
- **After submission**: 2000ms
- **Between applications**: 3000ms

### Parallel Execution
- **NOT implemented**: Fields filled sequentially
- **Reason**: Avoids race conditions and form validation issues
- **Future optimization**: Could fill independent fields in parallel

---

## Logging & Debugging

### Console Output Indicators
- `📋` - Navigation/workflow steps
- `📝` - Personal information filling
- `📎` - Resume upload
- `❓` - Additional questions section
- `🔍` - Field detection/searching
- `✓` - Successful action
- `⊘` - Skipped/not found
- `⚠️` - Warning/retry
- `✗` - Failed action
- `🤖` - AI-powered answer
- `ℹ️` - Informational message
- `✅` - Major success (form filled, application submitted)
- `🚀` - Submission attempt
- `🎯` - Target action (selection)
- `⌨️` - Keyboard action (Enter key)

### Debug Mode
- Set `DEBUG=true` for verbose output
- Shows selector details, element counts, label/input matching
- Useful patterns logged with `🔍 DEBUG:` prefix

---

## Error Handling

### Graceful Degradation
1. **Field not found**: Logs and continues
2. **Click failed**: Retries with exponential backoff
3. **Fill failed**: Validates and retries
4. **AI unavailable**: Skips AI-powered questions
5. **Submit failed**: Waits for manual intervention

### No Destructive Actions
- Never closes browser on error
- Never skips to next application on failure
- Always waits for user to review/fix issues
- Preserves form state for manual completion

---

## Limitations & Known Issues

### Not Supported
1. **Multi-step applications** (only single-page forms)
2. **reCAPTCHA** (requires manual solving)
3. **Custom JavaScript validations** (may not trigger)
4. **File uploads other than resume** (e.g., cover letters, portfolios)
5. **Non-AshbyHQ platforms** (Greenhouse, Lever, etc.)
6. **Multiple resume uploads** (only first resume field)
7. **Conditional questions** (questions that appear based on previous answers)

### Edge Cases
1. **Dynamic forms**: May not detect fields loaded via AJAX after initial page load
2. **Custom components**: Non-standard form elements may not be recognized
3. **Internationalization**: Assumes English language labels
4. **Date pickers**: Not handled (requires manual input)
5. **Salary expectations**: Not automatically filled (requires AI or manual input)

---

## Security & Privacy

### API Key Handling
- Stored in `.env` file (not committed to git)
- Can be provided via config (not recommended)
- Never logged to console

### Data Privacy
- Resume uploaded as Base64 to Anthropic API
- No data stored on external servers
- All processing done locally via Playwright
- Browser stays open for user review

### Rate Limiting
- 3-second delay between applications
- Prevents IP banning from job sites
- Respectful of AshbyHQ servers

---

## Dependencies

### Core Libraries
- **playwright**: `^1.40.0` - Browser automation
- **@anthropic-ai/sdk**: `^0.29.0` - Claude AI integration
- **dotenv**: `^16.3.1` - Environment variable management
- **typescript**: `^5.3.3` - Type safety

### Build & Runtime
- **Node.js**: v16+ recommended
- **TypeScript**: Compiled to CommonJS
- **Output**: `dist/` directory

---

## Future Enhancements

### High Priority (from IMPROVEMENT_SUGGESTIONS.md)
1. ✅ Error handling & retry logic (IMPLEMENTED)
2. ✅ Field validation after filling (IMPLEMENTED)
3. Dry run mode (not yet implemented)
4. Structured logging (not yet implemented)

### Medium Priority
1. AI answer caching
2. Screenshot on error
3. Centralized question patterns
4. Progress tracking

### Low Priority
1. Multi-ATS support (Greenhouse, Lever)
2. Browser extension
3. Application tracking database
4. Cover letter generation

---

## Version History

### Current Version (v1.0)
- AshbyHQ automation
- Claude AI integration
- Comprehensive field handlers
- Retry logic
- Proactive required field filling
- Submit button automation

### Recent Additions
- Radio-based sponsorship handler
- Location hub checkbox support
- Combobox/autocomplete handling
- Validation error detection
- Fill empty required fields before submission
- Location-only AI answers (no explanations)

---

## Support & Documentation

### Files
- `README.md` - Setup and usage guide
- `IMPROVEMENT_SUGGESTIONS.md` - Future enhancement ideas
- `BOT_FEATURES.md` - This document (feature reference)

### Configuration Examples
- `config/resume-data.example.ts` - Template configuration
- `config/resume-data.ts` - User's actual configuration (gitignored)

### Code Organization
```
src/
├── ashby-bot.ts           # Main bot logic
├── base-application-bot.ts # Base class
├── ai-answer-generator.ts # Claude AI integration
├── apply.ts               # Entry point
└── utils/
    └── retry-helper.ts    # Retry utilities

config/
├── resume-data.ts         # User configuration
└── resume-data.example.ts # Template
```

---

## Quick Reference

### Starting the Bot
```bash
npm install           # Install dependencies
npm run build         # Compile TypeScript
npm start             # Run bot
```

### Editing Job URLs
Edit `src/apply.ts` lines 11-23 to add your job URLs.

### Enabling AI
1. Get API key from https://console.anthropic.com/
2. Add to `.env`: `ANTHROPIC_API_KEY=your-key-here`
3. Set `aiConfig.enabled: true` in `config/resume-data.ts`

### Debugging
- Watch browser (non-headless mode)
- Check console output for emoji indicators
- Look for `🔍 DEBUG:` messages

---

**Last Updated**: 2025-05-05
**Bot Version**: 1.0
**Author**: Kenneth (with Claude Code assistance)
