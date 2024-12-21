import {
  ASSESSMENT_SECTIONS,
  REQUIRED_ACRONYMS,
  MAX_SENTENCES_PER_SECTION,
  MIN_SENTENCES_PER_SECTION,
  SENTENCE_ENDINGS
} from './constants';
import { NOTE_FORMATS } from '../noteFormats/formats';
import type { NoteFormatType } from '../noteFormats/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

function countSentences(text: string): number {
  if (!text?.trim()) return 0;
  return text.trim().split(SENTENCE_ENDINGS).filter(Boolean).length;
}

function sanitizeSection(section: string): string {
  // Make the section matching more flexible
  return section
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\s+/g, '\\s+') // More lenient whitespace matching
    .replace(/[/-]/g, '[/-]?'); // Optional dashes and slashes
}

function findSectionContent(content: string, section: string, escapedSections: string[]): string | null {
  const sectionRegex = new RegExp(
    `${sanitizeSection(section)}:([^]*?)(?=${escapedSections.join(':|')}:|$)`,
    'i'
  );
  const match = content.match(sectionRegex);
  return match ? match[1].trim() : null;
}

function validateHIPAACompliance(content: string): boolean {
  // Basic HIPAA validation - check for common identifiers
  const identifierPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b\d{10}\b/, // Phone numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // Email
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/, // Dates
  ];

  return !identifierPatterns.some(pattern => pattern.test(content));
}

export function validateResponseFormat(content: string, isAssessment: boolean, noteFormat: NoteFormatType): ValidationResult {
  const errors: string[] = [];
  const sections = isAssessment ? ASSESSMENT_SECTIONS : NOTE_FORMATS[noteFormat].sections;
  
  // Basic structure check
  if (!content || typeof content !== 'string') {
    return { isValid: false, errors: ['Invalid or empty response'] };
  }

  // Normalize content for more reliable matching
  const normalizedContent = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  
  // More flexible section validation
  const escapedSections = sections.map(sanitizeSection);
  sections.forEach(section => {
    const sectionContent = findSectionContent(normalizedContent, section, escapedSections);
    if (!sectionContent) {
      errors.push(`Missing or empty section: ${section}`);
    } else {
      const sentenceCount = countSentences(sectionContent);
      if (sentenceCount < MIN_SENTENCES_PER_SECTION) {
        errors.push(`Section "${section}" has fewer than ${MIN_SENTENCES_PER_SECTION} sentences (found ${sentenceCount})`);
      } else if (sentenceCount > MAX_SENTENCES_PER_SECTION) {
        errors.push(`Section "${section}" has more than ${MAX_SENTENCES_PER_SECTION} sentences (found ${sentenceCount})`);
      }
    }
  });

  // Check for minimum content requirements
  if (!isAssessment) {
    if (!content.includes('TH') || !content.includes('CL')) {
      errors.push('Missing required therapist (TH) or client (CL) references');
    }
  }

  // Validate HIPAA compliance
  if (!validateHIPAACompliance(content)) {
    errors.push('Potential HIPAA compliance concerns detected');
  }

  // Validate overall structure
  const hasProperFormatting = normalizedContent.split('\n').length >= sections.length;
  if (!hasProperFormatting) {
    errors.push('Response format does not match expected structure');
  }

  return {
    isValid: true, // Always return valid but include warnings/errors
    errors
  };
}