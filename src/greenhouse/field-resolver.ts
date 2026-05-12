import type { ResumeData } from '../../config/resume-data';
import type { ResolverContext, ResolverResult } from './types';

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
