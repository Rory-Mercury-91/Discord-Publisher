import type { MarkdownExampleSection } from '../constants';

interface MarkdownHelpSectionProps {
  section: MarkdownExampleSection;
}

export default function MarkdownHelpSection({ section }: MarkdownHelpSectionProps) {
  return (
    <div>
      <h4 className="md-help-section__title">{section.category}</h4>
      <div className="md-help-section__items">
        {section.items.map((item, itemIdx) => (
          <div key={itemIdx} className="md-help-item">
            <div>
              <div className="md-help-item__label">Syntaxe</div>
              <code className="md-help-item__syntax">{item.syntax}</code>
            </div>
            <div>
              <div className="md-help-item__label">Description</div>
              <div className="md-help-item__desc">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
