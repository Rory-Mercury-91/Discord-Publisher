import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

interface DiscordMarkdownContentProps {
  processedPreview: string;
}

// Styles Discord pour le markdown (couleurs dédiées à l'aperçu)
const discordMarkdownComponents = {
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2
      style={{
        fontSize: '1.375rem',
        fontWeight: 700,
        margin: '14px 0 6px 0',
        color: '#ffffff',
        lineHeight: '1.375rem',
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3
      style={{
        fontSize: '1rem',
        fontWeight: 700,
        margin: '12px 0 4px 0',
        color: '#ffffff',
        lineHeight: '1.375rem',
      }}
    >
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ margin: 0, lineHeight: '1.375rem', marginBottom: '8px', fontSize: '1rem' }}>
      {children}
    </p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul
      style={{
        margin: '4px 0 8px 0',
        paddingLeft: '24px',
        color: '#dcddde',
        listStyleType: 'disc',
        listStylePosition: 'outside',
      }}
    >
      {children}
    </ul>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li
      style={{
        marginBottom: '4px',
        lineHeight: '1.375rem',
        display: 'list-item',
        paddingLeft: '4px',
      }}
    >
      {children}
    </li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong style={{ fontWeight: 700, color: '#ffffff' }}>{children}</strong>
  ),
  code: (props: { children?: React.ReactNode; className?: string }) => {
    const { children, className } = props;
    const isInline = !className || !className.startsWith('language-');
    if (isInline) {
      return (
        <code
          style={{
            background: '#2f3136',
            color: '#e3e4e6',
            padding: '2px 4px',
            borderRadius: 3,
            fontFamily: "'Consolas', 'Courier New', monospace",
            fontSize: '0.875em',
            border: '1px solid #202225',
            display: 'inline',
            whiteSpace: 'nowrap',
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          display: 'block',
          background: 'transparent',
          color: '#e3e4e6',
          padding: 0,
          fontFamily: "'Consolas', 'Courier New', monospace",
          fontSize: '0.875em',
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {children}
      </code>
    );
  },
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote
      style={{
        margin: '4px 0',
        paddingLeft: '16px',
        borderLeft: '4px solid #4f545c',
        color: '#dcddde',
      }}
    >
      {children}
    </blockquote>
  ),
  a: ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => (
    <a
      href={href}
      style={{ color: '#00aff4', textDecoration: 'none' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.textDecoration = 'underline';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.textDecoration = 'none';
      }}
    >
      {children}
    </a>
  ),
};

export default function DiscordMarkdownContent({ processedPreview }: DiscordMarkdownContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;

    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent && /\[[A-Za-z_][A-Za-z0-9_]*\]/.test(node.textContent)) {
        textNodes.push(node as Text);
      }
    }

    textNodes.forEach((textNode) => {
      const parent = textNode.parentElement;
      if (!parent) return;

      const text = textNode.textContent || '';
      const parts = text.split(/(\[[A-Za-z_][A-Za-z0-9_]*\])/g);

      if (parts.length === 1) return;

      const fragment = document.createDocumentFragment();
      parts.forEach((part) => {
        if (part.match(/^\[[A-Za-z_][A-Za-z0-9_]*\]$/)) {
          const span = document.createElement('span');
          span.style.color = 'rgba(255,255,255,0.2)';
          span.style.fontStyle = 'italic';
          span.textContent = part;
          fragment.appendChild(span);
        } else if (part) {
          fragment.appendChild(document.createTextNode(part));
        }
      });

      parent.replaceChild(fragment, textNode);
    });
  }, [processedPreview]);

  return (
    <div
      ref={contentRef}
      style={{
        fontSize: 16,
        lineHeight: '1.375rem',
        color: '#dcddde',
        wordWrap: 'break-word',
        fontFamily: "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontFeatureSettings: '"liga" 1, "kern" 1',
      }}
      className="discord-markdown-content"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={discordMarkdownComponents}
      >
        {processedPreview}
      </ReactMarkdown>
    </div>
  );
}
