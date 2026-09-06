import type { PreferredDisplayHint } from "@shared/workspaceLayout";

export type DisplayDescriptor = {
  label?: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DisplayPlacement = Pick<DisplayDescriptor, "left" | "top" | "width" | "height">;

function toPlacement(display: DisplayDescriptor): DisplayPlacement {
  return {
    left: display.left,
    top: display.top,
    width: display.width,
    height: display.height,
  };
}

export function resolveDisplayPlacement(
  hint: PreferredDisplayHint | undefined,
  displays: readonly DisplayDescriptor[],
): DisplayPlacement | null {
  if (!hint || displays.length === 0) return null;

  if (hint.label) {
    const expected = hint.label.trim().toLocaleLowerCase();
    const byLabel = displays.find(display => display.label?.trim().toLocaleLowerCase() === expected);
    if (byLabel) return toPlacement(byLabel);
  }

  if (hint.ordinal !== undefined) {
    const byOrdinal = displays[hint.ordinal];
    if (byOrdinal) return toPlacement(byOrdinal);
  }

  return null;
}
