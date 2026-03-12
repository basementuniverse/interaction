# Game Component: Interaction

A component for handling common UI interactions in a canvas. This component aims to make it easier to implement buttons, drag-and-drop functionality, resizing, and other interactive elements in a game or application.

## Installation

```bash
npm install @basementuniverse/interaction
```

## How to use

See `/demos` for some examples.

Import whichever parts of the library that you need:

```js
import {
  InteractionSystem,
  Interactable,
  InteractionState,
  BehaviorType,
  Behavior,
  createBehavior,
} from '@basementuniverse/interaction';
```

Create an interaction system:

```js
const interactionSystem = new InteractionSystem(options);
```

Create some interactable entities and add behaviors to them:

```js
class Button implements Interactable {
  constructor() {
    this.interactionState = new InteractionState(
      'my-button',    // id
      vec2(100, 100), // position
      vec2(200, 50)   // size
    );

    // We can add behaviors directly to the interaction state
    this.interactionState.addBehavior(
      createBehavior(BehaviorType.Hoverable, {
        onEnter: () => console.log('Button hovered!'),
        onLeave: () => console.log('Button unhovered!'),
      })
    );
  }
}

const button = new Button();
```

Add the interactable entities to the interaction system:

```js
interactionSystem.register(
  button,

  // We can optionally add more behaviors when registering the
  // interactable (these will override any existing behaviors
  // of the same type)
  createBehavior(BehaviorType.Clickable, {
    onClick: () => console.log('Button clicked!'),
  })
);
```

Update the interaction system in your game loop:

```js
function gameLoop(dt) {
  // ... other game logic ...

  interactionSystem.update(dt, InputManager);

  // InputManager is any object that fits the InputProvider
  // interface and which provides current input state
}
```

## Options

When creating an `InteractionSystem`, you can pass in an options object to customize its behavior. The available options are:

- `keyBindings`: an object that maps keyboard keys (or key combinations) to actions.

```js
{
  focusNext: string[];     // default is ['Tab']
  focusPrevious: string[]; // default is ['Shift+Tab']
  focusLeft: string[];     // default is ['ArrowLeft']
  focusRight: string[];    // default is ['ArrowRight']
  focusUp: string[];       // default is ['ArrowUp']
  focusDown: string[];     // default is ['ArrowDown']
  activate: string[];      // default is ['Enter', 'Space']
  cancel: string[];        // default is ['Escape']
}
```

- `thresholds.doubleClick`: the maximum time (in seconds) between two clicks to be considered a double click. Default is `0.3`.

- `thresholds.longPress`: the minimum time (in seconds) a pointer must be held down to be considered a long press. Default is `0.6`.

- `thresholds.dragSelect`: the minimum distance (in pixels) the pointer must move while held down to be considered a drag. Default is `4`.

## Behaviors

### Disableable

```js
type DisableableBehavior = {
  type: BehaviorType.Disableable;
  state: DisableableState; // 'enabled' | 'disabled'
  onEnable: () => void;
  onDisable: () => void;
}
```

### Hoverable

```js
type HoverableBehavior = {
  type: BehaviorType.Hoverable;
  state: HoverableState; // 'idle' | 'hovered'
  onEnter: () => void;
  onLeave: () => void;
}
```

### Focusable

```js
type FocusableBehavior = {
  type: BehaviorType.Focusable;
  state: FocusableState; // 'idle' | 'focused'
  onFocus: () => void;
  onBlur: () => void;
}
```

### Selectable

```js
type SelectableBehavior = {
  type: BehaviorType.Selectable;
  state: SelectableState; // 'idle' | 'selected'
  multiSelect?: boolean;
  multiSelectKey?: string[];
  bringToFrontOnSelect?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
}
```

### Clickable

```js
type ClickableBehavior = {
  type: BehaviorType.Clickable;
  state: ClickableState; // 'idle' | 'pressed'
  onPress: () => void;
  onRelease: () => void;
  onClick: () => void;
  onLongPress: () => void;
  onDoubleClick: () => void;
}
```

### Draggable

```js
type DraggableBehavior = {
  type: BehaviorType.Draggable;
  state: DraggableState; // 'idle' | 'dragging'
  axisConstraint?: 'x' | 'y';
  bounds?: {
    min: vec2;
    max: vec2;
  };
  bringToFrontOnDrag?: boolean;
  dropInDropZoneOnly?: boolean;
  snapPosition?: vec2;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrag: (newPosition: vec2) => void;
  onCancel: () => void;
}
```

### DropZoneBehavior

```js
type DropZoneBehavior = {
  type: BehaviorType.DropZone;
  state: DropZoneState; // 'empty' | 'occupied'
  hoveredState: DropZoneHoveredState; // 'idle' | 'hovered_acceptable' | 'hovered_not_acceptable'
  interactables: Interactable[];
  maxInteractables?: number;
  offset?: vec2 | DropZoneOffsetFunction;
  accepts: (draggable: Interactable) => boolean;
  onDragEnter: (draggable: Interactable) => void;
  onDragLeave: (draggable: Interactable) => void;
  onDrop: (draggable: Interactable) => void;
}
```

### ResizableBehavior

```js
type ResizableBehavior = {
  type: BehaviorType.Resizable;
  state: ResizableState; // 'idle' | 'resizing'
  hoveredHandle: Anchor | null;
  size: vec2;
  minSize: vec2;
  maxSize: vec2;
  handles: Anchor[];
  handleSize: number;
  aspectRatioConstraint?: number;
  resizeFromCenter?: boolean;
  snapSize?: vec2;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  onResize: (newSize: vec2) => void;
  onCancel: () => void;
  onHandleEnter?: (handle: Anchor) => void;
  onHandleLeave?: (handle: Anchor) => void;
}
```

### RotatableBehavior

```js
type RotatableBehavior = {
  type: BehaviorType.Rotatable;
  state: RotatableState; // 'idle' | 'rotating'
  angle: number;
  minAngle: number;
  maxAngle: number;
  rotationCenter?: vec2;
  directionConstraint?: 'clockwise' | 'counterclockwise';
  snapAngle?: number;
  onRotateStart: () => void;
  onRotateEnd: () => void;
  onRotate: (newAngle: number) => void;
  onCancel: () => void;
}
```

### SlideableBehavior

```js
type SlideableBehavior = {
  type: BehaviorType.Slideable;
  state: SlideableState; // 'idle' | 'sliding'
  value: number;
  minValue: number;
  maxValue: number;
  axis: 'x' | 'y';
  stepSize?: number;
  onSlideStart: () => void;
  onSlideEnd: () => void;
  onSlide: (newValue: number) => void;
  onCancel: () => void;
}
```

### DialableBehavior

```js
type DialableBehavior = {
  type: BehaviorType.Dialable;
  state: DialableState; // 'idle' | 'turning'
  angle: number;
  minAngle: number;
  maxAngle: number;
  value: number;
  minValue: number;
  maxValue: number;
  stepSize?: number;
  rotationCenter?: vec2;
  directionConstraint?: 'clockwise' | 'counterclockwise';
  snapAngle?: number;
  onTurnStart: () => void;
  onTurnEnd: () => void;
  onTurn: (newAngle: number, newValue: number) => void;
  onCancel: () => void;
}
```
