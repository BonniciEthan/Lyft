/** Floating translucent surface (dock, sheets, HUDs). Content cards use `.surface` instead. */
export function GlassSurface({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`glass ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
