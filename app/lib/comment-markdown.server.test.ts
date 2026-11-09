import { describe, it, expect } from "vitest";
import { renderCommentMarkdown, safeUrl } from "./comment-markdown.server";

// Asserts the rendered HTML has no executable surface: no script/iframe/svg
// etc. elements, no event-handler attributes, no javascript:/data: URLs in
// any href/src.
function expectInert(html: string) {
  expect(html).not.toMatch(/<\s*(script|iframe|object|embed|svg|math|style|form|input|base|meta|link)\b/i);
  // Drop quoted attribute values first: text like `onerror=` inside an
  // escaped alt/title value is inert, only a real attribute name matters.
  const tagsOnly = html.replace(/"[^"]*"/g, '""');
  expect(tagsOnly).not.toMatch(/<[^>]*\son\w+\s*=/i);
  const urls = [...html.matchAll(/\s(?:href|src)="([^"]*)"/gi)].map((m) => m[1]);
  for (const url of urls) {
    expect(url).toMatch(/^(https?:|mailto:)/i);
  }
}

describe("renderCommentMarkdown", () => {
  describe("normal markdown", () => {
    it("renders basic formatting", async () => {
      const html = await renderCommentMarkdown("**bold** and `code`");
      expect(html).toContain("<strong>bold</strong>");
      expect(html).toContain("<code>code</code>");
    });

    it("highlights fenced code blocks", async () => {
      const html = await renderCommentMarkdown("```ts\nconst x = 1;\n```");
      expect(html).toContain("shiki");
    });

    it("escapes HTML inside code blocks", async () => {
      const html = await renderCommentMarkdown("```html\n<script>alert(1)</script>\n```");
      expectInert(html);
    });

    it("renders safe links with rel/target", async () => {
      const html = await renderCommentMarkdown("[docs](https://example.com/a?b=1&c=2)");
      expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"');
      expect(html).toContain('rel="nofollow noopener noreferrer"');
    });

    it("renders autolinks and mailto", async () => {
      const html = await renderCommentMarkdown("see https://example.com or <me@example.com>");
      expect(html).toContain('href="https://example.com/"');
      expect(html).toContain('href="mailto:me@example.com"');
    });

    it("renders safe images", async () => {
      const html = await renderCommentMarkdown("![alt](https://example.com/x.png)");
      expect(html).toContain('<img src="https://example.com/x.png" alt="alt"');
    });
  });

  describe("XSS payloads", () => {
    const payloads: Array<[string, string]> = [
      ["script tag", "<script>alert(1)</script>"],
      ["inline script tag", "hello <script>alert(1)</script> world"],
      ["img onerror", '<img src=x onerror="alert(1)">'],
      ["svg onload", "<svg onload=alert(1)>"],
      ["iframe", '<iframe src="javascript:alert(1)"></iframe>'],
      ["anchor with javascript href", '<a href="javascript:alert(1)">x</a>'],
      ["markdown javascript link", "[x](javascript:alert(1))"],
      ["uppercase scheme", "[x](JAVASCRIPT:alert(1))"],
      ["entity-encoded scheme", "[x](&#106;avascript:alert(1))"],
      ["hex entity-encoded colon", "[x](javascript&#x3A;alert(1))"],
      ["named entity colon", "[x](javascript&colon;alert(1))"],
      ["tab inside scheme", "[x](java\tscript:alert(1))"],
      ["leading whitespace", "[x]( javascript:alert(1))"],
      ["angle-bracket destination", "[x](<javascript:alert(1)>)"],
      ["data URL link", "[x](data:text/html,<script>alert(1)</script>)"],
      ["vbscript link", "[x](vbscript:msgbox(1))"],
      ["javascript image", "![x](javascript:alert(1))"],
      ["data URL image", "![x](data:image/svg+xml,<svg onload=alert(1)>)"],
      ["reference-style javascript link", "[x][1]\n\n[1]: javascript:alert(1)"],
      ["quote-breaking link title", '[x](https://example.com "a\\" onmouseover=\\"alert(1))'],
      ["quote-breaking image alt", '![a" onerror="alert(1)](https://example.com/x.png)'],
      ["quote-breaking url", '[x](https://example.com/"onmouseover="alert(1))'],
      ["raw HTML in list", "- item\n- <img src=x onerror=alert(1)>"],
      ["raw HTML in blockquote", "> <script>alert(1)</script>"],
      ["raw HTML block", '<div onclick="alert(1)">\n\nhi\n\n</div>'],
      ["html comment", "<!-- <script>alert(1)</script> -->"],
      ["style tag", "<style>body{display:none}</style>"],
      ["details ontoggle", "<details open ontoggle=alert(1)>"],
      ["javascript autolink", "<javascript:alert(1)>"],
    ];

    it.each(payloads)("neutralises %s", async (_name, payload) => {
      const html = await renderCommentMarkdown(payload);
      expectInert(html);
    });

    it("shows raw HTML as visible text", async () => {
      const html = await renderCommentMarkdown("<script>alert(1)</script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("keeps the text of an unsafe link", async () => {
      const html = await renderCommentMarkdown("[click me](javascript:alert(1))");
      expect(html).toContain("click me");
      expect(html).not.toContain("<a");
    });
  });
});

describe("safeUrl", () => {
  it.each([
    ["https://example.com", "https://example.com/"],
    ["http://example.com/x", "http://example.com/x"],
    ["mailto:a@b.com", "mailto:a@b.com"],
  ])("allows %s", (input, expected) => {
    expect(safeUrl(input)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "/relative", "#hash", "ftp://x", ""])(
    "rejects %s",
    (input) => {
      expect(safeUrl(input)).toBeNull();
    }
  );
});
