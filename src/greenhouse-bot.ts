import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { BaseApplicationBot } from './base-application-bot';
import type { ResumeData } from '../config/resume-data';
import { AIAnswerGenerator } from './ai-answer-generator';
import { FieldResolver } from './greenhouse/field-resolver';
import type { Field } from './greenhouse/types';
import {
  SELECTORS,
  MAX_RESUME_BYTES,
  UPLOAD_CONFIRMATION_TIMEOUT_MS,
  POST_SUBMIT_VERIFICATION_MS,
} from './greenhouse/selectors';

export interface GreenhouseBotOptions {
  dryRun?: boolean;
}

export class GreenhouseJobApplicationBot extends BaseApplicationBot {
  private aiGenerator: AIAnswerGenerator;
  private resolver: FieldResolver;
  private dryRun: boolean;
  private currentUrl: string | null = null;

  constructor(resumeData: ResumeData, options: GreenhouseBotOptions = {}) {
    super(resumeData);
    this.aiGenerator = new AIAnswerGenerator(resumeData);
    this.resolver = new FieldResolver(resumeData, this.aiGenerator);
    this.dryRun = options.dryRun ?? false;
  }

  async init(headless?: boolean): Promise<void> {
    this.browser = await chromium.launch({ headless: headless ?? false });
    this.page = await this.browser.newPage();
  }

  async applyToJob(jobUrl: string): Promise<void> {
    this.currentUrl = jobUrl;
    if (!this.page) throw new Error('Bot not initialized — call init() first');

    console.log(`\n🌿 Greenhouse: ${jobUrl}`);
    await this.page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    await this.fillPersonalInfo();
    await this.uploadResume();
    await this.handleAdditionalQuestions();

    if (this.dryRun) {
      console.log('🧪 Dry run — skipping submit');
      return;
    }
    await this.submit();
  }

  async fillPersonalInfo(): Promise<void> {
    if (!this.page) throw new Error('page not ready');
    let fields = await this.enumerateFields();

    const countryField = fields.find(f => /^country$/i.test(f.label));
    const universalLabels = /^(first name|last name|email)$/i;

    for (const field of fields) {
      if (!universalLabels.test(field.label)) continue;
      const result = this.resolver.resolve(field.label, { isPhone: false });
      if (result.kind === 'value') await this.fillField(field, result.value);
    }

    if (countryField) {
      const result = this.resolver.resolve('Country', { isPhone: false });
      if (result.kind === 'value') await this.fillField(countryField, result.value);
      await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
      fields = await this.enumerateFields();
    }

    const refreshedPhones = fields.filter(f => /^phone$/i.test(f.label));
    const phoneContextFor = (idx: number): 'first' | 'second' | 'only' => {
      if (refreshedPhones.length === 1) return 'only';
      return idx === 0 ? 'first' : 'second';
    };

    for (let i = 0; i < refreshedPhones.length; i++) {
      const result = this.resolver.resolve('Phone', { isPhone: phoneContextFor(i) });
      if (result.kind === 'value') await this.fillField(refreshedPhones[i], result.value);
    }
  }

  async uploadResume(): Promise<void> {
    if (!this.page) throw new Error('page not ready');
    const resumeAbsPath = path.resolve(this.resumeData.resumePath);
    if (!fs.existsSync(resumeAbsPath)) {
      console.log(`  ❌ Resume file not found: ${resumeAbsPath}`);
      return;
    }
    const size = fs.statSync(resumeAbsPath).size;
    if (size > MAX_RESUME_BYTES) {
      console.log(`  ❌ Resume exceeds 10MB cap (${size} bytes)`);
      return;
    }

    const resumeInput = this.page.locator(SELECTORS.resumeFileInput).first();
    if ((await resumeInput.count()) === 0) {
      console.log('  ⚠️  No resume file input found');
      return;
    }
    await resumeInput.setInputFiles(resumeAbsPath);
    console.log(`  ✓ Uploaded resume: ${path.basename(resumeAbsPath)}`);

    await this.page
      .locator(SELECTORS.uploadConfirmation)
      .first()
      .waitFor({ timeout: UPLOAD_CONFIRMATION_TIMEOUT_MS })
      .catch(() => console.log('  ⚠️  Upload confirmation not detected (continuing)'));

    if (this.resumeData.coverLetterPath) {
      const clAbsPath = path.resolve(this.resumeData.coverLetterPath);
      if (fs.existsSync(clAbsPath)) {
        const clInput = this.page.locator(SELECTORS.coverLetterFileInput).first();
        if ((await clInput.count()) > 0) {
          await clInput.setInputFiles(clAbsPath);
          console.log(`  ✓ Uploaded cover letter: ${path.basename(clAbsPath)}`);
        }
      }
    }
  }

  async handleAdditionalQuestions(): Promise<void> {
    if (!this.page) throw new Error('page not ready');
    const fields = await this.enumerateFields();
    const universalLabels = /^(first name|last name|email|phone|country|resume\/cv|resume)$/i;

    for (const field of fields) {
      if (universalLabels.test(field.label)) continue;
      if (field.kind === 'file') continue;
      // Cover letter is handled by uploadResume() (file upload) — never fill via fillField.
      if (/cover letter/i.test(field.label)) continue;

      const isTextarea = field.kind === 'textarea';
      const result = await this.resolver.resolveAsync(
        field.label,
        { isPhone: false },
        { isTextarea },
      );

      if (result.kind === 'value') {
        await this.fillField(field, result.value);
      } else if (result.kind === 'unresolved' && field.required) {
        console.log(`  ⚠️  Unresolved required field: ${field.label}`);
      }
    }
  }

  private async submit(): Promise<void> {
    if (!this.page) throw new Error('page not ready');
    const captcha = this.page.locator(SELECTORS.recaptchaIframe);
    if ((await captcha.count()) > 0) {
      console.log('  ❌ reCAPTCHA detected — submission aborted, moving on');
      return;
    }

    const submitBtn = this.page.locator(SELECTORS.submitButton).first();
    if ((await submitBtn.count()) === 0) {
      console.log('  ❌ Submit button not found');
      return;
    }

    const beforeUrl = this.page.url();
    await submitBtn.click();

    try {
      await this.page.waitForFunction(
        (prevUrl) =>
          window.location.href !== prevUrl ||
          document.body.innerText.match(/application submitted|thank you for applying|your application/i),
        beforeUrl,
        { timeout: POST_SUBMIT_VERIFICATION_MS },
      );
      console.log('  ✓ Submission confirmed');
    } catch {
      console.log('  ⚠️  Submission status uncertain — manual review required');
    }
  }

  protected async enumerateFields(): Promise<Field[]> {
    if (!this.page) throw new Error('page not ready');
    const fields: Field[] = [];

    const labelHandles = await this.page.locator('label').all();
    for (const labelHandle of labelHandles) {
      const labelText = (await labelHandle.textContent())?.trim() ?? '';
      if (!labelText) continue;

      const forAttr = await labelHandle.getAttribute('for');
      if (!forAttr) continue;

      const escapedForAttr = forAttr.replace(/(["\\#.\[\]:])/g, '\\$1');
      const input = this.page.locator(`#${escapedForAttr}`).first();
      if ((await input.count()) === 0) continue;

      const tagName = (await input.evaluate(el => el.tagName)).toLowerCase();
      const typeAttr = (await input.getAttribute('type')) ?? '';
      const ariaRequired = (await input.getAttribute('aria-required')) === 'true';
      const required = ariaRequired || (await input.getAttribute('required')) !== null
        || /\*\s*$/.test(labelText);
      const role = await input.getAttribute('role');

      let kind: Field['kind'];
      if (tagName === 'textarea') kind = 'textarea';
      else if (tagName === 'select') kind = 'select';
      else if (typeAttr === 'file') kind = 'file';
      else if (typeAttr === 'checkbox') kind = 'checkbox';
      else if (typeAttr === 'radio') kind = 'radio';
      else if (role === 'combobox') kind = 'combobox';
      else kind = 'text';

      const labelClean = labelText.replace(/\*$/, '').trim();

      if (kind === 'select') {
        const options = await input.locator('option').allTextContents();
        fields.push({ kind, label: labelClean, element: input, required, options: options.map(o => o.trim()) });
      } else if (kind === 'radio') {
        const groupName = (await input.getAttribute('name')) ?? '';
        const groupInputs = this.page.locator(`input[name="${groupName}"]`);
        const optionLabels: string[] = [];
        const count = await groupInputs.count();
        for (let i = 0; i < count; i++) {
          const id = await groupInputs.nth(i).getAttribute('id');
          if (id) {
            const optLabel = this.page.locator(`label[for="${id}"]`).first();
            if ((await optLabel.count()) > 0) {
              optionLabels.push(((await optLabel.textContent()) ?? '').trim());
            }
          }
        }
        fields.push({ kind, label: labelClean, element: input, required, options: optionLabels });
      } else {
        fields.push({ kind, label: labelClean, element: input, required } as Field);
      }
    }

    return fields;
  }

  private async fillField(field: Field, value: string): Promise<void> {
    switch (field.kind) {
      case 'text':
      case 'textarea':
        await field.element.fill(value);
        break;
      case 'select':
        await field.element.selectOption({ label: value }).catch(async () => {
          await field.element.selectOption({ value }).catch(() => {});
        });
        break;
      case 'combobox':
        await field.element.click();
        if (this.page) {
          // Wait briefly for dropdown options to render after the click
          await this.page
            .locator('[role="option"]')
            .first()
            .waitFor({ state: 'visible', timeout: 3000 })
            .catch(() => null);

          // Try exact match first (case-insensitive), then substring fallback
          const allOptions = this.page.locator('[role="option"]');
          const exactCount = await allOptions.count();
          let picked = false;
          for (let i = 0; i < exactCount; i++) {
            const optText = ((await allOptions.nth(i).textContent()) ?? '').trim();
            if (optText.toLowerCase() === value.toLowerCase()) {
              await allOptions.nth(i).click();
              picked = true;
              break;
            }
          }
          if (!picked) {
            const fallback = this.page.locator('[role="option"]').filter({ hasText: value }).first();
            if ((await fallback.count()) > 0) await fallback.click();
          }
        }
        break;
      case 'radio':
        if (this.page) {
          const groupName = await field.element.getAttribute('name');
          if (groupName) {
            const groupInputs = this.page.locator(`input[name="${groupName}"]`);
            const count = await groupInputs.count();
            for (let i = 0; i < count; i++) {
              const radio = groupInputs.nth(i);
              const id = await radio.getAttribute('id');
              if (!id) continue;
              const labelEl = this.page.locator(`label[for="${id}"]`).first();
              const labelText = ((await labelEl.textContent()) ?? '').trim();
              if (labelText.toLowerCase() === value.toLowerCase()) {
                await radio.check();
                break;
              }
            }
          }
        }
        break;
      case 'checkbox':
        if (value === 'true' || value === 'Yes') await field.element.check();
        else await field.element.uncheck();
        break;
      case 'file':
        throw new Error('fillField should not be called for files — use uploadResume()');
    }
  }
}
