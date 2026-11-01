declare const process: { exit(code?: number): void };

import { parsePrInput } from './parsePr.ts';

interface TestCase {
  name: string;
  input: string;
  expected: { repo_url: string; pr_number: number } | null;
}

const testCases: TestCase[] = [
  // Accepted formats
  {
    name: '1. Standard HTTPS GitHub PR URL',
    input: 'https://github.com/facebook/react/pull/1234',
    expected: { repo_url: 'https://github.com/facebook/react', pr_number: 1234 },
  },
  {
    name: '2. PR URL with trailing path (/files)',
    input: 'https://github.com/facebook/react/pull/1234/files',
    expected: { repo_url: 'https://github.com/facebook/react', pr_number: 1234 },
  },
  {
    name: '3. PR URL with query string (?diff=split)',
    input: 'https://github.com/facebook/react/pull/1234?diff=split',
    expected: { repo_url: 'https://github.com/facebook/react', pr_number: 1234 },
  },
  {
    name: '4. PR URL with hash fragment (#discussion)',
    input: 'https://github.com/facebook/react/pull/1234#discussion_r12345',
    expected: { repo_url: 'https://github.com/facebook/react', pr_number: 1234 },
  },
  {
    name: '5. HTTP protocol URL',
    input: 'http://github.com/owner/repo/pull/42',
    expected: { repo_url: 'https://github.com/owner/repo', pr_number: 42 },
  },
  {
    name: '6. www.github.com URL',
    input: 'www.github.com/owner/repo/pull/99',
    expected: { repo_url: 'https://github.com/owner/repo', pr_number: 99 },
  },
  {
    name: '7. Markdown formatted link [text](url)',
    input: '[React PR 567](https://github.com/facebook/react/pull/567)',
    expected: { repo_url: 'https://github.com/facebook/react', pr_number: 567 },
  },
  {
    name: '8. Angle-bracket enclosed URL <url>',
    input: '<https://github.com/owner/repo/pull/88>',
    expected: { repo_url: 'https://github.com/owner/repo', pr_number: 88 },
  },
  {
    name: '9. Quoted URL',
    input: '"https://github.com/owner/repo/pull/77"',
    expected: { repo_url: 'https://github.com/owner/repo', pr_number: 77 },
  },
  {
    name: '10. Repo name ending with .git in URL',
    input: 'https://github.com/owner/repo.git/pull/10',
    expected: { repo_url: 'https://github.com/owner/repo', pr_number: 10 },
  },
  {
    name: '11. Shorthand owner/repo#12',
    input: 'codeshazard/MergeTest#1',
    expected: { repo_url: 'https://github.com/codeshazard/MergeTest', pr_number: 1 },
  },
  // Rejected formats
  {
    name: '12. Non-GitHub host (gitlab)',
    input: 'https://gitlab.com/owner/repo/pull/12',
    expected: null,
  },
  {
    name: '13. GitHub Issues URL',
    input: 'https://github.com/owner/repo/issues/12',
    expected: null,
  },
  {
    name: '14. Missing PR number',
    input: 'https://github.com/owner/repo/pull/',
    expected: null,
  },
  {
    name: '15. PR number is 0',
    input: 'https://github.com/owner/repo/pull/0',
    expected: null,
  },
  {
    name: '16. Negative PR number',
    input: 'https://github.com/owner/repo/pull/-5',
    expected: null,
  },
  {
    name: '17. Shorthand with PR number 0',
    input: 'owner/repo#0',
    expected: null,
  },
  {
    name: '18. Random plain text',
    input: 'just some random string',
    expected: null,
  },
];

let failed = 0;

console.log('Running parsePrInput test suite...\n');

for (const tc of testCases) {
  const result = parsePrInput(tc.input);
  const match = JSON.stringify(result) === JSON.stringify(tc.expected);

  if (match) {
    console.log(`PASS: ${tc.name}`);
  } else {
    failed++;
    console.error(`FAIL: ${tc.name}`);
    console.error(`  Input:    ${tc.input}`);
    console.error(`  Expected: ${JSON.stringify(tc.expected)}`);
    console.error(`  Received: ${JSON.stringify(result)}`);
  }
}

console.log(`\nResults: ${testCases.length - failed}/${testCases.length} tests passed.`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All parsePrInput tests passed successfully!');
}
