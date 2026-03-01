interface ListFormIframeProps {
  src: string;
}

export default function ListFormIframe({ src }: ListFormIframeProps) {
  return (
    <iframe
      className="list-form-iframe"
      title="Formulaire liste"
      src={src}
    />
  );
}
