import * as React from "react";
import { useDragScroll } from "@/hooks/use-drag-scroll";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  axis?: "x" | "y" | "both";
};

/** Div-Wrapper mit Drag-/Wisch-Scroll auf leerer Fläche. */
export const DragScrollDiv = React.forwardRef<HTMLDivElement, Props>(
  ({ axis = "y", className, style, children, ...rest }, _ignored) => {
    const ref = useDragScroll<HTMLDivElement>(axis);
    return (
      <div
        ref={ref}
        className={`no-scrollbar ${className ?? ""}`}
        style={{ touchAction: axis === "y" ? "pan-y" : axis === "x" ? "pan-x" : "pan-x pan-y", ...style }}
        {...rest}
      >
        {children}
      </div>

    );
  }
);
DragScrollDiv.displayName = "DragScrollDiv";
