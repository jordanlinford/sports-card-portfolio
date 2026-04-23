import sanitizeHtml from "sanitize-html";

/**
 * Strip all HTML tags from user input (comments, names, messages).
 * Returns plain text only.
 */
export function sanitizeText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
}

/**
 * Allow safe HTML subset for blog posts and rich content.
 * Strips scripts, event handlers, and dangerous tags.
 */
export function sanitizeRichContent(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https"],
  });
}
