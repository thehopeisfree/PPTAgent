/** A rectangle in slide-local coordinates */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** DOM extraction result for a single element */
export interface DOMElement {
  eid: string;
  bbox: Rect;
  safeBox: Rect;
  contentBox: Rect | null;
  zIndex: number;
  computed: {
    fontSize: number;
    lineHeight: number;
  };
}

/** Full DOM extraction result for a slide */
export interface DOMDocument {
  slide: { w: number; h: number };
  safe_padding: number;
  elements: DOMElement[];
}
