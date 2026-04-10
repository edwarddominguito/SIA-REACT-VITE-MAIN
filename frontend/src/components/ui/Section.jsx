import { forwardRef } from "react";
import cn from "@/lib/cn.js";

const Section = forwardRef(function Section(
  {
    as: Component = "section",
    className = "",
    containerClassName = "",
    noContainer = false,
    children,
    ...props
  },
  ref
) {
  return (
    <Component ref={ref} {...props} className={cn("ui-section", className)}>
      {noContainer ? children : <div className={cn("container", containerClassName)}>{children}</div>}
    </Component>
  );
});

export default Section;
