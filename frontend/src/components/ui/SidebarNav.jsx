import cn from "@/lib/cn.js";

export default function SidebarNav({
  sections = [],
  activeId = "",
  onSelect = () => {},
  collapsed = false,
  className = ""
}) {
  return (
    <div className={cn("sidebar-nav-shell", collapsed && "is-collapsed", className)}>
      <div className="sidebar-nav-inner">
        {sections.map((section) => (
          <section key={section.id} className="sidebar-nav-section">
            <div className="sidebar-nav-heading">
              <h3>{section.label}</h3>
            </div>
            <div className="sidebar-nav-list">
              {section.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn("sidebar-nav-item", active && "is-active")}
                  >
                    {item.icon ? <i className={cn("bi sidebar-nav-icon", item.icon)} aria-hidden="true"></i> : null}
                    <span className="sidebar-nav-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
