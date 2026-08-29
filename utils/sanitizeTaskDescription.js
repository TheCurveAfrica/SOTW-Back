const sanitizeHtml = require("sanitize-html");

// Tags the rich-text editor can produce. Anything else is stripped.
const ALLOWED_TAGS = [
    "p", "br",
    "strong", "em", "u", "s",
    "code", "pre",
    "h1", "h2", "h3", "h4",
    "ul", "ol", "li",
    "blockquote", "hr",
    "a"
];

const SANITIZE_OPTIONS = {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
        a: ["href", "target", "rel"]
    },
    allowedSchemes: ["http", "https", "mailto"],
    // Drop script/style along with their text content, so "<script>alert(1)</script>"
    // does not leave "alert(1)" behind as visible text.
    nonTextTags: ["script", "style", "textarea", "noscript"],
    transformTags: {
        a: sanitizeHtml.simpleTransform("a", {
            target: "_blank",
            rel: "noopener noreferrer nofollow"
        })
    }
};

// Strip every tag and decode the entities sanitize-html emits, so callers can check
// whether a description carries any real text.
const htmlToPlainText = (html) => {
    if (!html) return "";

    return String(html)
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
};

const sanitizeTaskDescription = (html) => sanitizeHtml(String(html ?? ""), SANITIZE_OPTIONS);

module.exports = {
    sanitizeTaskDescription,
    htmlToPlainText,
    ALLOWED_TAGS
};
