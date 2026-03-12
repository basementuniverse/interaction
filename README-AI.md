# @basementuniverse/interaction — AI Technical Guide

Compact reference for implementing pointer/keyboard interactions on canvas-like UIs.

## 1) What this library provides

- Frame-based interaction engine: `InteractionSystem`
- Per-entity interaction state: `InteractionState`
- Composable behavior model (`BehaviorType` + behavior objects)
- Built-in behaviors:
	- `Disableable`, `Hoverable`, `Focusable`, `Selectable`, `Clickable`
	- `Draggable`, `DropZone`, `Resizable`, `Rotatable`, `Slideable`, `Dialable`

The package is stateful but rendering-agnostic (you render separately).

---

## 2) Core usage pattern

1. Create `InteractionSystem`.
2. For each UI object, create an `InteractionState` and expose it as `interactionState` on your object (`Interactable`).
3. Add behaviors either:
	 - directly via `interactionState.addBehavior(...)`, or
	 - at registration time via `system.register(interactable, ...behaviors)`.
4. Call `system.update(dt, input)` once per frame.
5. Render using behavior states/callback side effects.

Minimal shape:

```ts
import { InteractionSystem, InteractionState, BehaviorType, createBehavior } from '@basementuniverse/interaction';
import { vec2 } from '@basementuniverse/vec';

const system = new InteractionSystem();

const button = {
	interactionState: new InteractionState('btn-1', vec2(100, 80), vec2(160, 44)),
};

system.register(
	button,
	createBehavior(BehaviorType.Hoverable, {
		onEnter: () => {},
		onLeave: () => {},
	})!,
	createBehavior(BehaviorType.Clickable, {
		onPress: () => {},
		onRelease: () => {},
		onClick: () => {},
		onLongPress: () => {},
		onDoubleClick: () => {},
	})!
);

// game loop
system.update(dt, inputProvider);
```

---

## 3) Input contract (`system.update(dt, input)`)

`input` must provide:

```ts
{
	keyDown(code?: string): boolean;
	keyPressed(code?: string): boolean;
	keyReleased(code?: string): boolean;
	mouseDown(button?: number): boolean;
	mousePressed(button?: number): boolean;
	mouseReleased(button?: number): boolean;
	mouseWheelUp(): boolean;
	mouseWheelDown(): boolean;
	mousePosition: vec2;
}
```

Important: behavior logic depends on edge-triggered methods (`keyPressed`, `mousePressed`, `mouseReleased`) being correct per frame.

---

## 4) Geometry and targeting

- Each `InteractionState` has:
	- `id: string`
	- `position: vec2`
	- `size: vec2`
	- `anchor: Anchor` (default `'top-left'`)
	- optional custom `hitTest(point)`
- Default hit test is axis-aligned box from `position/size/anchor`.
- Pointer targets each frame are sorted by:
	1. higher `zIndex` first,
	2. earlier registration first.
- `consumePointerEvents` (default `true`) stops hit-testing lower layers.
- `receivePointerEvents` (default `true`) opt-out from pointer targeting.

Resizable special case: resize handles are targetable even when pointer is outside the element's base hit box.

---

## 5) InteractionSystem API

### Constructor options

```ts
new InteractionSystem({
	keyBindings?: Partial<KeyBindings>,
	thresholds?: {
		doubleClick?: number, // default 0.3 sec
		longPress?: number,   // default 0.6 sec
		dragSelect?: number,  // default 4 px
	}
})
```

Defaults for `keyBindings`:

```ts
{
	focusNext: ['Tab'],
	focusPrevious: ['Shift+Tab'],
	focusLeft: ['ArrowLeft'],
	focusRight: ['ArrowRight'],
	focusUp: ['ArrowUp'],
	focusDown: ['ArrowDown'],
	activate: ['Enter', 'Space'],
	cancel: ['Escape'],
}
```

Key aliases are supported (`Ctrl`/`Control`, `Shift`, `Alt`/`Option`, `Meta`/`Cmd`/`Command`, with left/right variants).

### Public members/methods

- `interactables: Interactable[]`
- `dragSelectEnabled: boolean` (default `false`)
- `register(interactable, ...behaviors)`
- `unregister(id | interactable)`
- `update(dt, input)`
- `setKeyBindings(partial)`
- `setThresholds(partial)`
- `doubleClickThreshold`, `longPressThreshold`, `dragSelectThreshold`
- `selectionBox?: { topLeft, size }` (only when drag distance >= threshold)
- drag/drop helpers (public but usually internal flow):
	- `startDrag`, `endDrag`, `dragState`
	- `bringToFront(interactable)`
	- `detachInteractableFromDropZones`, `reattachInteractableToDropZones`
	- `addInteractableToDropZone(...)`

---

## 6) Focus + selection behavior model

### Focus

- Focusable set = interactables with `Focusable` and not disabled.
- Mouse press on top focusable sets focus.
- Tab navigation sorts by:
	1. lower `tabIndex` first,
	2. higher `zIndex` first,
	3. earlier registration first.
- Arrow-key navigation picks nearest candidate in direction using center-point heuristics.

### Selection

- `Selectable` toggles on click-release over same top target.
- Keyboard activation (`activate` binding) toggles focused selectable.
- Multi-select is only active when `behavior.multiSelect === true`.
- Additive select requires configured modifier held (`multiSelectKey`, default `['Ctrl']`).
- Drag-select rectangle works only if:
	- `system.dragSelectEnabled = true`, and
	- press started on non-selectable target.
- Click on non-selectable background deselects all selected items (unless it became drag-select).

---

## 7) Behaviors (exact runtime semantics)

All behaviors have `{ type, state }` and callback fields. Disabled entities run only `Disableable`; all other behavior handlers are skipped.

### Disableable
- State: `'enabled' | 'disabled'`
- Fires `onDisable` / `onEnable` only when state changes.

### Hoverable
- State: `'idle' | 'hovered'`
- Uses pointer target list; fires `onEnter`/`onLeave` on transitions.

### Focusable
- State: `'idle' | 'focused'`
- Driven by system focus routing; fires `onFocus`/`onBlur` on transitions.

### Selectable
- State: `'idle' | 'selected'`
- Optional: `multiSelect`, `multiSelectKey`, `bringToFrontOnSelect`.
- Fires `onSelect`/`onDeselect` on state transitions.

### Clickable
- State: `'idle' | 'pressed'`
- Events:
	- press on mouse down over top target: `onPress`
	- release after press: `onRelease`
	- click if released over top target: `onClick`
	- long press once per hold after threshold: `onLongPress`
	- double click if consecutive click interval <= threshold: `onDoubleClick`

### Draggable
- State: `'idle' | 'dragging'`
- Start on mouse down over top target (if no other active drag).
- Supports:
	- `axisConstraint: 'x' | 'y'`
	- `bounds: { min, max }`
	- `bringToFrontOnDrag`
	- `dropInDropZoneOnly`
	- `snapPosition`
- Cancel key (`keyBindings.cancel`) while dragging:
	- reverts to drag start position,
	- reattaches prior drop-zone memberships,
	- calls `onCancel`, ends drag.
- On release:
	- optional `snapPosition` applied,
	- if active acceptable drop zone exists -> item added, zone `onDrop` called,
	- if `dropInDropZoneOnly` and not dropped -> revert + reattach.

### DropZone
- State: `'empty' | 'occupied'` from `interactables.length`.
- `hoveredState` values:
	- `'idle'`
	- `'hovered_acceptable'`
	- `'hovered_not_acceptable'`
- Accepts via `accepts(draggable)` and optional `maxInteractables`.
- `offset` can be static `vec2` or function `(args) => vec2`; used to layout dropped items around zone center.
- Transition callbacks:
	- `onDragEnter` when zone becomes active drop target,
	- `onDragLeave` when it stops being active,
	- `onDrop` when drop succeeds.

### Resizable
- State: `'idle' | 'resizing'`
- Resizes from selected handle(s) (`handles`, `handleSize`).
- Supports `minSize`, `maxSize`, `aspectRatioConstraint`, `resizeFromCenter`, `snapSize`.
- Updates both `interactionState.size` and `behavior.size` during resize.
- Handle hover callbacks: `onHandleEnter`, `onHandleLeave`.
- Events: `onResizeStart`, `onResize(newSize)`, `onResizeEnd`.

### Rotatable
- State: `'idle' | 'rotating'`
- Angle from pointer around `rotationCenter` (or interactable center).
- Supports `minAngle`, `maxAngle`, `directionConstraint`, `snapAngle`.
- Events: `onRotateStart`, `onRotate(angle)`, `onRotateEnd`.

### Slideable
- State: `'idle' | 'sliding'`
- Converts pointer position along local axis (`x` or `y`) to value in `[minValue, maxValue]`.
- Optional `stepSize` snapping.
- Events: `onSlideStart`, `onSlide(value)`, `onSlideEnd`.

### Dialable
- State: `'idle' | 'turning'`
- Computes angle around center, clamps/snaps angle, maps to value range, optional `stepSize`.
- Events: `onTurnStart`, `onTurn(value)`, `onTurnEnd`.

---

## 8) `createBehavior()` helper

```ts
createBehavior(type, params)
```

- Returns behavior object with defaults + your overrides.
- For all known `BehaviorType` values, runtime returns an object (not `undefined`).
- TS return type includes `| undefined`, so callers often use non-null assertion (`!`) or manual narrowing.

Notable defaults:
- all callbacks default to no-op
- `DropZone`: `state: 'empty'`, `hoveredState: 'idle'`, `interactables: []`, `accepts: () => true`
- `Resizable`: corner handles only, `handleSize: 10`, `minSize: (0,0)`, `maxSize: (∞,∞)`
- `Rotatable`: `angle: 0`, `minAngle: -∞`, `maxAngle: +∞`
- `Slideable`: `value: 0`, `range: [0, 1]`, `axis: 'x'`
- `Dialable`: `angle: 0`, `value: 0`, angle range `(-∞,+∞)`, value range `[0,1]`

---

## 9) Practical implementation notes for AI agents

- Always call `system.register(interactable, ...)` for draggable/drop-zone objects so `interactionState.owner` is set.
- If you replace behaviors dynamically, use `interactionState.addBehavior(...)`; same-type behavior is replaced.
- Use `interactionState.setState(type, newState)` for externally forcing behavior state.
- Keep rendering order independent from interaction order if needed; interaction uses descending `zIndex`, render may use ascending.
- `onCancel` exists in several behavior types, but only `Draggable` currently invokes it.
- `Dialable.directionConstraint` is declared but not applied by current runtime logic.

This is the complete public/runtime behavior surface from `index.ts` for code-generation use.
