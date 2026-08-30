"use client";

import ReactMarkdown from "react-markdown";

interface Citation {
  mark: string;
  source: string;
  excerpt: string;
}

interface TutorMarkdownProps {
  text: string;
  citations?: Citation[];
  messageId: string;
  expandedCitations: Set<string>;
  onToggleCitation: (key: string) => void;
  citeChipClassName: string;
  citeChipOpenClassName: string;
}

/**
 * Renders tutor-message text as markdown (Gemini's prose formats come back
 * with headers/bold/lists), while still turning [1]/[2] citation markers
 * into the same clickable chips the plain-text renderer used to produce.
 * Achieved by converting "[1]" into a markdown link to a fake "#cite-1"
 * anchor, then intercepting that anchor in a custom `a` renderer instead of
 * trying to walk react-markdown's parsed children for plain-text citation
 * substitution.
 */
export default function TutorMarkdown({
  text,
  citations,
  messageId,
  expandedCitations,
  onToggleCitation,
  citeChipClassName,
  citeChipOpenClassName,
}: TutorMarkdownProps) {
  const withCiteLinks = citations?.length
    ? text.replace(/\[(\d+)\]/g, (match, num) =>
        citations.some((c) => c.mark === `[${num}]`) ? `[${match}](#cite-${num})` : match
      )
    : text;

  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => {
          const citeMatch = href?.match(/^#cite-(\d+)$/);
          const mark = citeMatch ? `[${citeMatch[1]}]` : null;
          const citation = mark ? citations?.find((c) => c.mark === mark) : undefined;
          if (mark && citation) {
            const key = `${messageId}:${mark}`;
            const isOpen = expandedCitations.has(key);
            return (
              <button
                type="button"
                className={`${citeChipClassName} ${isOpen ? citeChipOpenClassName : ""}`}
                onClick={() => onToggleCitation(key)}
                aria-expanded={isOpen}
                aria-label={`Citation ${citeMatch![1]}`}
              >
                {citeMatch![1]}
              </button>
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {withCiteLinks}
    </ReactMarkdown>
  );
}