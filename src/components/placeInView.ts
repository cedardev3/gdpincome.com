const MARGIN = 12;

/** Pin a panel to the viewport so it stays fully on screen. */
export function placeInView(
  panel: HTMLElement,
  anchor: HTMLElement,
  options: { placement: "below" | "inside-top"; maxWidth: number },
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(options.maxWidth, vw - MARGIN * 2);
  const maxHeight = vh - MARGIN * 2;

  panel.style.position = "fixed";
  panel.style.boxSizing = "border-box";
  panel.style.width = "max-content";
  panel.style.maxWidth = `${width}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  panel.style.zIndex = "50";

  const usedWidth = panel.offsetWidth;
  const height = Math.min(panel.scrollHeight, maxHeight);
  const anchorBox = anchor.getBoundingClientRect();

  let left = anchorBox.left + (anchorBox.width - usedWidth) / 2;
  left = Math.max(MARGIN, Math.min(left, vw - MARGIN - usedWidth));

  const preferred =
    options.placement === "inside-top" ? anchorBox.top + 8 : anchorBox.bottom + 8;
  let top = preferred;
  if (top + height > vh - MARGIN) {
    const above = anchorBox.top - 8 - height;
    top = above >= MARGIN ? above : Math.max(MARGIN, vh - MARGIN - height);
  }
  if (top < MARGIN) top = MARGIN;

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}
