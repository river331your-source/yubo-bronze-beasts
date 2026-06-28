const ASPECT_RATIO = 16 / 9;

export function getViewportEl() {
  return document.getElementById('viewport-16-9');
}

export function getViewportRect() {
  const el = getViewportEl();
  return el ? el.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
}

export function getViewportSize() {
  const rect = getViewportRect();
  return { width: rect.width, height: rect.height };
}

export function normalizedToNDC(x, y) {
  return {
    x: x * 2 - 1,
    y: -(y * 2 - 1),
  };
}

export { ASPECT_RATIO };
