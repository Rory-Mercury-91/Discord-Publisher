interface ToolItem {
  label: string;
  onClick: () => void;
}

interface HeaderToolbarProps {
  tools: ToolItem[];
}

export default function HeaderToolbar({ tools }: HeaderToolbarProps) {
  return (
    <div className="app-header-toolbar">
      {tools.map(({ label, onClick }) => (
        <button key={label} type="button" className="app-header-tool-btn" onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
  );
}
