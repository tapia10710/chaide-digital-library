type Point = { x: number; y: number };

export function getTwoFingerMovement(start: [Point, Point], current: [Point, Point]) {
  const separation = (points: [Point, Point]) =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  const initialDistance = separation(start);
  const currentDistance = separation(current);
  const firstY = current[0].y - start[0].y;
  const secondY = current[1].y - start[1].y;
  const vertical = (firstY + secondY) / 2;
  const horizontal = (current[0].x - start[0].x + current[1].x - start[1].x) / 2;
  const spread = Math.abs(currentDistance - initialDistance);

  // Both fingers must travel together. Pointer events arrive one at a time,
  // so allow some distance change before deciding this is a pinch.
  const isScroll = firstY * secondY > 0 && Math.min(Math.abs(firstY), Math.abs(secondY)) >= 10 &&
    Math.abs(vertical) > Math.abs(horizontal) * 1.3 && spread < Math.abs(vertical) * 0.6;
  const isPinch = spread >= Math.max(12, initialDistance * 0.09) &&
    (Math.abs(vertical) <= Math.abs(horizontal) || firstY * secondY < 0 ||
      Math.min(Math.abs(firstY), Math.abs(secondY)) >= 10 || spread >= 32) &&
    spread > Math.abs(vertical) * 0.85;
  return {
    vertical,
    scale: initialDistance > 0 ? currentDistance / initialDistance : 1,
    mode: isScroll ? 'scroll' as const : isPinch ? 'pinch' as const : null,
  };
}
