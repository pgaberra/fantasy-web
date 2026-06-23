// @ts-check
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  {
    ignores: ['src/app/api/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked, ...angular.configs.tsRecommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // require-await is a stylistic rule, not a defect detector, and false-positives
      // on Promise-contract callbacks (e.g. @angular/forms/signals submit actions).
      '@typescript-eslint/require-await': 'off',
      // no-unsafe-enum-comparison false-positives on the idiomatic comparison of
      // HttpErrorResponse.status (number) against the HttpStatusCode enum, which is safe.
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    },
  },
  {
    ...sonarjs.configs.recommended,
    files: ['**/*.ts'],
    rules: {
      ...sonarjs.configs.recommended.rules,
      // Test-assertion style nit that fires across every spec — not a simplification.
      'sonarjs/prefer-specific-assertions': 'off',
      // FP: environment.prod.ts holds an http placeholder the Docker build replaces with
      // the real https URL at build time.
      'sonarjs/no-clear-text-protocols': 'off',
      // FP: an Angular CanActivateFn legitimately returns boolean | UrlTree.
      'sonarjs/function-return-type': 'off',
      // Subjective complexity threshold; refactoring is beyond a simplification scan.
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Angular's TestBed types fixture.nativeElement / inject() mocks as `any`,
      // so the type-unsafe-flow rules fire on idiomatic test code. Explicit `any`
      // stays banned via no-explicit-any (inherited).
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended],
    rules: {},
  },
);
