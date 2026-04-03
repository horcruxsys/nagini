/**
 * Converts Atlassian Document Format (ADF) or HTML to plain markdown.
 * This is a pragmatic best-effort converter — not a full ADF parser.
 */
export function htmlToMarkdown(html: string): string {
  let md = html;

  // Replace common block elements
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br\s*\/?>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<ul[^>]*>|<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>|<\/ol>/gi, "\n");

  // Inline formatting
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(
    /<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi,
    "[$2]($1)",
  );

  // Code blocks
  md = md.replace(
    /<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi,
    "```\n$1\n```\n\n",
  );

  // Strip remaining tags
  md = md.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  md = md
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse excessive newlines
  md = md.replace(/\n{3,}/g, "\n\n").trim();

  return md;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
