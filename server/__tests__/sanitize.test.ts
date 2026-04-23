import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeRichContent } from "../sanitize";

describe("sanitizeText", () => {
  it("strips all HTML tags", () => {
    expect(sanitizeText("<b>bold</b> and <i>italic</i>")).toBe("bold and italic");
  });

  it("strips script tags and their content", () => {
    expect(sanitizeText('<script>alert("xss")</script>hello')).toBe("hello");
  });

  it("handles empty string", () => {
    expect(sanitizeText("")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(sanitizeText("just plain text")).toBe("just plain text");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });
});

describe("sanitizeRichContent", () => {
  it("allows safe tags like <b>, <i>, <p>", () => {
    const input = "<p>Hello <b>world</b></p>";
    expect(sanitizeRichContent(input)).toBe(input);
  });

  it("allows img tags with safe attributes", () => {
    const input = '<img src="https://example.com/img.png" alt="card" />';
    const result = sanitizeRichContent(input);
    expect(result).toContain("<img");
    expect(result).toContain('src="https://example.com/img.png"');
    expect(result).toContain('alt="card"');
  });

  it("allows h1 and h2 tags", () => {
    expect(sanitizeRichContent("<h1>Title</h1>")).toBe("<h1>Title</h1>");
    expect(sanitizeRichContent("<h2>Subtitle</h2>")).toBe("<h2>Subtitle</h2>");
  });

  it("strips script tags", () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    expect(sanitizeRichContent(input)).toBe("<p>Safe</p>");
  });

  it("strips event handler attributes", () => {
    const result = sanitizeRichContent('<p onclick="alert(1)">click me</p>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("click me");
  });
});
