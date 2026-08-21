import type { Layout, RegisteredGroup } from "../../components/group/types";
import { formatLayoutNumber } from "./formatLayoutNumber";

export function preserveFixedPanelSizes({
  group,
  nextGroupSize,
  prevGroupSize,
  prevLayout
}: {
  group: RegisteredGroup;
  nextGroupSize: number;
  prevGroupSize: number;
  prevLayout: Layout;
}) {
  if (
    prevGroupSize <= 0 ||
    nextGroupSize <= 0 ||
    prevGroupSize === nextGroupSize
  ) {
    return prevLayout;
  }

  let fixedPanelsTotalSize = 0;
  let flexiblePanelsTotalPrevSize = 0;
  let hasPreservePixelSizePanels = false;

  const fixedPanels = new Map<string, number>();
  const flexiblePanelIds: string[] = [];

  for (const panel of group.panels) {
    const prevPanelSize = prevLayout[panel.id] ?? 0;
    switch (panel.panelConstraints.groupResizeBehavior) {
      case "preserve-pixel-size": {
        hasPreservePixelSizePanels = true;

        const prevPanelSizeInPixels = (prevPanelSize / 100) * prevGroupSize;
        const nextPanelSize = formatLayoutNumber(
          (prevPanelSizeInPixels / nextGroupSize) * 100
        );

        fixedPanels.set(panel.id, nextPanelSize);
        fixedPanelsTotalSize += nextPanelSize;
        break;
      }
      case "preserve-relative-size":
      default: {
        flexiblePanelIds.push(panel.id);
        flexiblePanelsTotalPrevSize += prevPanelSize;
        break;
      }
    }
  }

  if (!hasPreservePixelSizePanels || flexiblePanelIds.length === 0) {
    return prevLayout;
  }

  const remainingSize = 100 - fixedPanelsTotalSize;
  const nextLayout = { ...prevLayout };

  fixedPanels.forEach((size, panelId) => {
    nextLayout[panelId] = size;
  });

  if (flexiblePanelsTotalPrevSize > 0) {
    for (const panelId of flexiblePanelIds) {
      const prevSize = prevLayout[panelId] ?? 0;
      nextLayout[panelId] = formatLayoutNumber(
        (prevSize / flexiblePanelsTotalPrevSize) * remainingSize
      );
    }
  } else {
    const evenSize = formatLayoutNumber(
      remainingSize / flexiblePanelIds.length
    );
    for (const panelId of flexiblePanelIds) {
      nextLayout[panelId] = evenSize;
    }
  }

  return nextLayout;
}
