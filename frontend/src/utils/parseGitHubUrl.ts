/**
 * Parse GitHub URL to extract owner and repo name
 * Supports multiple formats:
 * - https://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Remove whitespace
  url = url.trim();
  
  // Handle different URL formats:
  // https://github.com/owner/repo
  // github.com/owner/repo
  // owner/repo
  const patterns = [
    /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\/|$|\.git$)/,
    /^github\.com\/([^/]+)\/([^/]+?)(?:\/|$|\.git$)/,
    /^([^/]+)\/([^/]+?)$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  }
  
  return null;
}


