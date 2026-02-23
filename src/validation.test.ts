import { describe, it, expect } from 'vitest';

/**
 * Validation helpers extracted for testing
 * These are copied from index.ts to enable isolated testing
 */
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateRequired(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {
    throw new ValidationError(`Missing required field: ${fieldName}`);
  }
}

function validateString(value: unknown, fieldName: string, required = true): void {
  if (required) {
    validateRequired(value, fieldName);
  }
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError(`Field '${fieldName}' must be a string, got ${typeof value}`);
  }
  if (required && typeof value === 'string' && value.trim().length === 0) {
    throw new ValidationError(`Field '${fieldName}' cannot be empty`);
  }
}

function validateNumber(value: unknown, fieldName: string, required = true): void {
  if (required) {
    validateRequired(value, fieldName);
  }
  if (value !== undefined && value !== null && typeof value !== 'number') {
    throw new ValidationError(`Field '${fieldName}' must be a number, got ${typeof value}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ValidationError(`Field '${fieldName}' must be a finite number`);
  }
  if (typeof value === 'number' && value < 0) {
    throw new ValidationError(`Field '${fieldName}' must be non-negative, got ${value}`);
  }
}

function validateInteger(value: unknown, fieldName: string, required = true): void {
  validateNumber(value, fieldName, required);
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new ValidationError(`Field '${fieldName}' must be an integer, got ${value}`);
  }
}

function validateHexColor(value: unknown, fieldName: string, required = true): void {
  if (!required && (value === undefined || value === null)) {
    return;
  }
  validateString(value, fieldName, required);
  if (typeof value === 'string') {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexPattern.test(value)) {
      throw new ValidationError(
        `Field '${fieldName}' must be a valid hex color (e.g., #3b82f6), got '${value}'`
      );
    }
  }
}

describe('Validation Helpers', () => {
  describe('validateRequired', () => {
    it('should pass for valid values', () => {
      expect(() => validateRequired('test', 'field')).not.toThrow();
      expect(() => validateRequired(0, 'field')).not.toThrow();
      expect(() => validateRequired(false, 'field')).not.toThrow();
      expect(() => validateRequired('', 'field')).not.toThrow();
    });

    it('should throw for null or undefined', () => {
      expect(() => validateRequired(null, 'field')).toThrow(ValidationError);
      expect(() => validateRequired(undefined, 'field')).toThrow(ValidationError);
      expect(() => validateRequired(null, 'field')).toThrow('Missing required field: field');
    });
  });

  describe('validateString', () => {
    it('should pass for valid strings', () => {
      expect(() => validateString('test', 'name')).not.toThrow();
      expect(() => validateString('hello world', 'name')).not.toThrow();
    });

    it('should throw for non-string types when required', () => {
      expect(() => validateString(123, 'name')).toThrow(ValidationError);
      expect(() => validateString(true, 'name')).toThrow('must be a string');
      expect(() => validateString({}, 'name')).toThrow('must be a string');
    });

    it('should throw for empty strings when required', () => {
      expect(() => validateString('', 'name')).toThrow(ValidationError);
      expect(() => validateString('   ', 'name')).toThrow('cannot be empty');
    });

    it('should allow empty strings when not required', () => {
      expect(() => validateString('', 'name', false)).not.toThrow();
      expect(() => validateString(undefined, 'name', false)).not.toThrow();
    });

    it('should throw for null/undefined when required', () => {
      expect(() => validateString(null, 'name')).toThrow('Missing required field');
      expect(() => validateString(undefined, 'name')).toThrow('Missing required field');
    });
  });

  describe('validateNumber', () => {
    it('should pass for valid numbers', () => {
      expect(() => validateNumber(0, 'position')).not.toThrow();
      expect(() => validateNumber(1, 'position')).not.toThrow();
      expect(() => validateNumber(100.5, 'position')).not.toThrow();
    });

    it('should throw for non-number types', () => {
      expect(() => validateNumber('123', 'position')).toThrow(ValidationError);
      expect(() => validateNumber('123', 'position')).toThrow('must be a number');
      expect(() => validateNumber(true, 'position')).toThrow('must be a number');
    });

    it('should throw for negative numbers', () => {
      expect(() => validateNumber(-1, 'position')).toThrow(ValidationError);
      expect(() => validateNumber(-1, 'position')).toThrow('must be non-negative');
    });

    it('should throw for non-finite numbers', () => {
      expect(() => validateNumber(Infinity, 'position')).toThrow(ValidationError);
      expect(() => validateNumber(NaN, 'position')).toThrow('must be a finite number');
    });

    it('should allow undefined when not required', () => {
      expect(() => validateNumber(undefined, 'position', false)).not.toThrow();
    });
  });

  describe('validateInteger', () => {
    it('should pass for valid integers', () => {
      expect(() => validateInteger(0, 'id')).not.toThrow();
      expect(() => validateInteger(1, 'id')).not.toThrow();
      expect(() => validateInteger(999, 'id')).not.toThrow();
    });

    it('should throw for decimal numbers', () => {
      expect(() => validateInteger(1.5, 'id')).toThrow(ValidationError);
      expect(() => validateInteger(1.5, 'id')).toThrow('must be an integer');
      expect(() => validateInteger(0.1, 'id')).toThrow('must be an integer');
    });

    it('should throw for negative integers', () => {
      expect(() => validateInteger(-1, 'id')).toThrow(ValidationError);
      expect(() => validateInteger(-1, 'id')).toThrow('must be non-negative');
    });

    it('should throw for non-numbers', () => {
      expect(() => validateInteger('1', 'id')).toThrow('must be a number');
    });
  });

  describe('validateHexColor', () => {
    it('should pass for valid hex colors', () => {
      expect(() => validateHexColor('#3b82f6', 'color')).not.toThrow();
      expect(() => validateHexColor('#ffffff', 'color')).not.toThrow();
      expect(() => validateHexColor('#000000', 'color')).not.toThrow();
      expect(() => validateHexColor('#ABCDEF', 'color')).not.toThrow();
    });

    it('should throw for invalid hex color formats', () => {
      expect(() => validateHexColor('3b82f6', 'color')).toThrow(ValidationError);
      expect(() => validateHexColor('#3b82f', 'color')).toThrow('must be a valid hex color');
      expect(() => validateHexColor('#3b82f6a', 'color')).toThrow('must be a valid hex color');
      expect(() => validateHexColor('blue', 'color')).toThrow('must be a valid hex color');
      expect(() => validateHexColor('#xyz123', 'color')).toThrow('must be a valid hex color');
    });

    it('should allow undefined when not required', () => {
      expect(() => validateHexColor(undefined, 'color', false)).not.toThrow();
      expect(() => validateHexColor(null, 'color', false)).not.toThrow();
    });

    it('should throw for non-strings', () => {
      expect(() => validateHexColor(123456, 'color')).toThrow('must be a string');
    });
  });
});
