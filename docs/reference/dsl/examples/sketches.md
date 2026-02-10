# Sketch Examples

The sketch examples below are rendered via `npm run docs:examples` and use
transparent backgrounds with light strokes for dark docs themes.

## Line

![Line sketch](/examples/sketch/line.svg)

```ts
sketchLine("line-1", [-40, -20], [40, 20]);
```

## Arc

![Arc sketch](/examples/sketch/arc.svg)

```ts
sketchArc("arc-1", [30, 0], [0, 30], [0, 0], "ccw");
```

## Circle

![Circle sketch](/examples/sketch/circle.svg)

```ts
sketchCircle("circle-1", [0, 0], 22);
```

## Ellipse

![Ellipse sketch](/examples/sketch/ellipse.svg)

```ts
sketchEllipse("ellipse-1", [0, 0], 26, 12, { rotation: exprLiteral(20, "deg") });
```

## Rectangle (Center)

![Center rectangle sketch](/examples/sketch/rect-center.svg)

```ts
sketchRectCenter("rect-center", [0, 0], 60, 32, { rotation: exprLiteral(10, "deg") });
```

## Rectangle (Corner)

![Corner rectangle sketch](/examples/sketch/rect-corner.svg)

```ts
sketchRectCorner("rect-corner", [-25, -12], 60, 30, { rotation: exprLiteral(-8, "deg") });
```

## Slot

![Slot sketch](/examples/sketch/slot.svg)

```ts
sketchSlot("slot-1", [0, 0], 70, 16, { rotation: exprLiteral(12, "deg") });
```

## Polygon

![Polygon sketch](/examples/sketch/polygon.svg)

```ts
sketchPolygon("poly-1", [0, 0], 24, 6);
```

## Spline

![Spline sketch](/examples/sketch/spline.svg)

```ts
sketchSpline("spline-1", [
  [-30, -10],
  [-10, 20],
  [10, 10],
  [30, -15],
]);
```
