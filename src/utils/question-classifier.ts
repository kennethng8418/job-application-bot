export type QuestionCategory = 'howDidYouHear' | 'other' | 'generic';

const HOW_DID_YOU_HEAR_PATTERNS = [
  /how did you hear/i,
  /where did you hear/i,
  /how did you find/i,
  /where did you find/i,
  /how did you learn about/i,
  /how did you come across/i,
];

const OTHER_PATTERNS = [
  /which best applies to you/i,
  /which (of (these|the following) )?best describes/i,
];

export function classifyQuestion(question: string): QuestionCategory {
  if (HOW_DID_YOU_HEAR_PATTERNS.some(p => p.test(question))) {
    return 'howDidYouHear';
  }
  if (OTHER_PATTERNS.some(p => p.test(question))) {
    return 'other';
  }
  return 'generic';
}
