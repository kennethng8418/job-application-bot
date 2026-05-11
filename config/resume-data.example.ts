export interface ResumeData {
  personalInfo: {
    firstName: string;
    lastName: string;
    legalName?: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    university?: string; // e.g., "Georgia Institute of Technology"
    yearsOfExperience?: number; // e.g., 5
    gender?: 'Male' | 'Female' | 'Decline to self-identify'; // EEOC demographic (optional)
    race?: 'Hispanic or Latino' | 'White (Not Hispanic or Latino)' | 'Black or African American (Not Hispanic or Latino)' | 'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)' | 'Asian (Not Hispanic or Latino)' | 'American Indian or Alaska Native (Not Hispanic or Latino)' | 'Two or More Races (Not Hispanic or Latino)' | 'Decline to self-identify'; // EEOC demographic (optional)
    veteranStatus?: 'I identify as one or more of the classifications of protected veteran listed above' | 'I am not a protected veteran' | 'I decline to self-identify for protected veteran status'; // EEOC demographic (optional)
  };
  resumePath: string;
  coverLetterPath?: string;
  preferences: {
    sponsorship: 'yes' | 'no';
    remote: 'yes' | 'no' | 'hybrid';
    startDate?: string; // e.g., "Immediate", "2 weeks", "1 month"
    workLocation?: string; // For "Where do you plan on working from" questions
    desiredSalary?: string; // e.g., "$120,000", "$100k-$150k", "Negotiable"
    usCitizen?: boolean; // Are you a US citizen?
    requiresVisaSponsorship?: boolean; // Do you require visa sponsorship?
    over18?: boolean; // Are you at least 18 years of age?
    legallyAuthorizedToWork?: boolean; // Are you legally authorized to work?
  };
  aiConfig?: {
    enabled: boolean;
    apiKey?: string; // Optional: Set ANTHROPIC_API_KEY env variable instead
    background?: string; // Your background/story for personalized answers
    maxTokens?: number; // Default: 500
  };
}

// Copy this file to resume-data.ts and update with your actual information
export const resumeData: ResumeData = {
  personalInfo: {
    firstName: 'John',
    lastName: 'Doe',
    legalName: 'John Doe', // Optional: Full legal name (e.g., "John Michael Doe")
    email: 'john.doe@example.com',
    phone: '+1-555-123-4567',
    location: 'San Francisco, CA',
    linkedin: 'https://linkedin.com/in/johndoe',
    github: 'https://github.com/johndoe',
    portfolio: 'https://johndoe.com',
    university: 'Georgia Institute of Technology', // Your university
    yearsOfExperience: 5, // Years of relevant experience
  },
  resumePath: './resumes/resume.pdf',
  coverLetterPath: './resumes/cover-letter.pdf', // Optional
  preferences: {
    sponsorship: 'no',
    remote: 'yes',
    startDate: 'Immediate', // e.g., "Immediate", "2 weeks", "1 month"
    workLocation: 'San Francisco, CA', // For payroll tax purposes
    desiredSalary: '$150,000', // e.g., "$120,000", "$100k-$150k", "Negotiable"
    usCitizen: true, // US citizen
    requiresVisaSponsorship: false, // Don't require visa sponsorship
    over18: true, // At least 18 years old
    legallyAuthorizedToWork: true, // Legally authorized to work in US
  },
  aiConfig: {
    enabled: true,
    // apiKey: 'your-api-key', // Optional: Or set ANTHROPIC_API_KEY env variable
    background: `I'm a software engineer with experience in full-stack development.
    I got into programming during college when I built my first web application.
    I'm passionate about building scalable systems and learning new technologies.
    I have experience with JavaScript/TypeScript, React, Node.js, and cloud platforms.`,
    maxTokens: 500,
  },
};
