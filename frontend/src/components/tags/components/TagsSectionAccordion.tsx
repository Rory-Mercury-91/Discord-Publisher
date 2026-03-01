interface TagsSectionAccordionProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function TagsSectionAccordion({
  id,
  title,
  open,
  onToggle,
  children,
}: TagsSectionAccordionProps) {
  return (
    <div className={`tags-modal-section ${open ? 'tags-modal-section--open' : ''}`}>
      <div className="tags-modal-section__head" onClick={onToggle}>
        <span className="tags-modal-section__title">{title}</span>
        <span className={`tags-modal-section__chevron ${open ? 'tags-modal-section__chevron--open' : ''}`}>›</span>
      </div>
      {open && (
        <div id={id} className="tags-modal-section__body styled-scrollbar">
          {children}
        </div>
      )}
    </div>
  );
}
