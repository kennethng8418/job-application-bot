export interface AnswerPreferences {
  tone: 'strongest-plausible' | 'honest' | 'modest';
  defaults: {
    howDidYouHear: string;
    other: string;
  };
}

export const PREFERENCES: AnswerPreferences = {
  tone: 'strongest-plausible',
  defaults: {
    howDidYouHear: 'LinkedIn',
    other: 'Other',
  },
};
