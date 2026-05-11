import { chromium } from 'playwright';
import { BaseApplicationBot } from './base-application-bot';
import { ResumeData } from '../config/resume-data';
import { AIAnswerGenerator } from './ai-answer-generator';
import { clickWithRetry, fillWithRetry, checkWithRetry } from './utils/retry-helper';
import * as path from 'path';

export class AshbyJobApplicationBot extends BaseApplicationBot {
  private aiGenerator: AIAnswerGenerator;

  constructor(resumeData: ResumeData) {
    super(resumeData);
    this.aiGenerator = new AIAnswerGenerator(resumeData);
  }

  async init(headless: boolean = false) {
    console.log('🚀 Initializing browser for AshbyHQ...');
    this.browser = await chromium.launch({
      headless,
      slowMo: 100
    });

    // Create a context with video recording enabled
    const context = await this.browser.newContext({
      recordVideo: {
        dir: './recordings',
        size: { width: 1280, height: 720 }
      }
    });

    this.page = await context.newPage();
    console.log('🎥 Video recording enabled - videos will be saved to ./recordings/');
  }

  async applyToJob(jobUrl: string) {
    if (!this.page) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    console.log(`📋 [ASHBY] Navigating to job posting: ${jobUrl}`);
    await this.page.goto(jobUrl, { waitUntil: 'networkidle' });

    // Wait for form to load
    await this.page.waitForTimeout(2000);

    // Upload resume
    await this.uploadResume();

    // Wait for form to fully render after resume upload
    await this.page.waitForTimeout(1500);

    // Fill in personal information
    await this.fillPersonalInfo();

    // Wait for personal info to settle
    await this.page.waitForTimeout(1000);

    // Handle additional questions (if any)
    await this.handleAdditionalQuestions();

    // Set up observer for conditional/dynamic questions
    await this.setupDynamicQuestionObserver();

    // Wait longer for any conditional questions to appear (some forms are slow)
    console.log('⏳ Waiting for conditional questions to load...');
    await this.page.waitForTimeout(3000);

    // Check if new dynamic questions appeared and handle them
    const hasNewQuestions = await this.checkForNewDynamicQuestions();
    if (hasNewQuestions) {
      console.log('🔔 New conditional questions detected, handling them now...');
      await this.handleAdditionalQuestions();
    } else {
      console.log('✓ No new conditional questions appeared');
    }

    console.log('✅ Form filled successfully!');

    // Submit the application
    await this.submitApplication();
  }

  async fillPersonalInfo() {
    if (!this.page) return;

    console.log('📝 Filling personal information...');

    const { personalInfo } = this.resumeData;

    // Helper function to fill field by label text (case-insensitive)
    const fillByLabel = async (labelText: string, value: string) => {
      try {
        // Find all labels and check case-insensitively
        const labels = await this.page!.locator('label').all();

        for (const label of labels) {
          const text = await label.innerText();
          // Normalize: trim whitespace and convert to lowercase for comparison
          const normalizedText = text.trim().toLowerCase();
          const normalizedSearch = labelText.trim().toLowerCase();

          // Case-insensitive comparison
          if (normalizedText.includes(normalizedSearch)) {
            const forId = await label.getAttribute('for');
            console.log(`  🔍 Found label "${text.trim()}" with for="${forId}"`);

            if (forId) {
              // Use attribute selector to handle IDs that start with numbers
              const input = this.page!.locator(`[id="${forId}"]`);
              const inputCount = await input.count();
              console.log(`  🔍 Looking for input with id="${forId}", found: ${inputCount}`);

              if (inputCount > 0) {
                await input.fill(value);
                console.log(`  ✓ Filled: ${labelText} (found as "${text.trim()}")`);
                return true;
              } else {
                console.log(`  ⚠️  Label found but input not found for id="${forId}"`);
              }
            } else {
              console.log(`  ⚠️  Label found but has no 'for' attribute`);
            }
          }
        }
        console.log(`  ⊘ Could not find label: ${labelText}`);
        return false;
      } catch (error) {
        console.log(`  ⚠️  Error finding label "${labelText}": ${error}`);
        return false;
      }
    };

    // Try to fill by label text first (most reliable for AshbyHQ)
    // Search for any label containing these terms (case-insensitive)
    await fillByLabel('First Name', personalInfo.firstName);
    await fillByLabel('Last Name', personalInfo.lastName);

    // University
    if (personalInfo.university) {
      await fillByLabel('University', personalInfo.university);
      await fillByLabel('School', personalInfo.university);
      await fillByLabel('College', personalInfo.university);
    }

    // Years of Experience
    if (personalInfo.yearsOfExperience !== undefined) {
      await fillByLabel('Years of Experience', personalInfo.yearsOfExperience.toString());
      await fillByLabel('Experience', personalInfo.yearsOfExperience.toString());
      await fillByLabel('Years of relevant experience', personalInfo.yearsOfExperience.toString());
    }

    if (personalInfo.legalName) {
      await fillByLabel('Legal Name', personalInfo.legalName);
      await fillByLabel('Name', personalInfo.legalName); // Some forms just use "Name"
    }
    await fillByLabel('Email', personalInfo.email);
    await fillByLabel('Phone', personalInfo.phone);
    if (personalInfo.linkedin) {
      // Search for any label containing "LinkedIn" (case-insensitive)
      await fillByLabel('LinkedIn', personalInfo.linkedin);
    }
    if (personalInfo.github || personalInfo.portfolio) {
      // Try to fill Portfolio/GitHub fields by label
      const portfolioGithubFilled = await fillByLabel('Portfolio', personalInfo.portfolio || personalInfo.github || '');
      if (!portfolioGithubFilled) {
        await fillByLabel('Github', personalInfo.github || personalInfo.portfolio || '');
      }
    }

    // Fallback to selector-based filling for fields not handled by fillByLabel
    const fieldMappings = [
      { selector: 'input[name="_systemfield_name"], input[id="_systemfield_name"]', value: personalInfo.legalName || '' },
      { selector: 'input[name*="firstName" i], input[id*="firstName" i]', value: personalInfo.firstName },
      { selector: 'input[name*="lastName" i], input[id*="lastName" i]', value: personalInfo.lastName },
      { selector: 'input[type="email"], input[name="_systemfield_email"]', value: personalInfo.email },
      { selector: 'input[type="tel"]', value: personalInfo.phone },
      { selector: 'input[placeholder*="Location" i], input[placeholder*="City" i], input[name*="location" i]', value: personalInfo.location },
      { selector: 'input[placeholder*="LinkedIn" i], input[placeholder*="Linkedin" i], input[name*="linkedin" i], input[id*="linkedin" i]', value: personalInfo.linkedin || '' },
      { selector: 'input[placeholder*="GitHub" i], input[name*="github" i], input[id*="github" i]', value: personalInfo.github || '' },
      { selector: 'input[placeholder*="Portfolio" i], input[placeholder*="Website" i], input[name*="portfolio" i], input[placeholder*="Personal Website" i]', value: personalInfo.portfolio || '' },
    ];

    for (const field of fieldMappings) {
      try {
        const element = this.page.locator(field.selector).first();
        const count = await element.count();

        if (count > 0 && field.value) {
          // Check if already filled (skip if it already has a value)
          const currentValue = await element.inputValue();
          if (currentValue && currentValue.trim().length > 0) {
            console.log(`  ⊙ Skipped (already filled): ${field.selector.split(',')[0].substring(0, 40)}...`);
            continue;
          }

          await element.fill(field.value);
          console.log(`  ✓ Filled: ${field.selector.split(',')[0].substring(0, 40)}...`);
          await this.page.waitForTimeout(300); // Small delay between fields
        } else if (count === 0 && field.value) {
          console.log(`  ⊘ Field not found: ${field.selector.split(',')[0].substring(0, 40)}...`);
        }
      } catch (error) {
        console.log(`  ⚠️  Error filling field: ${error}`);
      }
    }

    // Sometimes AshbyHQ uses a single "Full Name" field
    try {
      const fullNameField = this.page.locator('input[placeholder*="Full name" i], input[name*="fullName" i]').first();
      if (await fullNameField.count() > 0) {
        await fullNameField.fill(`${personalInfo.firstName} ${personalInfo.lastName}`);
        console.log('  ✓ Filled: Full Name field');
      }
    } catch (error) {
      // Skip if not present
    }
  }

  async uploadResume() {
    if (!this.page) return;

    console.log('📎 Uploading resume...');

    try {
      const resumePath = path.resolve(this.resumeData.resumePath);

      // AshbyHQ typically uses file input with specific selectors
      // Try multiple possible selectors
      const fileInputSelectors = [
        'input[type="file"]',
        'input[type="file"][accept*="pdf"]',
        'input[type="file"][name*="resume"]',
        'input[type="file"][id*="resume"]',
      ];

      for (const selector of fileInputSelectors) {
        try {
          const fileInput = this.page.locator(selector).first();
          const count = await fileInput.count();

          if (count > 0) {
            await fileInput.setInputFiles(resumePath);
            console.log(`  ✓ Uploaded: ${resumePath}`);

            // Wait for file to process
            await this.page.waitForTimeout(10000);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log(`  ⚠️  Could not upload resume: ${error}`);
    }
  }

  async handleAdditionalQuestions() {
    if (!this.page) return;

    console.log('❓ Checking for additional questions...');

    try {
      // AshbyHQ often uses radio buttons and dropdowns for questions

      // Sponsorship question - look for radio buttons or select
      const sponsorshipOptions = this.page.locator('label:has-text("sponsorship"), label:has-text("visa")').first();
      if (await sponsorshipOptions.count() > 0) {
        const answer = this.resumeData.preferences.sponsorship === 'yes' ? 'Yes' : 'No';
        // Try to find and click the appropriate radio button
        const radioButton = this.page.locator(`input[type="radio"][value*="${answer}" i]`).first();
        if (await radioButton.count() > 0) {
          await radioButton.click();
          console.log('  ✓ Answered sponsorship question');
        }
      }

      // Remote work preference
      const remoteOptions = this.page.locator('label:has-text("remote"), label:has-text("work location")').first();
      if (await remoteOptions.count() > 0) {
        // Try to find radio button for remote preference
        const remoteRadio = this.page.locator(`input[type="radio"]`).filter({ hasText: new RegExp(this.resumeData.preferences.remote, 'i') }).first();
        if (await remoteRadio.count() > 0) {
          await remoteRadio.click();
          console.log('  ✓ Answered remote work question');
        }
      }

      // Start date
      if (this.resumeData.preferences.startDate) {
        const startDateInputs = this.page.locator('input[placeholder*="start date" i], input[name*="startDate" i], textarea[placeholder*="start" i]');
        if (await startDateInputs.count() > 0) {
          await startDateInputs.first().fill(this.resumeData.preferences.startDate);
          console.log('  ✓ Filled start date');
        }
      }

      // Work location (autocomplete field for payroll tax purposes)
      if (this.resumeData.preferences.workLocation) {
        try {
          // Look for autocomplete field with "Start typing..." placeholder
          const workLocationInput = this.page.locator('input[placeholder*="Start typing" i]').first();
          if (await workLocationInput.count() > 0) {
            // Type the location
            await workLocationInput.fill(this.resumeData.preferences.workLocation);
            await this.page.waitForTimeout(1000); // Wait for autocomplete options

            // Press Enter or Arrow Down + Enter to select first option
            await workLocationInput.press('ArrowDown');
            await this.page.waitForTimeout(300);
            await workLocationInput.press('Enter');
            console.log('  ✓ Selected work location (autocomplete)');
          }
        } catch (error) {
          console.log('  ⊘ Could not fill work location autocomplete');
        }
      }

      // Handle checkbox/radio button questions (US citizen, visa sponsorship, etc.)
      // Use fieldEntry class to properly scope each question
      try {
        // Find all field entries (individual question containers)
        // AshbyHQ uses class like "_fieldEntry_17tft_29" or "ashby-application-form-field-entry"
        const fieldEntries = await this.page.locator('.fieldEntry, div[class*="fieldEntry"], div[class*="ashby-application-form-field-entry"]').all();

        console.log(`  ℹ️  Found ${fieldEntries.length} field entries to check`);

        for (const fieldEntry of fieldEntries) {
          try {
            // Check if field already has a value
            let alreadyFilled = false;

            // Check text inputs and textareas
            const textInputs = await fieldEntry.locator('input[type="text"], input[type="email"], input[type="tel"], textarea').all();
            for (const input of textInputs) {
              try {
                const value = await input.inputValue();
                if (value && value.trim().length > 0) {
                  alreadyFilled = true;
                  break;
                }
              } catch (e) {
                // Ignore errors
              }
            }

            // Check radio buttons and checkboxes (input elements)
            if (!alreadyFilled) {
              const radioCheckboxInputs = await fieldEntry.locator('input[type="radio"], input[type="checkbox"]').all();
              for (const input of radioCheckboxInputs) {
                try {
                  const checked = await input.isChecked();
                  if (checked) {
                    alreadyFilled = true;
                    break;
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            }

            // Check button-based Yes/No questions (button elements with aria-checked)
            if (!alreadyFilled) {
              const buttons = await fieldEntry.locator('button[aria-checked]').all();
              for (const button of buttons) {
                try {
                  const checked = await button.getAttribute('aria-checked');
                  if (checked === 'true') {
                    alreadyFilled = true;
                    break;
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            }

            if (alreadyFilled) {
              continue;
            }

            // Get the text content of this field entry
            const fieldText = await fieldEntry.innerText();

            // Debug: Log each field entry text (first 100 chars)
            console.log(`  🔍 Checking field: "${fieldText.substring(0, 100).replace(/\n/g, ' ')}..."`);

            // Debug age question specifically
            if (/18 years|age.*18|at least 18/i.test(fieldText)) {
              console.log(`  🔍 AGE QUESTION DETECTED! over18=${this.resumeData.preferences.over18}`);
              console.log(`  🔍 Condition check: over18 !== undefined = ${this.resumeData.preferences.over18 !== undefined}`);
            }

            // Check if this is the US Citizen question
            if (/US Citizen.*Permanent Resident|Permanent Resident.*US Citizen/i.test(fieldText)) {

              console.log('  ℹ️  Found US Citizen question');
              await this.page.waitForTimeout(800);

              const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();
              if (await buttonContainer.count() > 0) {
                const allButtons = await buttonContainer.locator('button').all();
                const shouldClickYes = this.resumeData.preferences.usCitizen !== false;

                if (allButtons.length >= 2) {
                  const targetButton = shouldClickYes ? allButtons[0] : allButtons[1];
                  const description = shouldClickYes ? 'YES: US Citizen/Permanent Resident' : 'NO: Not US Citizen/Permanent Resident';
                  await clickWithRetry(targetButton, description);
                  await this.page.waitForTimeout(800);
                }
              }
            }

            // Check if this is any sponsorship question (BUTTON-BASED Yes/No)
            if (/sponsorship/i.test(fieldText)) {

              console.log('  ℹ️  Found sponsorship question (button-based)');
              await this.page.waitForTimeout(800);

              const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();
              if (await buttonContainer.count() > 0) {
                const allButtons = await buttonContainer.locator('button').all();
                const shouldClickYes = this.resumeData.preferences.requiresVisaSponsorship === true;

                if (allButtons.length >= 2) {
                  const targetButton = shouldClickYes ? allButtons[0] : allButtons[1];
                  const description = shouldClickYes ? 'YES: Requires Sponsorship' : 'NO: Does Not Require Sponsorship';
                  await clickWithRetry(targetButton, description);
                  await this.page.waitForTimeout(800);
                }
              }
            }

            // Check if this is the age verification question
            if (/at least 18|18 years|age.*18|over 18/i.test(fieldText)) {

              console.log('  ℹ️  Found age verification question');

              // Wait a bit for buttons to be ready
              await this.page.waitForTimeout(800);

              // Find the Yes/No button container first (more specific)
              const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();
              const containerCount = await buttonContainer.count();
              console.log(`  🔍 Yes/No container count: ${containerCount}`);

              if (containerCount > 0) {
                // Get all buttons within this container
                const allButtons = await buttonContainer.locator('button').all();
                console.log(`  🔍 Total buttons in container: ${allButtons.length}`);

                // Click the first button (which should be "Yes")
                if (allButtons.length >= 2) {
                  await clickWithRetry(allButtons[0], 'YES: At least 18 years old');
                  await this.page.waitForTimeout(800);
                } else {
                  console.log('  ⚠️  Expected 2 buttons (Yes/No), found ' + allButtons.length);
                }
              } else {
                console.log('  ⚠️  Yes/No button container not found!');
              }
            }

            // Check if this is the work authorization question (but NOT sponsorship)
            const isWorkAuthQuestion = /legally authorized.*work|work authorization|authorized.*work.*country|Are you legally authorized to work in the United States/i.test(fieldText);
            const isSponsorshipQuestion = /sponsorship|require.*visa|OPT.*H1B/i.test(fieldText);

            if (isWorkAuthQuestion && !isSponsorshipQuestion) {

              console.log('  ℹ️  Found work authorization question');

              // Wait a bit for buttons to be ready
              await this.page.waitForTimeout(800);

              // Find the Yes/No button container first (more specific)
              const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();
              const containerCount = await buttonContainer.count();

              if (containerCount > 0) {
                // Get all buttons within this container
                const allButtons = await buttonContainer.locator('button').all();

                // Default to Yes (legally authorized to work)
                const shouldClickYes = this.resumeData.preferences.legallyAuthorizedToWork !== false;

                if (allButtons.length >= 2) {
                  if (shouldClickYes) {
                    await allButtons[0].click(); // First button is Yes
                    console.log('  ✓ Clicked YES: Legally authorized to work');
                  } else {
                    await allButtons[1].click(); // Second button is No
                    console.log('  ✓ Clicked NO: Not legally authorized to work');
                  }
                  await this.page.waitForTimeout(500);
                }
              }
            }

            // Check if this is an in-office/hybrid work question
            if (/in.*office.*days.*week|office.*\d+.*days|collaborative.*office|on.*site.*days|available.*start.*immediately.*office|start immediately in office/i.test(fieldText)) {

              console.log('  ℹ️  Found in-office work question');
              await this.page.waitForTimeout(800);

              const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();
              if (await buttonContainer.count() > 0) {
                const allButtons = await buttonContainer.locator('button').all();

                if (allButtons.length >= 2) {
                  await allButtons[0].click(); // Always click Yes
                  console.log('  ✓ Clicked YES: Willing to work in office (flexible with hybrid/remote/in-office)');
                  await this.page.waitForTimeout(800);
                }
              }
            }

            // Generic Yes/No question handler using Claude AI (catch-all for other questions)
            // Only run if we haven't already handled this question with specific logic
            const hasYesNoButtons = await fieldEntry.locator('div[class*="yesno"]').count() > 0;
            const alreadyHandled = /US Citizen.*Permanent Resident|Permanent Resident.*US Citizen|sponsorship|at least 18|18 years|age.*18|over 18|legally authorized.*work|work authorization|in.*office.*days|office.*\d+.*days|collaborative.*office|on.*site.*days|available.*start.*immediately.*office|start immediately in office/i.test(fieldText);

            if (hasYesNoButtons && !alreadyHandled && this.aiGenerator.isEnabled()) {
              console.log('  🤖 Using Claude AI to answer Yes/No question...');

              // Extract just the question text (usually in a label)
              const questionLabel = await fieldEntry.locator('label').first().innerText().catch(() => fieldText);

              const aiAnswer = await this.aiGenerator.answerYesNoQuestion(questionLabel);

              if (aiAnswer) {
                await this.page.waitForTimeout(800);
                const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();
                const allButtons = await buttonContainer.locator('button').all();

                if (allButtons.length >= 2) {
                  const targetButton = aiAnswer === 'Yes' ? allButtons[0] : allButtons[1];
                  const description = `AI answered ${aiAnswer.toUpperCase()} to: "${questionLabel.substring(0, 60)}..."`;
                  await clickWithRetry(targetButton, description);
                  await this.page.waitForTimeout(500);
                }
              }
            }
          } catch (error) {
            // Skip this field entry if we can't process it
            continue;
          }
        }
      } catch (error) {
        console.log('  ℹ️  Could not process Yes/No questions');
      }

      // Handle radio button EEOC questions (gender, race, veteran status, etc.)
      try {
        const fieldsets = await this.page.locator('fieldset').all();

        for (const fieldset of fieldsets) {
          try {
            const fieldsetText = await fieldset.innerText();

            // Gender question
            if (/^gender/i.test(fieldsetText) || fieldsetText.toLowerCase().includes('input gender')) {
              console.log('  ℹ️  Found gender question (EEOC demographic)');

              const gender = this.resumeData.personalInfo.gender || 'Decline to self-identify';
              console.log(`  ℹ️  Selecting: ${gender}`);

              // Find radio button with matching label
              const radioButtons = await fieldset.locator('input[type="radio"]').all();
              const labels = await fieldset.locator('label[class*="_label"]').all();

              console.log(`  🔍 DEBUG: Found ${radioButtons.length} radio buttons, ${labels.length} labels`);

              // Skip first label if it's the fieldset legend (when labels.length > radioButtons.length)
              const startIndex = labels.length > radioButtons.length ? 1 : 0;

              for (let i = startIndex; i < labels.length; i++) {
                const labelText = await labels[i].innerText();
                const radioIndex = i - startIndex;
                console.log(`  🔍 DEBUG: Label ${i}: "${labelText.trim()}" vs looking for "${gender}"`);
                if (labelText.trim() === gender) {
                  await radioButtons[radioIndex].check();
                  console.log(`  ✓ Selected: ${gender}`);
                  await this.page.waitForTimeout(300);
                  break;
                }
              }
            }

            // Race/ethnicity question
            if (/race|ethnicity|eeoc_race/i.test(fieldsetText) || fieldsetText.toLowerCase().includes('hispanic or latino')) {
              console.log('  ℹ️  Found race/ethnicity question (EEOC demographic)');

              const race = this.resumeData.personalInfo.race || 'Decline to self-identify';
              console.log(`  ℹ️  Selecting: ${race}`);

              // Find radio button with matching label
              const radioButtons = await fieldset.locator('input[type="radio"]').all();
              const labels = await fieldset.locator('label[class*="_label"]').all();

              console.log(`  🔍 DEBUG: Found ${radioButtons.length} radio buttons, ${labels.length} labels`);

              // Skip first label if it's the fieldset legend (when labels.length > radioButtons.length)
              const startIndex = labels.length > radioButtons.length ? 1 : 0;

              for (let i = startIndex; i < labels.length; i++) {
                const labelText = await labels[i].innerText();
                const radioIndex = i - startIndex;
                console.log(`  🔍 DEBUG: Label ${i}: "${labelText.trim()}" vs looking for "${race}"`);
                if (labelText.trim() === race) {
                  await radioButtons[radioIndex].check();
                  console.log(`  ✓ Selected: ${race}`);
                  await this.page.waitForTimeout(300);
                  break;
                }
              }
            }

            // Veteran status question
            if (/veteran|eeoc_veteran_status/i.test(fieldsetText) || fieldsetText.toLowerCase().includes('protected veteran')) {
              console.log('  ℹ️  Found veteran status question (EEOC demographic)');

              const veteranStatus = this.resumeData.personalInfo.veteranStatus || 'I decline to self-identify for protected veteran status';
              console.log(`  ℹ️  Selecting: ${veteranStatus}`);

              // Find radio button with matching label
              const radioButtons = await fieldset.locator('input[type="radio"]').all();
              const labels = await fieldset.locator('label[class*="_label"]').all();

              console.log(`  🔍 DEBUG: Found ${radioButtons.length} radio buttons, ${labels.length} labels`);

              // Skip first label if it's the fieldset legend (when labels.length > radioButtons.length)
              const startIndex = labels.length > radioButtons.length ? 1 : 0;

              for (let i = startIndex; i < labels.length; i++) {
                const labelText = await labels[i].innerText();
                const radioIndex = i - startIndex;
                console.log(`  🔍 DEBUG: Label ${i}: "${labelText.trim()}" vs looking for "${veteranStatus}"`);
                if (labelText.trim() === veteranStatus) {
                  await radioButtons[radioIndex].check();
                  console.log(`  ✓ Selected: ${veteranStatus}`);
                  await this.page.waitForTimeout(300);
                  break;
                }
              }
            }

            // Sponsorship question (RADIO-BASED with multiple options)
            if (/sponsorship|require.*visa|visa.*sponsorship/i.test(fieldsetText)) {
              console.log('  ℹ️  Found sponsorship question (radio-based)');

              const radioButtons = await fieldset.locator('input[type="radio"]').all();
              const labels = await fieldset.locator('label[class*="_label"]').all();

              console.log(`  🔍 DEBUG: Found ${radioButtons.length} radio buttons, ${labels.length} labels`);

              if (radioButtons.length > 0) {
                const shouldRequireSponsorship = this.resumeData.preferences.requiresVisaSponsorship === true;

                // Skip first label if it's the fieldset legend
                const startIndex = labels.length > radioButtons.length ? 1 : 0;

                // Look for "No" option if user doesn't require sponsorship
                if (!shouldRequireSponsorship) {
                  for (let i = startIndex; i < labels.length; i++) {
                    const labelText = await labels[i].innerText();
                    const labelLower = labelText.trim().toLowerCase();
                    const radioIndex = i - startIndex;

                    console.log(`  🔍 DEBUG: Label ${i}: "${labelText.trim()}" (radio index: ${radioIndex})`);

                    // Select "No" option
                    if (labelLower === 'no' || labelLower.startsWith('no,') || labelLower.startsWith('no ')) {
                      if (radioIndex < radioButtons.length) {
                        await radioButtons[radioIndex].check();
                        console.log(`  ✓ Selected: ${labelText.trim()}`);
                        await this.page.waitForTimeout(300);
                        break;
                      }
                    }
                  }
                } else {
                  // User requires sponsorship - select appropriate Yes option (first Yes option found)
                  for (let i = startIndex; i < labels.length; i++) {
                    const labelText = await labels[i].innerText();
                    const labelLower = labelText.trim().toLowerCase();
                    const radioIndex = i - startIndex;

                    if (labelLower.startsWith('yes')) {
                      if (radioIndex < radioButtons.length) {
                        await radioButtons[radioIndex].check();
                        console.log(`  ✓ Selected: ${labelText.trim()}`);
                        await this.page.waitForTimeout(300);
                        break;
                      }
                    }
                  }
                }
              }
            }

            // Location hub question (can be radio buttons OR checkboxes)
            if (/within.*miles.*hub|hub.*location|located.*hub|reside.*hub|preferred.*working.*location|select.*location|office.*location.*hub|50.*miles/i.test(fieldsetText)) {
              console.log('  ℹ️  Found office hub location question');

              const userLocation = this.resumeData.personalInfo.location.toLowerCase();
              console.log(`  ℹ️  User location: ${this.resumeData.personalInfo.location}`);

              // Try to find radio buttons first
              let inputs = await fieldset.locator('input[type="radio"]').all();
              let inputType = 'radio';

              // If no radio buttons, try checkboxes
              if (inputs.length === 0) {
                inputs = await fieldset.locator('input[type="checkbox"]').all();
                inputType = 'checkbox';
              }

              // If still nothing, try button elements with role="radio"
              if (inputs.length === 0) {
                inputs = await fieldset.locator('button[role="radio"]').all();
                inputType = 'radio';
              }

              const labels = await fieldset.locator('label[class*="_label"]').all();

              console.log(`  🔍 DEBUG: Found ${inputs.length} ${inputType} inputs, ${labels.length} labels`);

              if (inputs.length === 0) {
                console.log('  ⚠️  No inputs found for location hub question');
                continue;
              }

              // Skip first label if it's the fieldset legend (when labels.length > inputs.length)
              const startIndex = labels.length > inputs.length ? 1 : 0;

              for (let i = startIndex; i < labels.length; i++) {
                const labelText = await labels[i].innerText();
                const labelLower = labelText.trim().toLowerCase();
                const inputIndex = i - startIndex;

                console.log(`  🔍 DEBUG: Label ${i}: "${labelText.trim()}" (input index: ${inputIndex})`);

                // Skip if inputIndex is out of bounds
                if (inputIndex >= inputs.length) {
                  console.log(`  ⚠️  Input index ${inputIndex} out of bounds (max: ${inputs.length - 1})`);
                  continue;
                }

                // Check if this option matches the user's location
                if ((labelLower.includes('new york') && userLocation.includes('new york')) ||
                    (labelLower.includes('san francisco') && userLocation.includes('san francisco')) ||
                    (labelLower.includes('los angeles') && userLocation.includes('los angeles')) ||
                    (labelLower.includes('seattle') && userLocation.includes('seattle')) ||
                    (labelLower.includes('boston') && userLocation.includes('boston')) ||
                    (labelLower.includes('austin') && userLocation.includes('austin')) ||
                    (labelLower.includes('chicago') && userLocation.includes('chicago')) ||
                    (labelLower.includes('denver') && userLocation.includes('denver'))) {

                  console.log(`  🎯 Attempting to select ${inputType} at index ${inputIndex}`);

                  if (inputType === 'checkbox') {
                    await checkWithRetry(inputs[inputIndex], true, labelText.trim());
                  } else {
                    await inputs[inputIndex].check();
                    console.log(`  ✓ Selected: ${labelText.trim()}`);
                  }

                  await this.page.waitForTimeout(300);
                  break;
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.log('  ℹ️  Could not process EEOC demographic questions');
      }

      // Handle checkbox-based office location questions
      try {
        // Find fieldsets that ask about office locations
        const locationFieldsets = await this.page.locator('fieldset').all();

        for (const fieldset of locationFieldsets) {
          try {
            const fieldsetText = await fieldset.innerText();

            // Check if this is asking about office hub locations
            if (/office hub|office location|located.*office|within.*miles.*office/i.test(fieldsetText)) {
              console.log('  ℹ️  Found office location checkbox question');

              // Get all checkboxes in this fieldset
              const checkboxes = await fieldset.locator('input[type="checkbox"]').all();
              console.log(`  ℹ️  Found ${checkboxes.length} location options`);

              // Extract user's location (city/state)
              const userLocation = this.resumeData.personalInfo.location.toLowerCase();

              // Check each checkbox to find matching location
              for (const checkbox of checkboxes) {
                const name = await checkbox.getAttribute('name');
                if (name) {
                  const nameLower = name.toLowerCase();

                  // Check if this option matches the user's location
                  // Look for city names in both the name and user location
                  if ((nameLower.includes('new york') && userLocation.includes('new york')) ||
                      (nameLower.includes('san francisco') && userLocation.includes('san francisco')) ||
                      (nameLower.includes('london') && userLocation.includes('london')) ||
                      (nameLower.includes('seattle') && userLocation.includes('seattle')) ||
                      (nameLower.includes('austin') && userLocation.includes('austin')) ||
                      (nameLower.includes('boston') && userLocation.includes('boston'))) {

                    // Check this checkbox
                    const isChecked = await checkbox.isChecked();
                    if (!isChecked) {
                      await checkbox.check();
                      console.log(`  ✓ Checked: ${name}`);
                    }
                  }
                }
              }
            }
          } catch (error) {
            // Skip this fieldset if we can't process it
            continue;
          }
        }
      } catch (error) {
        console.log('  ℹ️  Could not process office location checkboxes');
      }

      // Handle "How did you hear about this opportunity?" checkbox questions
      try {
        const fieldsets = await this.page.locator('fieldset').all();

        for (const fieldset of fieldsets) {
          try {
            const fieldsetText = await fieldset.innerText();

            // Check if this is asking "How did you hear about this opportunity?"
            if (/how did you hear|where did you hear|how.*you.*find.*opportunity|source of referral/i.test(fieldsetText)) {
              // Get all checkboxes and their labels
              const checkboxes = await fieldset.locator('input[type="checkbox"]').all();
              const labels = await fieldset.locator('label[class*="_label"]').all();

              console.log(`  🔍 DEBUG: Found ${checkboxes.length} checkboxes, ${labels.length} labels for "How did you hear"`);

              // Only process if there are actual checkboxes (not a text input question)
              if (checkboxes.length === 0) {
                console.log('  ⊘ Skipping - No checkboxes found (likely a text input question)');
                continue;
              }

              console.log('  ℹ️  Found "How did you hear about this" checkbox question');

              // Skip first label if it's the fieldset legend (when labels.length > checkboxes.length)
              const startIndex = labels.length > checkboxes.length ? 1 : 0;

              // Look for "LinkedIn" option
              for (let i = startIndex; i < labels.length; i++) {
                const labelText = await labels[i].innerText();
                const labelLower = labelText.trim().toLowerCase();
                const checkboxIndex = i - startIndex;

                console.log(`  🔍 DEBUG: Label ${i}: "${labelText.trim()}" (checkbox index: ${checkboxIndex})`);

                if (labelLower === 'linkedin') {
                  await checkWithRetry(checkboxes[checkboxIndex], true, 'LinkedIn (How did you hear about this)');
                  break;
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.log('  ℹ️  Could not process "How did you hear" checkbox questions');
      }

      // Handle "How did you hear" combobox/autocomplete fields
      try {
        const fieldsets = await this.page.locator('fieldset').all();

        for (const fieldset of fieldsets) {
          try {
            const fieldsetText = await fieldset.innerText();

            // Check if this is asking "How did you hear about this opportunity?" with a combobox
            if (/how did you hear|where did you hear|how.*you.*find.*opportunity/i.test(fieldsetText)) {
              // Look for combobox input (autocomplete)
              const combobox = fieldset.locator('input[role="combobox"]').first();
              const comboboxCount = await combobox.count();

              if (comboboxCount > 0) {
                console.log('  ℹ️  Found "How did you hear" combobox (autocomplete) field');
                await fillWithRetry(combobox, 'LinkedIn', 'How did you hear (combobox)');
                await this.page.waitForTimeout(500);

                // Try to press Enter to select the suggestion
                await combobox.press('Enter').catch(() => {
                  console.log('  ℹ️  Could not press Enter (no autocomplete suggestion)');
                });
                break;
              }
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.log('  ℹ️  Could not process "How did you hear" combobox fields');
      }

      // Handle text areas for cover letter or additional info with AI
      const textAreas = await this.page.locator('textarea').all();
      if (textAreas.length > 0) {
        console.log(`  ℹ️  Found ${textAreas.length} text area(s)`);

        if (this.aiGenerator.isEnabled()) {
          console.log('  🤖 Using AI to generate answers...');

          for (const textArea of textAreas) {
            try {
              // Get the label or placeholder to understand what the question is
              const placeholder = await textArea.getAttribute('placeholder');
              const ariaLabel = await textArea.getAttribute('aria-label');
              const id = await textArea.getAttribute('id');
              const name = await textArea.getAttribute('name');
              const className = await textArea.getAttribute('class');

              // Skip reCAPTCHA and other system/hidden fields
              if (id?.includes('recaptcha') ||
                  name?.includes('recaptcha') ||
                  className?.includes('recaptcha') ||
                  className?.includes('g-recaptcha')) {
                console.log('  ⊘ Skipping reCAPTCHA field');
                continue;
              }

              // Skip if textarea is not visible (hidden fields)
              const isVisible = await textArea.isVisible().catch(() => false);
              if (!isVisible) {
                console.log('  ⊘ Skipping hidden textarea field');
                continue;
              }

              // Try to find associated label
              let label = '';
              if (id) {
                const labelElement = this.page.locator(`label[for="${id}"]`);
                if (await labelElement.count() > 0) {
                  label = await labelElement.innerText();
                }
              }

              // Determine the question
              const question = label || placeholder || ariaLabel || 'Please provide additional information about yourself';

              if (question) {
                console.log(`  🤖 Generating answer for: "${question.substring(0, 60)}..."`);
                const answer = await this.aiGenerator.generateAnswer(question);

                if (answer) {
                  await textArea.fill(answer);
                  console.log(`  ✓ AI answer filled`);
                  await this.page.waitForTimeout(500);
                } else {
                  console.log(`  ⊘ Could not generate answer`);
                }
              }
            } catch (error) {
              console.log(`  ⊘ Skipped text area: ${error}`);
            }
          }
        } else {
          console.log('  ℹ️  AI answer generation disabled - may need manual input');
        }
      }

      // Handle text input fields for questions (AshbyHQ often uses these)
      if (this.aiGenerator.isEnabled()) {
        // Find all text inputs that might be questions
        const allInputs = await this.page.locator('input[type="text"]').all();

        for (const input of allInputs) {
          try {
            const id = await input.getAttribute('id');
            const name = await input.getAttribute('name');

            // Skip system fields we already filled
            if (name?.includes('_systemfield_') || id?.includes('_systemfield_')) {
              continue;
            }

            // Skip if already filled
            const value = await input.inputValue();
            if (value && value.trim().length > 0) {
              continue;
            }

            // Try to find associated label
            let label = '';
            if (id) {
              const labelElement = this.page.locator(`label[for="${id}"]`);
              if (await labelElement.count() > 0) {
                label = await labelElement.innerText();
              }
            }

            // Check if this is a location/timezone question - fill directly from resume data
            if (label && /location|time.*zone|where.*you.*based|city.*state|where.*are.*you/i.test(label)) {
              console.log(`  📍 Found location question: "${label.substring(0, 60)}..."`);
              await input.fill(this.resumeData.personalInfo.location);
              console.log(`  ✓ Filled location: ${this.resumeData.personalInfo.location}`);
              await this.page.waitForTimeout(300);
              continue;
            }

            // Check if this is a start date question (including date pickers)
            if (label && /when.*can.*start|start.*date|available.*start|availability.*date|ideal.*start.*date|choose.*start.*date|please.*choose.*start/i.test(label)) {
              console.log(`  📅 Found start date question: "${label.substring(0, 60)}..."`);

              try {
                // Click the input to open/focus the date picker
                await input.click();
                console.log('  🖱️  Clicked date picker input');
                await this.page.waitForTimeout(1000);

                // Clear any existing content first
                await input.press('Control+a');
                await input.press('Backspace');
                await this.page.waitForTimeout(500);

                // Type month (06)
                await input.pressSequentially('06', { delay: 100 });
                await this.page.waitForTimeout(300);

                // Type slash
                await input.press('/');
                await this.page.waitForTimeout(300);

                // Type day (01)
                await input.pressSequentially('01', { delay: 100 });
                await this.page.waitForTimeout(300);

                // Type slash
                await input.press('/');
                await this.page.waitForTimeout(300);

                // Type year (2026)
                await input.pressSequentially('2026', { delay: 100 });
                console.log('  ⌨️  Typed: 06/01/2026 (step by step with pauses)');
                await this.page.waitForTimeout(2000);

                // Press Enter to confirm the date selection
                await input.press('Enter');
                console.log('  ⌨️  Pressed Enter to confirm date');
                await this.page.waitForTimeout(2000);

                console.log(`  ✓ Filled start date: 06/01/2026`);
              } catch (error) {
                console.log(`  ⚠️  Error filling start date: ${error}`);
              }
              continue;
            }

            // Check if this is a salary question
            if (label && /salary|compensation|pay.*range|desired.*pay|expected.*salary/i.test(label)) {
              if (this.resumeData.preferences.desiredSalary) {
                console.log(`  💰 Found salary question: "${label.substring(0, 60)}..."`);
                await input.fill(this.resumeData.preferences.desiredSalary);
                console.log(`  ✓ Filled salary: ${this.resumeData.preferences.desiredSalary}`);
                await this.page.waitForTimeout(300);
                continue;
              }
            }

            // Check if this is a university question
            if (label && /university|college|school.*attend|where.*did.*you.*go|educational.*institution/i.test(label)) {
              if (this.resumeData.personalInfo.university) {
                console.log(`  🎓 Found university question: "${label.substring(0, 60)}..."`);
                await input.fill(this.resumeData.personalInfo.university);
                console.log(`  ✓ Filled university: ${this.resumeData.personalInfo.university}`);
                await this.page.waitForTimeout(300);
                continue;
              }
            }

            // Check if this is a years of experience question
            if (label && /years.*of.*experience|years.*relevant.*experience|how.*many.*years|experience.*years/i.test(label)) {
              if (this.resumeData.personalInfo.yearsOfExperience !== undefined) {
                console.log(`  📊 Found years of experience question: "${label.substring(0, 60)}..."`);
                await input.fill(this.resumeData.personalInfo.yearsOfExperience.toString());
                console.log(`  ✓ Filled years of experience: ${this.resumeData.personalInfo.yearsOfExperience}`);
                await this.page.waitForTimeout(300);
                continue;
              }
            }

            // If we have a label that looks like a question, use AI
            // Look for: ?, how, why, what, where, when, please, tell us, let us know
            const isQuestion = label && label.length > 10 && (
              label.includes('?') ||
              /\b(how|why|what|where|when|please|tell us|let us know|describe|explain)\b/i.test(label)
            );

            if (isQuestion) {
              console.log(`  🤖 Generating answer for: "${label.substring(0, 60)}..."`);
              const answer = await this.aiGenerator.generateAnswer(label);

              if (answer) {
                await input.fill(answer);
                console.log(`  ✓ AI answer filled`);
                await this.page.waitForTimeout(500);

                // If this is a combobox (autocomplete), press Enter to confirm selection
                const role = await input.getAttribute('role');
                if (role === 'combobox') {
                  console.log('  ⌨️  Pressing Enter to confirm combobox selection');
                  await input.press('Enter');
                  await this.page.waitForTimeout(300);
                }
              } else {
                console.log(`  ⊘ Could not generate answer`);
              }
            }
          } catch (error) {
            // Silently skip problematic inputs
          }
        }
      }

    } catch (error) {
      console.log('  ℹ️  No additional questions or unable to auto-fill');
    }
  }

  async handleValidationErrors(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Check if validation error container exists
      const errorContainer = this.page.locator('[role="alert"][aria-live="assertive"], .errorsContainer, div[class*="errorsContainer"]').first();
      const hasErrors = await errorContainer.count() > 0;

      if (!hasErrors) {
        return false; // No errors found
      }

      console.log('⚠️  Form validation errors detected! Attempting to fill missing required fields...');

      // Get all error messages
      const errorElements = await errorContainer.locator('li, p').all();
      const errorMessages: string[] = [];

      for (const errorEl of errorElements) {
        const errorText = await errorEl.innerText();
        if (errorText && errorText.includes('Missing entry for required field')) {
          errorMessages.push(errorText);
          console.log(`  ❌ ${errorText}`);
        }
      }

      // For each missing field, try to find and fill it using AI
      for (const errorMsg of errorMessages) {
        try {
          // Extract field name from error message like "Missing entry for required field: Name"
          const fieldMatch = errorMsg.match(/Missing entry for required field:\s*(.+?)(?:\?)?$/);
          if (!fieldMatch) continue;

          const fieldName = fieldMatch[1].trim();
          console.log(`  🔍 Attempting to fill: "${fieldName}"`);

          // Find the field by label
          const labels = await this.page.locator('label').all();

          for (const label of labels) {
            const labelText = await label.innerText();
            const labelLower = labelText.trim().toLowerCase();
            const fieldLower = fieldName.toLowerCase();

            // Check if this label matches the missing field
            if (labelLower.includes(fieldLower) || fieldLower.includes(labelLower)) {
              console.log(`  ✓ Found matching label: "${labelText.trim()}"`);

              // Get the associated input/textarea/select
              const forId = await label.getAttribute('for');

              if (forId) {
                // Check what type of input this is
                const input = this.page.locator(`[id="${forId}"]`).first();
                const inputCount = await input.count();

                if (inputCount === 0) {
                  console.log(`  ⚠️  Input not found for id="${forId}"`);
                  continue;
                }

                const tagName = await input.evaluate(el => el.tagName.toLowerCase());
                const inputType = await input.getAttribute('type').catch(() => null);
                const role = await input.getAttribute('role').catch(() => null);

                // Handle based on input type
                if (tagName === 'textarea' || (tagName === 'input' && inputType === 'text')) {
                  // Text input or textarea - use AI to generate answer
                  if (this.aiGenerator.isEnabled()) {
                    console.log(`  🤖 Using AI to answer: "${labelText.trim()}"`);
                    const answer = await this.aiGenerator.generateAnswer(labelText.trim());

                    if (answer) {
                      await fillWithRetry(input, answer, fieldName);

                      // If combobox, press Enter
                      if (role === 'combobox') {
                        await input.press('Enter');
                        await this.page.waitForTimeout(300);
                      }
                    }
                  }
                } else if (inputType === 'file') {
                  // File input - upload resume
                  console.log(`  📎 Uploading resume for "${fieldName}"`);
                  await this.uploadResume();
                } else if (inputType === 'checkbox') {
                  // Checkbox - find parent fieldset and use AI to select options
                  const fieldsetEl = await input.evaluateHandle(el => {
                    let parent = el.parentElement;
                    while (parent && parent.tagName !== 'FIELDSET') {
                      parent = parent.parentElement;
                    }
                    return parent;
                  });

                  if (fieldsetEl) {
                    // Get all checkboxes and labels in this fieldset
                    const fieldset = this.page.locator('fieldset').filter({ has: input }).first();
                    const checkboxes = await fieldset.locator('input[type="checkbox"]').all();
                    const checkboxLabels = await fieldset.locator('label[class*="_label"]').all();

                    console.log(`  🤖 Found ${checkboxes.length} checkboxes for "${fieldName}"`);

                    // Use AI to determine which option to select
                    if (this.aiGenerator.isEnabled() && checkboxLabels.length > 0) {
                      console.log(`  🤖 Using AI to answer checkbox question: "${labelText.trim()}"`);
                      const answer = await this.aiGenerator.generateAnswer(labelText.trim());

                      if (answer) {
                        // Skip first label if it's the fieldset legend
                        const startIndex = checkboxLabels.length > checkboxes.length ? 1 : 0;

                        // Try to match AI answer with checkbox labels
                        for (let i = startIndex; i < checkboxLabels.length; i++) {
                          const checkboxLabelText = await checkboxLabels[i].innerText();
                          const checkboxIndex = i - startIndex;

                          // Check if AI answer matches this option (case-insensitive)
                          if (answer.toLowerCase().includes(checkboxLabelText.toLowerCase().trim()) ||
                              checkboxLabelText.toLowerCase().includes(answer.toLowerCase().trim())) {

                            await checkWithRetry(checkboxes[checkboxIndex], true, `${fieldName}: ${checkboxLabelText.trim()}`);
                            break;
                          }
                        }
                      }
                    }
                  }
                } else if (inputType === 'radio') {
                  // Radio button - find parent fieldset and use AI
                  const fieldset = await input.evaluateHandle(el => {
                    let parent = el.parentElement;
                    while (parent && parent.tagName !== 'FIELDSET') {
                      parent = parent.parentElement;
                    }
                    return parent;
                  });

                  if (fieldset) {
                    // Use AI to answer Yes/No question
                    if (this.aiGenerator.isEnabled()) {
                      console.log(`  🤖 Using AI to answer radio question: "${labelText.trim()}"`);
                      const aiAnswer = await this.aiGenerator.answerYesNoQuestion(labelText.trim());

                      if (aiAnswer) {
                        // Find Yes/No buttons
                        const buttonContainer = this.page.locator('div[class*="yesno"]').filter({ has: input }).first();
                        if (await buttonContainer.count() > 0) {
                          const allButtons = await buttonContainer.locator('button').all();
                          if (allButtons.length >= 2) {
                            const targetButton = aiAnswer === 'Yes' ? allButtons[0] : allButtons[1];
                            await clickWithRetry(targetButton, `AI: ${aiAnswer} for "${fieldName}"`);
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                // No 'for' attribute - might be nested input
                const nestedInput = await label.locator('input, textarea, select').first();
                if (await nestedInput.count() > 0) {
                  const tagName = await nestedInput.evaluate(el => el.tagName.toLowerCase());

                  if (tagName === 'textarea' || tagName === 'input') {
                    if (this.aiGenerator.isEnabled()) {
                      console.log(`  🤖 Using AI to answer: "${labelText.trim()}"`);
                      const answer = await this.aiGenerator.generateAnswer(labelText.trim());

                      if (answer) {
                        await fillWithRetry(nestedInput, answer, fieldName);
                      }
                    }
                  }
                }
              }

              break; // Found and processed this field, move to next error
            }
          }
        } catch (error) {
          console.log(`  ⚠️  Could not fill field: ${error}`);
          continue;
        }
      }

      console.log('  ✓ Finished attempting to fill missing required fields');
      return true; // Errors were found and handled

    } catch (error) {
      console.log(`  ℹ️  No validation errors detected`);
      return false;
    }
  }

  async setupDynamicQuestionObserver(): Promise<void> {
    if (!this.page) return;

    console.log('👁️  Setting up observer for conditional/dynamic questions...');

    try {
      // Inject a MutationObserver into the page to watch for new form fields
      // Using string approach to avoid DOM type issues in Node.js TypeScript compilation
      await this.page.evaluate(`
        (() => {
          // Check if observer already exists
          if (window.__ashbyBotObserver) {
            return;
          }

          const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              // Check if new nodes were added
              if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                  // Check if it's a fieldEntry (question container)
                  if (node.nodeType === 1) { // ELEMENT_NODE
                    if (node.classList && (
                      node.classList.contains('fieldEntry') ||
                      node.className.includes('fieldEntry') ||
                      node.className.includes('ashby-application-form-field-entry')
                    )) {
                      console.log('🔔 New question detected (conditional field appeared)');
                      // Mark that new fields appeared
                      window.__newFieldsDetected = true;
                    }
                  }
                });
              }
            }
          });

          // Start observing the form container
          const formContainer = document.querySelector('form') || document.body;
          observer.observe(formContainer, {
            childList: true,
            subtree: true
          });

          // Store observer reference
          window.__ashbyBotObserver = observer;
          window.__newFieldsDetected = false;

          console.log('✓ MutationObserver active for dynamic questions');
        })();
      `);

      console.log('  ✓ Observer set up successfully');
    } catch (error) {
      console.log('  ⚠️  Could not set up dynamic question observer');
    }
  }

  async checkForNewDynamicQuestions(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const hasNewFields = await this.page.evaluate(`window.__newFieldsDetected || false`) as boolean;

      if (hasNewFields) {
        // Reset the flag
        await this.page.evaluate(`window.__newFieldsDetected = false`);
      }

      return hasNewFields;
    } catch (error) {
      return false;
    }
  }

  /**
   * Find all required radio-group <fieldset> elements that are not yet answered,
   * ask the AI to pick the best option, and click the matching label.
   *
   * AshbyHQ radio groups look like:
   *   <fieldset>
   *     <label class="...ashby-application-form-question-title _required_*">Question?</label>
   *     <div class="_option_*">
   *       <input type="radio" id="..." name="..." />
   *       <label for="...">Option text</label>
   *     </div>
   *     ... more options ...
   *   </fieldset>
   *
   * The `_required_` class lives on the question <label>, NOT on the <input> elements,
   * so this method scans for fieldsets directly instead of relying on aria-required.
   */
  private async fillRequiredRadioGroups(): Promise<void> {
    if (!this.page) return;

    console.log('🔘 Scanning for required radio-group questions...');

    // Find fieldsets whose first descendant label carries the required class.
    // The class name uses a CSS-Modules hash (e.g. `_required_101oc_92`), so match by prefix.
    const fieldsets = await this.page.locator('fieldset').all();

    let processed = 0;
    let filled = 0;

    for (const fieldset of fieldsets) {
      try {
        const titleLabel = fieldset.locator('label.ashby-application-form-question-title').first();
        const titleCount = await titleLabel.count();
        if (titleCount === 0) continue;

        const classAttr = await titleLabel.getAttribute('class') ?? '';
        const isRequired = /_required_/.test(classAttr);
        if (!isRequired) continue;

        // Skip if already answered
        const checkedRadios = await fieldset.locator('input[type="radio"]:checked').count();
        if (checkedRadios > 0) continue;

        const questionText = (await titleLabel.textContent())?.trim() ?? '';
        if (!questionText) continue;

        // Extract options: each <input type="radio"> with its sibling <label>
        const radios = await fieldset.locator('input[type="radio"]').all();
        const options: { inputId: string; text: string }[] = [];
        for (const radio of radios) {
          const inputId = await radio.getAttribute('id');
          if (!inputId) continue;
          const labelLocator = this.page.locator(`label[for="${inputId}"]`).first();
          const labelText = (await labelLocator.textContent())?.trim() ?? '';
          if (labelText) {
            options.push({ inputId, text: labelText });
          }
        }

        if (options.length === 0) {
          console.log(`  ⚠️  Required radio group "${questionText}" has no extractable options.`);
          continue;
        }

        processed++;
        console.log(`  ❓ ${questionText}`);
        console.log(`     Options: ${options.map(o => o.text).join(' | ')}`);

        const chosen = await this.aiGenerator.pickFromOptions(questionText, options.map(o => o.text));

        if (!chosen) {
          console.log(`  ⚠️  Could not pick an option for "${questionText}". Skipping.`);
          continue;
        }

        const target = options.find(o => o.text === chosen);
        if (!target) {
          console.log(`  ⚠️  AI returned "${chosen}" which does not match any option. Skipping.`);
          continue;
        }

        // Click the label (the input is custom-styled and may be visually hidden)
        const labelToClick = this.page.locator(`label[for="${target.inputId}"]`).first();
        await labelToClick.click({ timeout: 5000 }).catch(async () => {
          // Fallback: try clicking the input directly via JS
          const input = this.page!.locator(`input[id="${target.inputId}"]`).first();
          await input.check({ force: true, timeout: 5000 }).catch(() => {});
        });

        // Verify it's checked
        const verifyChecked = await this.page.locator(`input[id="${target.inputId}"]:checked`).count();
        if (verifyChecked > 0) {
          console.log(`  ✅ Selected "${target.text}" for "${questionText}"`);
          filled++;
        } else {
          console.log(`  ⚠️  Clicked but radio is not checked for "${questionText}"`);
        }
      } catch (error) {
        console.log(`  ⚠️  Error processing a radio group: ${error}`);
        continue;
      }
    }

    console.log(`🔘 Radio-group pass: ${filled}/${processed} answered`);
  }

  async fillEmptyRequiredFields(): Promise<void> {
    if (!this.page) return;

    console.log('🔍 Checking for empty required fields before submission...');

    try {
      // Find all required fields (marked with required attribute or aria-required)
      const requiredInputs = await this.page.locator('input[required], input[aria-required="true"], textarea[required], textarea[aria-required="true"], select[required], select[aria-required="true"]').all();

      console.log(`  ℹ️  Found ${requiredInputs.length} required field(s)`);

      for (const input of requiredInputs) {
        try {
          const inputType = await input.getAttribute('type').catch(() => null);
          const tagName = await input.evaluate(el => el.tagName.toLowerCase());
          const role = await input.getAttribute('role').catch(() => null);
          const id = await input.getAttribute('id').catch(() => null);

          // Check if this field is already filled
          let isEmpty = false;

          if (inputType === 'checkbox' || inputType === 'radio') {
            const isChecked = await input.isChecked().catch(() => false);
            isEmpty = !isChecked;
          } else if (inputType === 'file') {
            // File inputs are harder to check, skip for now (will be caught by validation)
            continue;
          } else {
            const value = await input.inputValue().catch(() => '');
            isEmpty = !value || value.trim().length === 0;
          }

          if (isEmpty) {
            // Find the label for this field
            let label = '';
            if (id) {
              const labelElement = this.page.locator(`label[for="${id}"]`).first();
              if (await labelElement.count() > 0) {
                label = await labelElement.innerText();
              }
            }

            // If no label found via 'for' attribute, try to find parent label
            if (!label) {
              const parentLabel = await input.evaluateHandle(el => {
                let parent = el.parentElement;
                while (parent && parent.tagName !== 'LABEL') {
                  parent = parent.parentElement;
                }
                return parent;
              });

              if (parentLabel) {
                label = await parentLabel.evaluate(el => (el as any).innerText).catch(() => '');
              }
            }

            const fieldName = label.trim() || 'Unknown field';
            console.log(`  🔍 Found empty required field: "${fieldName}"`);

            // Try to fill this field using AI
            if (tagName === 'textarea' || (tagName === 'input' && inputType === 'text')) {
              if (this.aiGenerator.isEnabled()) {
                console.log(`  🤖 Using AI to fill: "${fieldName}"`);
                const answer = await this.aiGenerator.generateAnswer(fieldName);

                if (answer) {
                  await fillWithRetry(input, answer, fieldName);

                  // If combobox, press Enter
                  if (role === 'combobox') {
                    await input.press('Enter');
                    await this.page.waitForTimeout(300);
                  }
                }
              }
            } else if (inputType === 'checkbox') {
              // Checkbox - use AI to decide whether to check
              if (this.aiGenerator.isEnabled()) {
                console.log(`  🤖 Using AI for checkbox: "${fieldName}"`);
                const aiAnswer = await this.aiGenerator.answerYesNoQuestion(`Should I select: ${fieldName}?`);

                if (aiAnswer === 'Yes') {
                  await checkWithRetry(input, true, fieldName);
                }
              }
            } else if (inputType === 'radio') {
              // Radio button - use AI to answer
              if (this.aiGenerator.isEnabled()) {
                console.log(`  🤖 Using AI for radio: "${fieldName}"`);
                const aiAnswer = await this.aiGenerator.answerYesNoQuestion(fieldName);

                if (aiAnswer) {
                  // Find the Yes/No button container
                  const buttonContainer = this.page.locator('div[class*="yesno"]').filter({ has: input }).first();
                  if (await buttonContainer.count() > 0) {
                    const allButtons = await buttonContainer.locator('button').all();
                    if (allButtons.length >= 2) {
                      const targetButton = aiAnswer === 'Yes' ? allButtons[0] : allButtons[1];
                      await clickWithRetry(targetButton, `AI: ${aiAnswer} for "${fieldName}"`);
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          // Skip this field if we can't process it
          continue;
        }
      }

      console.log('  ✓ Finished checking required fields');
    } catch (error) {
      console.log('  ℹ️  Could not check required fields');
    }
  }

  async submitApplication() {
    if (!this.page) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    console.log('🚀 Attempting to submit application...');

    try {
      // Proactively fill any empty required fields before submission
      await this.fillEmptyRequiredFields();

      // Common submit button selectors for AshbyHQ
      const submitButtonSelectors = [
        '.ashby-application-form-submit-button', // AshbyHQ-specific class
        'button[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Submit Application")',
        'button:has-text("Apply")',
        'button:has-text("Send Application")',
        'input[type="submit"]',
        'button.submit',
        '[data-testid="submit-button"]',
        'button[aria-label*="Submit"]'
      ];

      let submitButtonFound = false;
      let submitButton: any = null;

      for (const selector of submitButtonSelectors) {
        try {
          const button = this.page.locator(selector).first();
          const count = await button.count();

          if (count > 0) {
            // Check if button is visible and enabled
            const isVisible = await button.isVisible().catch(() => false);
            const isDisabled = await button.isDisabled().catch(() => true);

            if (isVisible && !isDisabled) {
              console.log(`  ✓ Found submit button: ${selector}`);
              submitButton = button;
              submitButtonFound = true;
              break;
            } else {
              console.log(`  ⊘ Button found but not clickable: ${selector} (visible: ${isVisible}, disabled: ${isDisabled})`);
            }
          }
        } catch (error) {
          // Try next selector
          continue;
        }
      }

      if (!submitButtonFound || !submitButton) {
        console.log('  ⚠️  Could not find or click submit button. Please submit manually.');
        console.log('  ℹ️  Waiting 30 seconds for manual submission...');
        await this.page.waitForTimeout(30000);
        return;
      }

      //Attempt to submit
      await submitButton.scrollIntoViewIfNeeded().catch(() => {});
      await this.page.waitForTimeout(500);

      const clicked = await clickWithRetry(submitButton, 'Submit Application');

      if (clicked) {
        console.log('  ✅ Application submitted!');
        await this.page.waitForTimeout(2000);
      } else {
        console.log('  ⚠️  Could not click submit button');
      }

    } catch (error) {
      console.log(`  ⚠️  Error during submission: ${error}`);
    }
  }

  async close(): Promise<void> {
    console.log('🔒 Closing browser and saving video...');
    if (this.page) {
      // Close the page to finalize the video
      await this.page.close();
      console.log('📹 Video saved to ./recordings/');
    }
    if (this.browser) {
      await this.browser.close();
    }
  }
}
