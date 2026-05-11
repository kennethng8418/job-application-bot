import { chromium, Browser, Page } from 'playwright';

/**
 * Form Analysis Result
 */
export interface FormAnalysisResult {
  jobUrl: string;
  jobTitle?: string;
  company?: string;
  analyzedAt: Date;
  fields: FormField[];
  summary: FormSummary;
}

export interface FormField {
  type: 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'file' | 'radio' | 'checkbox' | 'select' | 'yesno-button' | 'unknown';
  label: string;
  name?: string;
  id?: string;
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: string[]; // For radio, checkbox, select
  detectedCategory?: string; // e.g., "Personal Info", "EEOC", "Work Authorization"
}

export interface FormSummary {
  totalFields: number;
  requiredFields: number;
  optionalFields: number;
  fieldsByType: Record<string, number>;
  fieldsByCategory: Record<string, number>;
  hasResumeUpload: boolean;
  hasCoverLetter: boolean;
  hasEEOC: boolean;
  hasVisaQuestions: boolean;
}

/**
 * AshbyHQ Form Analyzer
 * Scrapes and analyzes job application forms to understand required fields
 */
export class AshbyFormAnalyzer {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init(headless: boolean = true) {
    console.log('🔍 Initializing Form Analyzer...');
    this.browser = await chromium.launch({
      headless,
      slowMo: 100
    });
    this.page = await this.browser.newPage();
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Analyze an AshbyHQ job application form
   */
  async analyzeForm(jobUrl: string): Promise<FormAnalysisResult> {
    if (!this.page) {
      throw new Error('Analyzer not initialized. Call init() first.');
    }

    console.log(`\n📋 Analyzing form: ${jobUrl}`);
    await this.page.goto(jobUrl, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(2000);

    const fields: FormField[] = [];

    // Extract job title and company
    const jobTitle = await this.extractJobTitle();
    const company = await this.extractCompany();

    console.log(`\n🏢 Company: ${company || 'Unknown'}`);
    console.log(`💼 Job Title: ${jobTitle || 'Unknown'}\n`);

    // Analyze text inputs
    const textInputs = await this.analyzeTextInputs();
    fields.push(...textInputs);

    // Analyze textareas
    const textareas = await this.analyzeTextareas();
    fields.push(...textareas);

    // Analyze file inputs (resume, cover letter)
    const fileInputs = await this.analyzeFileInputs();
    fields.push(...fileInputs);

    // Analyze Yes/No button questions
    const yesNoButtons = await this.analyzeYesNoButtons();
    fields.push(...yesNoButtons);

    // Analyze radio button questions
    const radioButtons = await this.analyzeRadioButtons();
    fields.push(...radioButtons);

    // Analyze checkbox questions
    const checkboxes = await this.analyzeCheckboxes();
    fields.push(...checkboxes);

    // Analyze select dropdowns
    const selects = await this.analyzeSelects();
    fields.push(...selects);

    // Generate summary
    const summary = this.generateSummary(fields);

    return {
      jobUrl,
      jobTitle,
      company,
      analyzedAt: new Date(),
      fields,
      summary
    };
  }

  private async extractJobTitle(): Promise<string | undefined> {
    if (!this.page) return undefined;

    try {
      // Try common job title selectors
      const selectors = [
        'h1',
        '[data-testid="job-title"]',
        '.job-title',
        'header h1'
      ];

      for (const selector of selectors) {
        const element = this.page.locator(selector).first();
        if (await element.count() > 0) {
          const text = await element.innerText();
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        }
      }
    } catch (error) {
      // Ignore
    }

    return undefined;
  }

  private async extractCompany(): Promise<string | undefined> {
    if (!this.page) return undefined;

    try {
      // Extract from URL
      const url = this.page.url();
      const match = url.match(/jobs\.ashbyhq\.com\/([^\/]+)/);
      if (match) {
        return match[1];
      }
    } catch (error) {
      // Ignore
    }

    return undefined;
  }

  private async analyzeTextInputs(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      const inputs = await this.page.locator('input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type])').all();

      console.log(`📝 Found ${inputs.length} text input(s)`);

      for (const input of inputs) {
        try {
          const id = await input.getAttribute('id').catch(() => null);
          const name = await input.getAttribute('name').catch(() => null);
          const placeholder = await input.getAttribute('placeholder').catch(() => null);
          const required = await input.getAttribute('required').catch(() => null) !== null ||
                          await input.getAttribute('aria-required').catch(() => null) === 'true';
          const inputType = await input.getAttribute('type').catch(() => null);
          const role = await input.getAttribute('role').catch(() => null);

          // Find label
          let label = '';
          if (id) {
            const labelElement = this.page!.locator(`label[for="${id}"]`).first();
            if (await labelElement.count() > 0) {
              label = await labelElement.innerText();
            }
          }

          // Skip if no label and no placeholder
          if (!label && !placeholder) {
            continue;
          }

          const displayLabel = label.trim() || placeholder || 'Unlabeled field';

          // Determine field type
          let fieldType: FormField['type'] = 'text';
          if (inputType === 'email') fieldType = 'email';
          else if (inputType === 'tel') fieldType = 'phone';
          else if (inputType === 'url') fieldType = 'url';

          // Categorize
          const category = this.categorizeField(displayLabel);

          fields.push({
            type: fieldType,
            label: displayLabel,
            name: name || undefined,
            id: id || undefined,
            required,
            placeholder: placeholder || undefined,
            detectedCategory: category
          });

          console.log(`  ${required ? '✓' : '○'} ${fieldType.toUpperCase()}: ${displayLabel}`);
        } catch (error) {
          // Skip this input
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing text inputs');
    }

    return fields;
  }

  private async analyzeTextareas(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      const textareas = await this.page.locator('textarea').all();

      console.log(`\n📄 Found ${textareas.length} textarea(s)`);

      for (const textarea of textareas) {
        try {
          const id = await textarea.getAttribute('id').catch(() => null);
          const name = await textarea.getAttribute('name').catch(() => null);
          const placeholder = await textarea.getAttribute('placeholder').catch(() => null);
          const required = await textarea.getAttribute('required').catch(() => null) !== null ||
                          await textarea.getAttribute('aria-required').catch(() => null) === 'true';
          const isVisible = await textarea.isVisible().catch(() => false);

          if (!isVisible) continue;

          // Find label
          let label = '';
          if (id) {
            const labelElement = this.page!.locator(`label[for="${id}"]`).first();
            if (await labelElement.count() > 0) {
              label = await labelElement.innerText();
            }
          }

          const displayLabel = label.trim() || placeholder || 'Unlabeled textarea';

          // Categorize
          const category = this.categorizeField(displayLabel);

          fields.push({
            type: 'textarea',
            label: displayLabel,
            name: name || undefined,
            id: id || undefined,
            required,
            placeholder: placeholder || undefined,
            detectedCategory: category
          });

          console.log(`  ${required ? '✓' : '○'} TEXTAREA: ${displayLabel}`);
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing textareas');
    }

    return fields;
  }

  private async analyzeFileInputs(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      const fileInputs = await this.page.locator('input[type="file"]').all();

      console.log(`\n📎 Found ${fileInputs.length} file input(s)`);

      for (const input of fileInputs) {
        try {
          const id = await input.getAttribute('id').catch(() => null);
          const name = await input.getAttribute('name').catch(() => null);
          const accept = await input.getAttribute('accept').catch(() => null);
          const required = await input.getAttribute('required').catch(() => null) !== null ||
                          await input.getAttribute('aria-required').catch(() => null) === 'true';

          // Find label
          let label = '';
          if (id) {
            const labelElement = this.page!.locator(`label[for="${id}"]`).first();
            if (await labelElement.count() > 0) {
              label = await labelElement.innerText();
            }
          }

          const displayLabel = label.trim() || name || 'File upload';

          // Categorize
          const category = this.categorizeField(displayLabel);

          fields.push({
            type: 'file',
            label: displayLabel,
            name: name || undefined,
            id: id || undefined,
            required,
            description: accept || undefined,
            detectedCategory: category
          });

          console.log(`  ${required ? '✓' : '○'} FILE: ${displayLabel}${accept ? ` (${accept})` : ''}`);
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing file inputs');
    }

    return fields;
  }

  private async analyzeYesNoButtons(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      // Find all fieldEntry containers with Yes/No buttons
      const fieldEntries = await this.page.locator('.fieldEntry, div[class*="fieldEntry"], div[class*="ashby-application-form-field-entry"]').all();

      console.log(`\n🔘 Analyzing Yes/No button questions...`);

      for (const fieldEntry of fieldEntries) {
        try {
          const fieldText = await fieldEntry.innerText();
          const buttonContainer = fieldEntry.locator('div[class*="yesno"]').first();

          if (await buttonContainer.count() > 0) {
            // This is a Yes/No button question
            const buttons = await buttonContainer.locator('button').all();

            if (buttons.length >= 2) {
              // Extract the question label
              const labelElement = fieldEntry.locator('label').first();
              let label = 'Yes/No question';

              if (await labelElement.count() > 0) {
                label = await labelElement.innerText();
              }

              // Check if required
              const classAttr = await labelElement.getAttribute('class').catch(() => null);
              const hasRequired = classAttr ? /required/i.test(classAttr) : false;

              // Categorize
              const category = this.categorizeField(label);

              fields.push({
                type: 'yesno-button',
                label: label.trim(),
                required: hasRequired,
                options: ['Yes', 'No'],
                detectedCategory: category
              });

              console.log(`  ${hasRequired ? '✓' : '○'} YES/NO: ${label.trim()}`);
            }
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing Yes/No buttons');
    }

    return fields;
  }

  private async analyzeRadioButtons(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      const fieldsets = await this.page.locator('fieldset').all();

      console.log(`\n🔘 Analyzing radio button questions...`);

      for (const fieldset of fieldsets) {
        try {
          const radioButtons = await fieldset.locator('input[type="radio"]').all();

          if (radioButtons.length > 0) {
            // Get fieldset legend/label
            const legendElement = fieldset.locator('label.ashby-application-form-question-title, legend, label').first();
            let label = 'Radio button question';

            if (await legendElement.count() > 0) {
              label = await legendElement.innerText();
            }

            // Check if required
            const classAttr2 = await legendElement.getAttribute('class').catch(() => null);
            const hasRequired = classAttr2 ? /required|aria-required/i.test(classAttr2) : false;

            // Get all options
            const labels = await fieldset.locator('label[class*="_label"]').all();
            const options: string[] = [];

            // Skip first label if it's the legend
            const startIndex = labels.length > radioButtons.length ? 1 : 0;

            for (let i = startIndex; i < labels.length; i++) {
              const optionText = await labels[i].innerText();
              if (optionText && optionText.trim().length > 0) {
                options.push(optionText.trim());
              }
            }

            // Get description if available
            const descElement = fieldset.locator('.ashby-application-form-question-description, div[class*="_description"]').first();
            let description: string | undefined;

            if (await descElement.count() > 0) {
              description = await descElement.innerText();
            }

            // Categorize
            const category = this.categorizeField(label);

            fields.push({
              type: 'radio',
              label: label.trim(),
              required: hasRequired,
              options,
              description: description?.trim(),
              detectedCategory: category
            });

            console.log(`  ${hasRequired ? '✓' : '○'} RADIO: ${label.trim()}`);
            options.forEach(opt => console.log(`      - ${opt}`));
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing radio buttons');
    }

    return fields;
  }

  private async analyzeCheckboxes(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      const fieldsets = await this.page.locator('fieldset').all();

      console.log(`\n☑️  Analyzing checkbox questions...`);

      for (const fieldset of fieldsets) {
        try {
          const checkboxes = await fieldset.locator('input[type="checkbox"]').all();

          if (checkboxes.length > 0) {
            // Get fieldset legend/label
            const legendElement = fieldset.locator('label.ashby-application-form-question-title, legend, label').first();
            let label = 'Checkbox question';

            if (await legendElement.count() > 0) {
              label = await legendElement.innerText();
            }

            // Skip if this is likely a single checkbox (not a group)
            if (checkboxes.length === 1) {
              continue;
            }

            // Check if required
            const classAttr2 = await legendElement.getAttribute('class').catch(() => null);
            const hasRequired = classAttr2 ? /required|aria-required/i.test(classAttr2) : false;

            // Get all options
            const labels = await fieldset.locator('label[class*="_label"]').all();
            const options: string[] = [];

            // Skip first label if it's the legend
            const startIndex = labels.length > checkboxes.length ? 1 : 0;

            for (let i = startIndex; i < labels.length; i++) {
              const optionText = await labels[i].innerText();
              if (optionText && optionText.trim().length > 0) {
                options.push(optionText.trim());
              }
            }

            // Categorize
            const category = this.categorizeField(label);

            fields.push({
              type: 'checkbox',
              label: label.trim(),
              required: hasRequired,
              options,
              detectedCategory: category
            });

            console.log(`  ${hasRequired ? '✓' : '○'} CHECKBOX: ${label.trim()}`);
            options.forEach(opt => console.log(`      - ${opt}`));
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing checkboxes');
    }

    return fields;
  }

  private async analyzeSelects(): Promise<FormField[]> {
    if (!this.page) return [];

    const fields: FormField[] = [];

    try {
      const selects = await this.page.locator('select').all();

      console.log(`\n📋 Found ${selects.length} select dropdown(s)`);

      for (const select of selects) {
        try {
          const id = await select.getAttribute('id').catch(() => null);
          const name = await select.getAttribute('name').catch(() => null);
          const required = await select.getAttribute('required').catch(() => null) !== null ||
                          await select.getAttribute('aria-required').catch(() => null) === 'true';

          // Find label
          let label = '';
          if (id) {
            const labelElement = this.page!.locator(`label[for="${id}"]`).first();
            if (await labelElement.count() > 0) {
              label = await labelElement.innerText();
            }
          }

          const displayLabel = label.trim() || name || 'Select dropdown';

          // Get options
          const optionElements = await select.locator('option').all();
          const options: string[] = [];

          for (const option of optionElements) {
            const optionText = await option.innerText();
            if (optionText && optionText.trim().length > 0 && !optionText.includes('Select')) {
              options.push(optionText.trim());
            }
          }

          // Categorize
          const category = this.categorizeField(displayLabel);

          fields.push({
            type: 'select',
            label: displayLabel,
            name: name || undefined,
            id: id || undefined,
            required,
            options,
            detectedCategory: category
          });

          console.log(`  ${required ? '✓' : '○'} SELECT: ${displayLabel}`);
          if (options.length > 0 && options.length <= 5) {
            options.forEach(opt => console.log(`      - ${opt}`));
          } else if (options.length > 5) {
            console.log(`      (${options.length} options)`);
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.log('  ⚠️  Error analyzing selects');
    }

    return fields;
  }

  private categorizeField(label: string): string {
    const lowerLabel = label.toLowerCase();

    // Personal Information
    if (/first.*name|last.*name|legal.*name|email|phone|linkedin|github|portfolio|website|location|city|address/i.test(lowerLabel)) {
      return 'Personal Information';
    }

    // Work Authorization
    if (/citizen|permanent.*resident|work.*authorization|visa|sponsorship|authorized.*work/i.test(lowerLabel)) {
      return 'Work Authorization';
    }

    // EEOC Demographics
    if (/gender|race|ethnicity|veteran|disability|eeoc/i.test(lowerLabel)) {
      return 'EEOC Demographics';
    }

    // Work Preferences
    if (/remote|hybrid|office|location.*hub|miles.*hub|preferred.*location|start.*date|available/i.test(lowerLabel)) {
      return 'Work Preferences';
    }

    // Resume/Documents
    if (/resume|cv|cover.*letter|portfolio|document|upload|attach/i.test(lowerLabel)) {
      return 'Documents';
    }

    // Referral
    if (/how.*hear|referral|source|find.*opportunity/i.test(lowerLabel)) {
      return 'Referral';
    }

    // Open-ended Questions
    if (/why|what.*interests|tell.*us|describe|explain|experience|background/i.test(lowerLabel)) {
      return 'Open-ended Questions';
    }

    // Other
    if (/age|18.*years|over.*18/i.test(lowerLabel)) {
      return 'Age Verification';
    }

    return 'Other';
  }

  private generateSummary(fields: FormField[]): FormSummary {
    const totalFields = fields.length;
    const requiredFields = fields.filter(f => f.required).length;
    const optionalFields = totalFields - requiredFields;

    const fieldsByType: Record<string, number> = {};
    const fieldsByCategory: Record<string, number> = {};

    for (const field of fields) {
      // Count by type
      fieldsByType[field.type] = (fieldsByType[field.type] || 0) + 1;

      // Count by category
      if (field.detectedCategory) {
        fieldsByCategory[field.detectedCategory] = (fieldsByCategory[field.detectedCategory] || 0) + 1;
      }
    }

    const hasResumeUpload = fields.some(f => f.type === 'file' && /resume|cv/i.test(f.label));
    const hasCoverLetter = fields.some(f => f.type === 'file' && /cover.*letter/i.test(f.label));
    const hasEEOC = fields.some(f => f.detectedCategory === 'EEOC Demographics');
    const hasVisaQuestions = fields.some(f => f.detectedCategory === 'Work Authorization');

    return {
      totalFields,
      requiredFields,
      optionalFields,
      fieldsByType,
      fieldsByCategory,
      hasResumeUpload,
      hasCoverLetter,
      hasEEOC,
      hasVisaQuestions
    };
  }

  /**
   * Print analysis result to console
   */
  printAnalysis(result: FormAnalysisResult) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 FORM ANALYSIS SUMMARY');
    console.log('='.repeat(70));

    console.log(`\n🏢 Company: ${result.company || 'Unknown'}`);
    console.log(`💼 Job Title: ${result.jobTitle || 'Unknown'}`);
    console.log(`🔗 URL: ${result.jobUrl}`);
    console.log(`⏰ Analyzed: ${result.analyzedAt.toLocaleString()}`);

    console.log('\n📈 STATISTICS:');
    console.log(`  Total Fields: ${result.summary.totalFields}`);
    console.log(`  Required: ${result.summary.requiredFields}`);
    console.log(`  Optional: ${result.summary.optionalFields}`);

    console.log('\n📋 FIELDS BY TYPE:');
    Object.entries(result.summary.fieldsByType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type.toUpperCase()}: ${count}`);
      });

    console.log('\n🏷️  FIELDS BY CATEGORY:');
    Object.entries(result.summary.fieldsByCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`);
      });

    console.log('\n✅ FEATURES:');
    console.log(`  Resume Upload: ${result.summary.hasResumeUpload ? 'Yes' : 'No'}`);
    console.log(`  Cover Letter: ${result.summary.hasCoverLetter ? 'Yes' : 'No'}`);
    console.log(`  EEOC Questions: ${result.summary.hasEEOC ? 'Yes' : 'No'}`);
    console.log(`  Visa Questions: ${result.summary.hasVisaQuestions ? 'Yes' : 'No'}`);

    console.log('\n' + '='.repeat(70));
  }

  /**
   * Export analysis to JSON file
   */
  async exportToJSON(result: FormAnalysisResult, filename: string) {
    const fs = await import('fs');
    const json = JSON.stringify(result, null, 2);
    fs.writeFileSync(filename, json, 'utf-8');
    console.log(`\n💾 Analysis exported to: ${filename}`);
  }
}
