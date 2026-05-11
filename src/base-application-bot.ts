import { Browser, Page } from 'playwright';
import { ResumeData } from '../config/resume-data';

export interface ApplicationBot {
  init(headless?: boolean): Promise<void>;
  applyToJob(jobUrl: string): Promise<void>;
  close(): Promise<void>;
}

export abstract class BaseApplicationBot implements ApplicationBot {
  protected browser: Browser | null = null;
  protected page: Page | null = null;
  protected resumeData: ResumeData;

  constructor(resumeData: ResumeData) {
    this.resumeData = resumeData;
  }

  abstract init(headless?: boolean): Promise<void>;
  abstract applyToJob(jobUrl: string): Promise<void>;
  abstract fillPersonalInfo(): Promise<void>;
  abstract uploadResume(): Promise<void>;
  abstract handleAdditionalQuestions(): Promise<void>;

  async close(): Promise<void> {
    console.log('🔒 Closing browser...');
    if (this.browser) {
      await this.browser.close();
    }
  }
}
