export default function PageHeader({ eyebrow, title, body, actions }) {
  return (
    <div className="page-header">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-header-title">{title}</h1>
        {body && <p className="page-header-body">{body}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
