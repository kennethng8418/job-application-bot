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
    throw new Error('not implemented yet (Task 11)');
  }

  async uploadResume(): Promise<void> {
    throw new Error('not implemented yet (Task 12)');
  }

  async handleAdditionalQuestions(): Promise<void> {
    throw new Error('not implemented yet (Task 11)');
  }

  private async submit(): Promise<void> {
    throw new Error('not implemented yet (Task 13)');
  }

  protected async enumerateFields(): Promise<Field[]> {
    throw new Error('not implemented yet (Task 11)');
  }
}
