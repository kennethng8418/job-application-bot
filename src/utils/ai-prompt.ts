import type { ResumeData } from '../../config/resume-data';

export interface PickPromptArgs {
  personalInfo: ResumeData['personalInfo'];
  preferences: ResumeData['preferences'];
  background: string;
  tone: string;
  question: string;
  options: string[];
  strict: boolean;
}

export function buildPickPrompt(args: PickPromptArgs): string {
  const { personalInfo, preferences, background, tone, question, options, strict } = args;

  const optionList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');

  const instruction = strict
    ? 'CRITICAL: Respond with the EXACT text of one option, copy-paste from the list above. No extra words, no quotes, no numbering.'
    : 'Respond with the exact text of the option you choose. Do not add quotes, numbering, or explanation.';

  const subCategoryLines: string[] = [];
  if (personalInfo.asianSubcategory) {
    subCategoryLines.push(`Race sub-category: ${personalInfo.asianSubcategory}`);
  }

  const subCategoryBlock = subCategoryLines.length > 0 ? subCategoryLines.join('\n') + '\n' : '';

  return `You are helping fill out a job application. Pick exactly ONE option from the list below.

Applicant background:
${background}

Name: ${personalInfo.firstName} ${personalInfo.lastName}
Years of Experience: ${personalInfo.yearsOfExperience || 'Not specified'}
Requires Visa Sponsorship: ${preferences.requiresVisaSponsorship ? 'Yes' : 'No'}
Willing to Relocate: ${preferences.willingToRelocate ? 'Yes' : 'No'}
${subCategoryBlock}
Tone preference: ${tone} (pick the strongest plausible option that the resume supports; do not overclaim).

Question: ${question}

Options:
${optionList}

${instruction}`;
}
