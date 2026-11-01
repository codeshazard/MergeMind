export interface ParsedPr {
  repo_url: string;
  pr_number: number;
}

/**
 * Pure function parsing and normalizing user input into a GitHub PR repository URL and PR number.
 * Accepts full URLs (http, https, www), markdown links, bracketed/quoted URLs, trailing paths (/files),
 * query strings, hash fragments, and shorthand owner/repo#N.
 * Returns null for invalid hosts, non-PR paths (e.g. issues), negative or 0 PR numbers, and malformed inputs.
 */
export function parsePrInput(raw: string): ParsedPr | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  let text = raw.trim();
  if (!text) {
    return null;
  }

  // 1. Extract URL if enclosed in Markdown link format: [text](url)
  const markdownMatch = text.match(/^\[.*?\]\((https?:\/\/[^\s)]+|[^\s)]+)\)$/);
  if (markdownMatch) {
    text = markdownMatch[1].trim();
  }

  // 2. Strip surrounding angle brackets (<url>) or surrounding quotes ("url", 'url')
  text = text.replace(/^<(.+)>$/, '$1').trim();
  text = text.replace(/^["'](.+)["']$/, '$1').trim();

  // 3. Match shorthand format: owner/repo#12
  const shorthandMatch = text.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)#(\d+)$/);
  if (shorthandMatch) {
    const owner = shorthandMatch[1];
    const repo = shorthandMatch[2].replace(/\.git$/i, '');
    const prNumber = parseInt(shorthandMatch[3], 10);
    if (owner && repo && Number.isInteger(prNumber) && prNumber > 0) {
      return {
        repo_url: `https://github.com/${owner}/${repo}`,
        pr_number: prNumber,
      };
    }
    return null;
  }

  // 4. URL format normalization
  let urlStr = text;
  if (!/^https?:\/\//i.test(urlStr)) {
    if (/^(?:www\.)?github\.com\//i.test(urlStr)) {
      urlStr = 'https://' + urlStr;
    } else {
      return null;
    }
  }

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      return null;
    }

    // Split pathname into non-empty segments
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Needs at least [owner, repo, 'pull', pr_number]
    if (segments.length < 4) {
      return null;
    }

    const [owner, rawRepo, pullKeyword, prStr] = segments;

    // Must be a pull request, not issues/commits/etc.
    if (pullKeyword.toLowerCase() !== 'pull') {
      return null;
    }

    const prNumber = Number(prStr);
    if (!Number.isInteger(prNumber) || prNumber <= 0 || String(prNumber) !== prStr) {
      return null;
    }

    const repo = rawRepo.replace(/\.git$/i, '');
    if (!owner || !repo) {
      return null;
    }

    return {
      repo_url: `https://github.com/${owner}/${repo}`,
      pr_number: prNumber,
    };
  } catch {
    return null;
  }
}
