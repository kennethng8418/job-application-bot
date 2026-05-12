import Anthropic from '@anthropic-ai/sdk';
import { ResumeData } from '../config/resume-data';
import { PREFERENCES } from '../config/answer-preferences';
import { classifyQuestion } from './utils/question-classifier';
import * as fs from 'fs';
import * as path from 'path';

export class AIAnswerGenerator {
  private client: Anthropic | null = null;
  private resumeData: ResumeData;
  private resumeBase64: string | null = null;

  constructor(resumeData: ResumeData) {
    this.resumeData = resumeData;

    if (resumeData.aiConfig?.enabled) {
      const apiKey = resumeData.aiConfig.apiKey || process.env.ANTHROPIC_API_KEY;

      if (apiKey) {
        this.client = new Anthropic({
          apiKey: apiKey,
        });

        // Load resume file if it exists
        try {
          const resumePath = path.resolve(resumeData.resumePath);
          if (fs.existsSync(resumePath)) {
            const resumeBuffer = fs.readFileSync(resumePath);
            this.resumeBase64 = resumeBuffer.toString('base64');
            console.log('📄 Resume loaded for AI context');
          }
        } catch (error) {
          console.log('⚠️  Could not load resume file for AI context');
        }
      } else {
        console.log('⚠️  AI answer generation enabled but no API key found.');
        console.log('Set  environment variable or add apiKey to aiConfig.');
      }
    }
  }

  async generateAnswer(question: string): Promise<string | null> {
    if (!this.client || !this.resumeData.aiConfig?.enabled) {
      return null;
    }

    try {
      const { personalInfo, preferences, aiConfig } = this.resumeData;
      const background = aiConfig.background || 'I am a software engineer looking for new opportunities.';

      const prompt = `You are helping fill out a job application. Answer the following question professionally and concisely.

I have attached the applicant's resume for your reference.

Additional background:
${background}

Name: ${personalInfo.firstName} ${personalInfo.lastName}
Location: ${personalInfo.location}
University: ${personalInfo.university || 'Not specified'}
Years of Experience: ${personalInfo.yearsOfExperience || 'Not specified'}
US Citizen: ${preferences.usCitizen ? 'Yes' : 'No'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}

Question: ${question}

IMPORTANT INSTRUCTIONS:
1. Use the resume to provide accurate, specific details about the applicant's experience, skills, and background.
2. If this is a simple yes/no question that doesn't require explanation (e.g., "Are you willing to work in NYC?", "Do you have a degree?"), answer ONLY with "Yes" or "No".
3. If the question asks about visa status, visa type, visa expiration, or sponsorship details AND the applicant does NOT require visa sponsorship, answer with "N/A" or "None" (whichever is more appropriate for the question context).
4. If the question asks "How did you hear about this opportunity?" or "Where did you find this job?", answer with "LinkedIn" (single word).
5. If the question asks about location, city, where you are available to work, or what cities you can work in, answer ONLY with the applicant's location: "${personalInfo.location}" (do NOT add any explanation or additional text).
6. If the question asks about university, college, or school, answer ONLY with: "${personalInfo.university || 'Not specified'}" (do NOT add any explanation).
7. If the question asks about years of experience (e.g., "How many years of relevant experience do you have?"), answer ONLY with the number: "${personalInfo.yearsOfExperience || 'Not specified'}" (just the number, no additional text).
8. If the question asks for explanation, reasoning, or a story (e.g., "How'd you get into programming?", "Why are you interested?"), provide a genuine, professional answer in 2-4 sentences based on their actual resume.
9. Keep your answer natural and conversational.
10. Do not add extra text like "Answer:" or explanations unless specifically asked.`;

      // Build message content with resume if available
      const messageContent: Array<any> = [];

      // Add resume PDF if available
      if (this.resumeBase64) {
        messageContent.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: this.resumeBase64,
          },
        });
      }

      // Add the text prompt
      messageContent.push({
        type: 'text',
        text: prompt,
      });

      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: aiConfig.maxTokens || 500,
        messages: [
          {
            role: 'user',
            content: messageContent,
          },
        ],
      });

      const textContent = message.content.find(block => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        return textContent.text;
      }

      return null;
    } catch (error) {
      console.log(`  ⚠️  Failed to generate AI answer: ${error}`);
      return null;
    }
  }

  async answerYesNoQuestion(question: string): Promise<'Yes' | 'No' | null> {
    if (!this.client || !this.resumeData.aiConfig?.enabled) {
      return null;
    }

    try {
      const { personalInfo, preferences } = this.resumeData;

      const prompt = `You are helping fill out a job application. Answer the following Yes/No question based on the applicant's profile.

Applicant Profile:
- Name: ${personalInfo.firstName} ${personalInfo.lastName}
- Location: ${personalInfo.location}
- Remote Preference: ${preferences.remote}
- Work Location: ${preferences.workLocation || personalInfo.location}
- Sponsorship Required: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
- US Citizen: ${preferences.usCitizen ? 'Yes' : 'No'}
- Start Date: ${preferences.startDate || 'Flexible'}

Question: ${question}

IMPORTANT: Answer ONLY with "Yes" or "No" - nothing else. Consider the applicant's location and preferences when answering.`;

      const message = await this.client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const textContent = message.content.find(block => block.type === 'text');
      if (textContent && textContent.type === 'text') {
        const answer = textContent.text.trim();
        if (answer === 'Yes' || answer === 'No') {
          return answer as 'Yes' | 'No';
        }
      }

      return null;
    } catch (error) {
      console.log(`  ⚠️  Failed to generate AI Yes/No answer: ${error}`);
      return null;
    }
  }

  /**
   * Ask the AI to pick exactly one option from a list, given the question text.
   * Returns the verbatim chosen option string, or null if the AI is disabled
   * and no fallback applies.
   *
   * Fallback strategy (in order):
   *   1. If AI returns a string that doesn't exactly match any option, retry once with stricter instructions.
   *   2. If still no match, classify the question; for 'howDidYouHear', return the
   *      option matching PREFERENCES.defaults.howDidYouHear (case-insensitive).
   *   3. If any option equals PREFERENCES.defaults.other (case-insensitive), return it.
   *   4. Otherwise return null (caller should log + skip).
   */
  async pickFromOptions(question: string, options: string[]): Promise<string | null> {
    if (options.length === 0) {
      return null;
    }

    const fallback = (): string | null => {
      const category = classifyQuestion(question);

      const findCaseInsensitive = (target: string) =>
        options.find(o => o.toLowerCase() === target.toLowerCase()) ?? null;

      if (category === 'howDidYouHear') {
        return findCaseInsensitive(PREFERENCES.defaults.howDidYouHear)
            ?? findCaseInsensitive(PREFERENCES.defaults.other);
      }
      if (category === 'other') {
        return findCaseInsensitive(PREFERENCES.defaults.other);
      }
      return null;
    };

    if (!this.client || !this.resumeData.aiConfig?.enabled) {
      return fallback();
    }

    const client = this.client;
    const { personalInfo, preferences, aiConfig } = this.resumeData;
    const background = aiConfig.background || 'I am a software engineer looking for new opportunities.';
    const tone = PREFERENCES.tone;
    const maxTokens = aiConfig.maxTokens || 200;

    const askModel = async (strict: boolean): Promise<string | null> => {
      try {
        const optionList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');

        const instruction = strict
          ? 'CRITICAL: Respond with the EXACT text of one option, copy-paste from the list above. No extra words, no quotes, no numbering.'
          : 'Respond with the exact text of the option you choose. Do not add quotes, numbering, or explanation.';

        const prompt = `You are helping fill out a job application. Pick exactly ONE option from the list below.

Applicant background:
${background}

Name: ${personalInfo.firstName} ${personalInfo.lastName}
Years of Experience: ${personalInfo.yearsOfExperience || 'Not specified'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}

Tone preference: ${tone} (pick the strongest plausible option that the resume supports; do not overclaim).

Question: ${question}

Options:
${optionList}

${instruction}`;

        const messageContent: Array<any> = [];
        if (this.resumeBase64) {
          messageContent.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: this.resumeBase64 },
          });
        }
        messageContent.push({ type: 'text', text: prompt });

        const message = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: messageContent }],
        });

        const textContent = message.content.find(block => block.type === 'text');
        if (!textContent || textContent.type !== 'text') return null;

        const raw = textContent.text.trim();
        const match = options.find(o => o === raw)
          ?? options.find(o => o.toLowerCase() === raw.toLowerCase());
        return match ?? null;
      } catch (error) {
        console.log(`  ⚠️  Failed to pick option via AI: ${error}`);
        return null;
      }
    };

    const first = await askModel(false);
    if (first) return first;

    const second = await askModel(true);
    if (second) return second;

    return fallback();
  }

  isEnabled(): boolean {
    return !!this.client && !!this.resumeData.aiConfig?.enabled;
  }
}
