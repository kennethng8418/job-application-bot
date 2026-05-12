import type { ResumeData } from '../../config/resume-data';
import type { ResolverContext, ResolverResult } from './types';
import { PREFERENCES } from '../../config/answer-preferences';

function normalizeTechKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/\s*\*\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const CITY_TO_COUNTRY: Record<string, string> = {
  'new york': 'United States',
  'san francisco': 'United States',
  'los angeles': 'United States',
  'london': 'United Kingdom',
  'berlin': 'Germany',
  'paris': 'France',
  'tokyo': 'Japan',
  'toronto': 'Canada',
};

function inferCountry(location: string): string {
  const lower = location.toLowerCase();
  for (const [city, country] of Object.entries(CITY_TO_COUNTRY)) {
    if (lower.includes(city)) return country;
  }
  return 'United States';
}

export class FieldResolver {
  constructor(private readonly resumeData: ResumeData) {}

  resolve(rawLabel: string, ctx: ResolverContext): ResolverResult {
    const label = normalizeLabel(rawLabel);
    const staticResult = this.tryStatic(label, ctx);
    if (staticResult.kind !== 'unresolved') return staticResult;
    const patternResult = this.tryPattern(label);
    if (patternResult.kind !== 'unresolved') return patternResult;
    return { kind: 'unresolved' };
  }

  private tryPattern(label: string): ResolverResult {
    const { personalInfo, preferences } = this.resumeData;

    if (/linkedin/.test(label)) {
      return personalInfo.linkedin
        ? { kind: 'value', value: personalInfo.linkedin }
        : { kind: 'unresolved' };
    }
    if (/github/.test(label)) {
      return personalInfo.github
        ? { kind: 'value', value: personalInfo.github }
        : { kind: 'unresolved' };
    }
    if (/website|portfolio/.test(label)) {
      return personalInfo.portfolio
        ? { kind: 'value', value: personalInfo.portfolio }
        : { kind: 'unresolved' };
    }
    if (/cover letter/.test(label)) {
      return this.resumeData.coverLetterPath
        ? { kind: 'value', value: this.resumeData.coverLetterPath }
        : { kind: 'skip', reason: 'no-cover-letter-configured' };
    }
    if (/preferred (first )?name|name.*you go by/.test(label)) {
      return { kind: 'value', value: personalInfo.firstName };
    }
    if (/pronoun/.test(label)) {
      return { kind: 'unresolved' };
    }
    if (/sponsor|visa|immigration support/.test(label)) {
      return { kind: 'value', value: preferences.requiresVisaSponsorship ? 'Yes' : 'No' };
    }
    if (/legally authorized|authorized to work|work authorization|currently eligible to work|eligible to work legally/.test(label)) {
      return { kind: 'value', value: preferences.legallyAuthorizedToWork ? 'Yes' : 'No' };
    }
    if (/(currently )?located in|current location|where are you (currently )?(located|based)/.test(label)) {
      return { kind: 'value', value: personalInfo.location };
    }
    if (/onsite|in.office|hybrid|relocate|relocation|willing to (work )?(from|in)|open to being onsite/.test(label)) {
      const ok = preferences.willingToRelocate || preferences.remote !== 'no';
      return { kind: 'value', value: ok ? 'Yes' : 'No' };
    }
    if (/salary|compensation|target.*base|expected.*base|desired.*pay|annual base/.test(label)) {
      return preferences.desiredSalary
        ? { kind: 'value', value: preferences.desiredSalary }
        : { kind: 'unresolved' };
    }
    if (/how did you hear|referral source|hear about (this )?(job|role|position|us)/.test(label)) {
      return { kind: 'value', value: PREFERENCES.defaults.howDidYouHear };
    }
    if (/start date|when can you start|available to start/.test(label)) {
      return preferences.startDate
        ? { kind: 'value', value: preferences.startDate }
        : { kind: 'unresolved' };
    }
    if (/years.*experience/.test(label)) {
      const match = label.match(/^years of (.+?) (?:development )?experience$/);
      if (match && match[1]) {
        const key = normalizeTechKey(match[1].trim());
        const byTech = personalInfo.yearsOfExperienceByTech ?? {};
        for (const [k, v] of Object.entries(byTech)) {
          if (normalizeTechKey(k) === key) {
            return { kind: 'value', value: String(v) };
          }
        }
      }
      return { kind: 'unresolved' };
    }
    if (/interviewed.*(in the past|previously|with us)/.test(label)) {
      return { kind: 'value', value: 'No' };
    }
    if (/restrictive covenant|agreement.*former employer|non-compete/.test(label)) {
      return { kind: 'value', value: 'No' };
    }
    if (/privacy policy|terms.*conditions|acknowledge/.test(label)) {
      return { kind: 'value', value: 'Yes' };
    }
    if (/affirm.*statements.*accurate|certify.*information|all statements and information/.test(label)) {
      return { kind: 'value', value: 'true' };
    }
    if (/itar/.test(label)) {
      return { kind: 'value', value: 'U.S. Citizen' };
    }
    if (/^school$|university|college|institution/.test(label)) {
      return personalInfo.education?.school
        ? { kind: 'value', value: personalInfo.education.school }
        : { kind: 'unresolved' };
    }
    if (/^degree$/.test(label)) {
      return personalInfo.education?.degree
        ? { kind: 'value', value: personalInfo.education.degree }
        : { kind: 'value', value: "Bachelor's Degree" };
    }
    if (/discipline|major|field of study/.test(label)) {
      return personalInfo.education?.discipline
        ? { kind: 'value', value: personalInfo.education.discipline }
        : { kind: 'value', value: 'Computer Science' };
    }
    if (/location \(city\)/.test(label)) {
      return { kind: 'value', value: personalInfo.location };
    }

    return { kind: 'unresolved' };
  }

  private tryStatic(label: string, ctx: ResolverContext): ResolverResult {
    const { personalInfo, resumePath } = this.resumeData;

    if (label === 'first name') {
      return { kind: 'value', value: personalInfo.firstName };
    }
    if (label === 'last name') {
      return { kind: 'value', value: personalInfo.lastName };
    }
    if (label === 'email') {
      return { kind: 'value', value: personalInfo.email };
    }
    if (label === 'country') {
      return { kind: 'value', value: inferCountry(personalInfo.location) };
    }
    if (label === 'resume/cv' || label === 'resume') {
      return { kind: 'value', value: resumePath };
    }
    if (label === 'phone') {
      if (ctx.isPhone === 'first') {
        return { kind: 'skip', reason: 'duplicate-phone-quirk' };
      }
      if (ctx.isPhone === 'second' || ctx.isPhone === 'only') {
        return { kind: 'value', value: personalInfo.phone };
      }
      return { kind: 'unresolved' };
    }

    return { kind: 'unresolved' };
  }
}
