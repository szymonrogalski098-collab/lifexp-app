// Markdown as HTML (docs/v2/PLAN.md 7.5): the only place in v2 that inserts HTML.
// marked turns the text into HTML and DOMPurify removes anything executable
// before it reaches the page — the same pair as v1, bundled instead of from a CDN
// and loaded on first use. Until they arrive (or if they cannot load offline)
// the text is shown as plain text, never as unsanitised HTML.
import { useEffect, useState } from 'preact/hooks';
import './Markdown.css';

type Render = (markdown: string) => string;

let renderer: Promise<Render> | null = null;

function loadRenderer(): Promise<Render> {
  renderer ??= Promise.all([import('marked'), import('dompurify')])
    .then(([{ marked }, { default: DOMPurify }]) => {
      // Links leave the app in a new tab and pass no opener.
      DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
      // v1 renders with breaks: true (a single newline is a line break).
      return (markdown: string) => DOMPurify.sanitize(marked.parse(markdown, { breaks: true, async: false }));
    })
    .catch((error: unknown) => {
      renderer = null; // try again next time
      throw error;
    });
  return renderer;
}

export function Markdown({ text }: { text: string }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    loadRenderer()
      .then((render) => current && setHtml(render(text)))
      .catch(() => current && setHtml(null));
    return () => {
      current = false;
    };
  }, [text]);

  if (html === null) return <div class="ui-markdown ui-markdown--plain user-text">{text}</div>;
  // eslint-disable-next-line no-restricted-syntax -- sanitised by DOMPurify above; the one allowed place (PLAN.md 7.7)
  return <div class="ui-markdown user-text" dangerouslySetInnerHTML={{ __html: html }} />;
}
