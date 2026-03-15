export type ConfigValidationError = {
  path: string;
  code: string;
  message: string;
};

export type ValidationReport = {
  isValid: boolean;
  errors: ConfigValidationError[];
};
