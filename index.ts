import { clamp } from '@basementuniverse/utils';
import { vec2 } from '@basementuniverse/vec';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Anchor =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export type PointerState = {
  position: vec2;
  buttons: Set<number>;
};

export type HitTestFunction = (this: InteractionState, point: vec2) => boolean;

export type DisableableState = 'enabled' | 'disabled';

export type HoverableState = 'idle' | 'hovered';

export type FocusableState = 'idle' | 'focused';

export type SelectableState = 'idle' | 'selected';

export type SelectionBoxState = {
  topLeft: vec2;
  size: vec2;
};

export type ClickableState = 'idle' | 'pressed';

export type DraggableState = 'idle' | 'dragging';

export type DropZoneState = 'empty' | 'occupied';

export type DropZoneHoveredState =
  | 'idle'
  | 'hovered_acceptable'
  | 'hovered_not_acceptable';

export type ResizableState = 'idle' | 'resizing';

export type RotatableState = 'idle' | 'rotating';

export type SlideableState = 'idle' | 'sliding';

export type DialableState = 'idle' | 'turning';

export type KeyBindings = {
  focusNext: string[];
  focusPrevious: string[];
  focusLeft: string[];
  focusRight: string[];
  focusUp: string[];
  focusDown: string[];
  activate: string[];
  cancel: string[];
};

export type InteractionOptions = {
  keyBindings?: Partial<KeyBindings>;
  thresholds?: {
    doubleClick?: number;
    longPress?: number;
    dragSelect?: number;
  };
};

interface InputProvider {
  keyDown(code?: string): boolean;
  keyPressed(code?: string): boolean;
  keyReleased(code?: string): boolean;
  mouseDown(button?: number): boolean;
  mousePressed(button?: number): boolean;
  mouseReleased(button?: number): boolean;
  mouseWheelUp(): boolean;
  mouseWheelDown(): boolean;
  get mousePosition(): vec2;
}

type DragState = {
  interactable: Interactable;
  behavior: DraggableBehavior;
  offset: vec2;
  startPosition: vec2;
  detachedDropZones: DetachedDropZoneEntry[];
};

type DetachedDropZoneEntry = {
  dropZone: Interactable;
  index: number;
};

export type DropZoneOffsetFunction = (args: {
  interactable: Interactable;
  index: number;
  interactables: Interactable[];
  dropZone: Interactable;
}) => vec2;

type InteractionContext = {
  dt: number;
  input: InputProvider;
  interactables: Interactable[];
  orderedInteractables: Interactable[];
  pointerTargets: Interactable[];
  topPointerTarget?: Interactable;
  focusedInteractable?: Interactable;
  activeDrag?: DragState;
  activeDropZone?: Interactable;
  keyBindings: KeyBindings;
  system: InteractionSystem;
  deselectAll: boolean;
  selectionBox?: SelectionBoxState;
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const DEFAULT_DOUBLE_CLICK_THRESHOLD = 0.3;
const DEFAULT_LONG_PRESS_THRESHOLD = 0.6;
const DEFAULT_DRAG_SELECT_THRESHOLD = 4;

const DEFAULT_KEY_BINDINGS: KeyBindings = {
  focusNext: ['Tab'],
  focusPrevious: ['Shift+Tab'],
  focusLeft: ['ArrowLeft'],
  focusRight: ['ArrowRight'],
  focusUp: ['ArrowUp'],
  focusDown: ['ArrowDown'],
  activate: ['Enter', 'Space'],
  cancel: ['Escape'],
};

const KEY_ALIASES: Record<string, string[]> = {
  Shift: ['ShiftLeft', 'ShiftRight'],
  LeftShift: ['ShiftLeft'],
  RightShift: ['ShiftRight'],
  Control: ['ControlLeft', 'ControlRight'],
  Ctrl: ['ControlLeft', 'ControlRight'],
  LeftControl: ['ControlLeft'],
  RightControl: ['ControlRight'],
  Alt: ['AltLeft', 'AltRight'],
  Option: ['AltLeft', 'AltRight'],
  LeftAlt: ['AltLeft'],
  RightAlt: ['AltRight'],
  Meta: ['MetaLeft', 'MetaRight'],
  Cmd: ['MetaLeft', 'MetaRight'],
  Command: ['MetaLeft', 'MetaRight'],
  LeftMeta: ['MetaLeft'],
  RightMeta: ['MetaRight'],
};

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------

function snap(value: number, step?: number): number {
  if (!step || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

function isKeyPressed(input: InputProvider, codes: string[]): boolean {
  const getCandidates = (code: string): string[] => {
    return KEY_ALIASES[code] ?? [code];
  };

  const anyKeyDown = (code: string): boolean => {
    return getCandidates(code).some(candidate => input.keyDown(candidate));
  };

  const anyKeyPressed = (code: string): boolean => {
    return getCandidates(code).some(candidate => input.keyPressed(candidate));
  };

  for (const code of codes) {
    const parts = code
      .split('+')
      .map(part => part.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      const modifiers = parts.slice(0, -1);
      const key = parts[parts.length - 1];
      const modifiersDown = modifiers.every(modifier => anyKeyDown(modifier));
      if (modifiersDown && anyKeyPressed(key)) {
        return true;
      }
    } else if (parts.length === 1 && anyKeyPressed(parts[0])) {
      return true;
    }
  }
  return false;
}

function isModifierHeld(input: InputProvider, codes: string[]): boolean {
  const getCandidates = (code: string): string[] => KEY_ALIASES[code] ?? [code];
  return codes.some(code => {
    const parts = code
      .split('+')
      .map(part => part.trim())
      .filter(Boolean);
    return parts.every(part =>
      getCandidates(part).some(candidate => input.keyDown(candidate))
    );
  });
}

function boxesIntersect(
  topLeft1: vec2,
  size1: vec2,
  topLeft2: vec2,
  size2: vec2
): boolean {
  return (
    topLeft1.x < topLeft2.x + size2.x &&
    topLeft1.x + size1.x > topLeft2.x &&
    topLeft1.y < topLeft2.y + size2.y &&
    topLeft1.y + size1.y > topLeft2.y
  );
}

function getTopLeftFromAnchor(
  position: vec2,
  size: vec2,
  anchor: Anchor
): vec2 {
  switch (anchor) {
    case 'top-left':
      return position;
    case 'top-right':
      return vec2(position.x - size.x, position.y);
    case 'bottom-left':
      return vec2(position.x, position.y - size.y);
    case 'bottom-right':
      return vec2(position.x - size.x, position.y - size.y);
    case 'top':
      return vec2(position.x - size.x / 2, position.y);
    case 'bottom':
      return vec2(position.x - size.x / 2, position.y - size.y);
    case 'left':
      return vec2(position.x, position.y - size.y / 2);
    case 'right':
      return vec2(position.x - size.x, position.y - size.y / 2);
  }
}

function getPositionFromTopLeft(
  topLeft: vec2,
  size: vec2,
  anchor: Anchor
): vec2 {
  switch (anchor) {
    case 'top-left':
      return topLeft;
    case 'top-right':
      return vec2(topLeft.x + size.x, topLeft.y);
    case 'bottom-left':
      return vec2(topLeft.x, topLeft.y + size.y);
    case 'bottom-right':
      return vec2(topLeft.x + size.x, topLeft.y + size.y);
    case 'top':
      return vec2(topLeft.x + size.x / 2, topLeft.y);
    case 'bottom':
      return vec2(topLeft.x + size.x / 2, topLeft.y + size.y);
    case 'left':
      return vec2(topLeft.x, topLeft.y + size.y / 2);
    case 'right':
      return vec2(topLeft.x + size.x, topLeft.y + size.y / 2);
  }
}

function getInteractableCenter(state: InteractionState): vec2 {
  const topLeft = getTopLeftFromAnchor(
    state.position,
    state.size,
    state.anchor
  );
  return vec2(topLeft.x + state.size.x / 2, topLeft.y + state.size.y / 2);
}

function getHandleAtPoint(
  point: vec2,
  topLeft: vec2,
  size: vec2,
  handles: Anchor[],
  handleSize: number
): Anchor | undefined {
  const half = handleSize / 2;
  const topRight = vec2(topLeft.x + size.x, topLeft.y);
  const bottomLeft = vec2(topLeft.x, topLeft.y + size.y);
  const bottomRight = vec2(topLeft.x + size.x, topLeft.y + size.y);

  const within = (x: number, y: number, width: number, height: number) =>
    point.x >= x &&
    point.x <= x + width &&
    point.y >= y &&
    point.y <= y + height;

  const cornerHandles: Anchor[] = [
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ];

  for (const corner of cornerHandles) {
    if (!handles.includes(corner)) {
      continue;
    }
    const cornerPoint =
      corner === 'top-left'
        ? topLeft
        : corner === 'top-right'
          ? topRight
          : corner === 'bottom-left'
            ? bottomLeft
            : bottomRight;
    if (
      within(cornerPoint.x - half, cornerPoint.y - half, handleSize, handleSize)
    ) {
      return corner;
    }
  }

  if (handles.includes('top')) {
    if (
      within(
        topLeft.x - half,
        topLeft.y - half,
        size.x + handleSize,
        handleSize
      )
    ) {
      return 'top';
    }
  }

  if (handles.includes('bottom')) {
    if (
      within(
        bottomLeft.x - half,
        bottomLeft.y - half,
        size.x + handleSize,
        handleSize
      )
    ) {
      return 'bottom';
    }
  }

  if (handles.includes('left')) {
    if (
      within(
        topLeft.x - half,
        topLeft.y - half,
        handleSize,
        size.y + handleSize
      )
    ) {
      return 'left';
    }
  }

  if (handles.includes('right')) {
    if (
      within(
        topRight.x - half,
        topRight.y - half,
        handleSize,
        size.y + handleSize
      )
    ) {
      return 'right';
    }
  }

  return undefined;
}

// -----------------------------------------------------------------------------
// Interaction System
// -----------------------------------------------------------------------------

export class InteractionSystem {
  private _interactables: Interactable[] = [];

  private _focusedId: string | null = null;

  private _dragState?: DragState;

  private _activeDropZoneId: string | null = null;

  private _pressedOnNonSelectable: boolean = false;

  private _selectionBoxState?: { start: vec2; current: vec2 };

  public dragSelectEnabled: boolean = false;

  public keyBindings: KeyBindings = { ...DEFAULT_KEY_BINDINGS };

  public options: InteractionOptions;

  private _doubleClickThreshold: number;

  private _longPressThreshold: number;

  private _dragSelectThreshold: number;

  public constructor(options: InteractionOptions = {}) {
    this.options = options;
    this.keyBindings = {
      ...DEFAULT_KEY_BINDINGS,
      ...(options.keyBindings ?? {}),
    };
    this._doubleClickThreshold =
      options.thresholds?.doubleClick ?? DEFAULT_DOUBLE_CLICK_THRESHOLD;
    this._longPressThreshold =
      options.thresholds?.longPress ?? DEFAULT_LONG_PRESS_THRESHOLD;
    this._dragSelectThreshold =
      options.thresholds?.dragSelect ?? DEFAULT_DRAG_SELECT_THRESHOLD;
  }

  public get interactables(): Interactable[] {
    return this._interactables;
  }

  public register(interactable: Interactable, ...behaviors: Behavior[]): void {
    interactable.interactionState.owner = interactable;
    for (const behavior of behaviors) {
      interactable.interactionState.addBehavior(behavior);
    }
    this._interactables.push(interactable);
  }

  public unregister(id: string): void;
  public unregister(interactable: Interactable): void;
  public unregister(arg: string | Interactable): void {
    const id = typeof arg === 'string' ? arg : arg.interactionState.id;
    const index = this._interactables.findIndex(
      i => i.interactionState.id === id
    );
    if (index !== -1) {
      this._interactables.splice(index, 1);
    }
  }

  public update(dt: number, input: InputProvider): void {
    const orderedInteractables = this._interactables
      .map((interactable, index) => ({ interactable, index }))
      .sort((a, b) => {
        const zDiff =
          b.interactable.interactionState.zIndex -
          a.interactable.interactionState.zIndex;
        if (zDiff !== 0) {
          return zDiff;
        }
        return a.index - b.index;
      })
      .map(entry => entry.interactable);

    const pointerTargets: Interactable[] = [];
    for (const interactable of orderedInteractables) {
      const state = interactable.interactionState;
      if (!state.receivePointerEvents) {
        continue;
      }
      if (state.isDisabled()) {
        continue;
      }
      const hitTestPassed =
        state.hitTest?.call(state, input.mousePosition) ?? false;

      // Also check if point is over a resize handle for resizable elements
      let handleHitTestPassed = false;
      if (!hitTestPassed) {
        const resizableBehavior = state.behaviors.find(
          b => b.type === BehaviorType.Resizable
        ) as ResizableBehavior | undefined;
        if (resizableBehavior) {
          const topLeft = getTopLeftFromAnchor(
            state.position,
            state.size,
            state.anchor
          );
          const handle = getHandleAtPoint(
            input.mousePosition,
            topLeft,
            state.size,
            resizableBehavior.handles,
            resizableBehavior.handleSize
          );
          handleHitTestPassed = !!handle;
        }
      }

      if (hitTestPassed || handleHitTestPassed) {
        pointerTargets.push(interactable);
        if (state.consumePointerEvents) {
          break;
        }
      }
    }

    const topPointerTarget = pointerTargets[0];

    this.handleFocusNavigation(input, orderedInteractables, topPointerTarget);

    const activeDrag = this._dragState;
    const activeDropZone = activeDrag
      ? this.findActiveDropZone(orderedInteractables, input, activeDrag)
      : undefined;

    if (activeDropZone) {
      this._activeDropZoneId = activeDropZone.interactionState.id;
    } else {
      this._activeDropZoneId = null;
    }

    const focusedInteractable = this._focusedId
      ? this._interactables.find(
          interactable => interactable.interactionState.id === this._focusedId
        )
      : undefined;

    const topSelectableTarget =
      topPointerTarget?.interactionState.behaviors.some(
        b => b.type === BehaviorType.Selectable
      )
        ? topPointerTarget
        : undefined;

    const dragSelectStarts =
      this.dragSelectEnabled &&
      input.mousePressed(0) &&
      !topSelectableTarget &&
      !activeDrag;

    if (dragSelectStarts) {
      this._selectionBoxState = {
        start: vec2(input.mousePosition.x, input.mousePosition.y),
        current: vec2(input.mousePosition.x, input.mousePosition.y),
      };
    }

    if (this._selectionBoxState && input.mouseDown(0)) {
      this._selectionBoxState.current = vec2(
        input.mousePosition.x,
        input.mousePosition.y
      );
    }

    if (input.mousePressed(0) && !topSelectableTarget) {
      this._pressedOnNonSelectable = true;
    }

    const selectionBox = this.selectionBox;
    const dragSelectCompleted = input.mouseReleased(0) && !!selectionBox;
    const deselectAll =
      input.mouseReleased(0) &&
      this._pressedOnNonSelectable &&
      !dragSelectCompleted;

    if (input.mouseReleased(0)) {
      this._pressedOnNonSelectable = false;
      this._selectionBoxState = undefined;
    }

    const context: InteractionContext = {
      dt,
      input,
      interactables: this._interactables,
      orderedInteractables,
      pointerTargets,
      topPointerTarget,
      focusedInteractable,
      activeDrag,
      activeDropZone,
      keyBindings: this.keyBindings,
      deselectAll,
      selectionBox,
      system: this,
    };

    for (const interactable of this._interactables) {
      interactable.interactionState.update(dt, input, context);
    }
  }

  public setKeyBindings(bindings: Partial<KeyBindings>): void {
    this.keyBindings = { ...this.keyBindings, ...bindings };
    this.options = {
      ...this.options,
      keyBindings: { ...this.keyBindings },
    };
  }

  public setThresholds(thresholds: {
    doubleClick?: number;
    longPress?: number;
    dragSelect?: number;
  }): void {
    this._doubleClickThreshold =
      thresholds.doubleClick ?? this._doubleClickThreshold;
    this._longPressThreshold = thresholds.longPress ?? this._longPressThreshold;
    this._dragSelectThreshold =
      thresholds.dragSelect ?? this._dragSelectThreshold;
    this.options = {
      ...this.options,
      thresholds: {
        doubleClick: this._doubleClickThreshold,
        longPress: this._longPressThreshold,
        dragSelect: this._dragSelectThreshold,
      },
    };
  }

  public get doubleClickThreshold(): number {
    return this._doubleClickThreshold;
  }

  public get longPressThreshold(): number {
    return this._longPressThreshold;
  }

  public get dragSelectThreshold(): number {
    return this._dragSelectThreshold;
  }

  public get selectionBox(): SelectionBoxState | undefined {
    if (!this._selectionBoxState) {
      return undefined;
    }
    const { start, current } = this._selectionBoxState;
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    if (Math.sqrt(dx * dx + dy * dy) < this._dragSelectThreshold) {
      return undefined;
    }
    return {
      topLeft: vec2(Math.min(start.x, current.x), Math.min(start.y, current.y)),
      size: vec2(Math.abs(dx), Math.abs(dy)),
    };
  }

  public startDrag(
    interactable: Interactable,
    behavior: DraggableBehavior,
    offset: vec2,
    detachedDropZones: DetachedDropZoneEntry[]
  ): void {
    this._dragState = {
      interactable,
      behavior,
      offset,
      startPosition: vec2(
        interactable.interactionState.position.x,
        interactable.interactionState.position.y
      ),
      detachedDropZones,
    };
  }

  public bringToFront(interactable: Interactable): void {
    const maxZ = Math.max(
      0,
      ...this._interactables.map(item => item.interactionState.zIndex)
    );
    interactable.interactionState.zIndex = maxZ + 1;
  }

  public endDrag(): void {
    this._dragState = undefined;
    this._activeDropZoneId = null;
  }

  public detachInteractableFromDropZones(
    interactable: Interactable
  ): DetachedDropZoneEntry[] {
    const detached: DetachedDropZoneEntry[] = [];

    for (const dropZone of this._interactables) {
      const dropZoneBehavior = this.getDropZoneBehavior(dropZone);
      if (!dropZoneBehavior) {
        continue;
      }

      let index = dropZoneBehavior.interactables.indexOf(interactable);
      while (index !== -1) {
        detached.push({ dropZone, index });
        dropZoneBehavior.interactables.splice(index, 1);
        index = dropZoneBehavior.interactables.indexOf(interactable);
      }

      if (detached.some(entry => entry.dropZone === dropZone)) {
        this.layoutDropZoneInteractables(dropZone, dropZoneBehavior);
      }
    }

    return detached;
  }

  public reattachInteractableToDropZones(
    interactable: Interactable,
    entries: DetachedDropZoneEntry[]
  ): void {
    for (const entry of entries) {
      const dropZoneBehavior = this.getDropZoneBehavior(entry.dropZone);
      if (!dropZoneBehavior) {
        continue;
      }
      if (dropZoneBehavior.interactables.includes(interactable)) {
        continue;
      }
      if (!this.dropZoneHasCapacity(dropZoneBehavior)) {
        continue;
      }

      const index = clamp(
        entry.index,
        0,
        dropZoneBehavior.interactables.length
      );
      dropZoneBehavior.interactables.splice(index, 0, interactable);
      this.layoutDropZoneInteractables(entry.dropZone, dropZoneBehavior);
    }
  }

  public addInteractableToDropZone(
    interactable: Interactable,
    dropZone: Interactable,
    behavior: DropZoneBehavior
  ): boolean {
    if (!behavior.accepts(interactable)) {
      return false;
    }
    if (!this.dropZoneHasCapacity(behavior)) {
      return false;
    }
    if (!behavior.interactables.includes(interactable)) {
      behavior.interactables.push(interactable);
    }
    this.layoutDropZoneInteractables(dropZone, behavior);
    return true;
  }

  public get dragState(): DragState | undefined {
    return this._dragState;
  }

  private handleFocusNavigation(
    input: InputProvider,
    orderedInteractables: Interactable[],
    topPointerTarget?: Interactable
  ): void {
    const focusables = orderedInteractables.filter(interactable => {
      const state = interactable.interactionState;
      return (
        !state.isDisabled() &&
        state.behaviors.some(b => b.type === BehaviorType.Focusable)
      );
    });

    if (focusables.length === 0) {
      this._focusedId = null;
      return;
    }

    if (input.mousePressed(0) && topPointerTarget) {
      const hasFocusable = topPointerTarget.interactionState.behaviors.some(
        b => b.type === BehaviorType.Focusable
      );
      if (hasFocusable) {
        this._focusedId = topPointerTarget.interactionState.id;
      }
    }

    const sortedByTab = focusables
      .map((interactable, index) => ({ interactable, index }))
      .sort((a, b) => {
        const tabDiff =
          a.interactable.interactionState.tabIndex -
          b.interactable.interactionState.tabIndex;
        if (tabDiff !== 0) {
          return tabDiff;
        }
        const zDiff =
          b.interactable.interactionState.zIndex -
          a.interactable.interactionState.zIndex;
        if (zDiff !== 0) {
          return zDiff;
        }
        return a.index - b.index;
      })
      .map(entry => entry.interactable);

    const focusedIndex = this._focusedId
      ? sortedByTab.findIndex(
          interactable => interactable.interactionState.id === this._focusedId
        )
      : -1;

    const nextByTab = isKeyPressed(input, this.keyBindings.focusNext);
    const prevByTab = isKeyPressed(input, this.keyBindings.focusPrevious);

    if (nextByTab || prevByTab) {
      const delta = prevByTab ? -1 : 1;
      const nextIndex =
        focusedIndex === -1
          ? 0
          : (focusedIndex + delta + sortedByTab.length) % sortedByTab.length;
      this._focusedId = sortedByTab[nextIndex].interactionState.id;
      return;
    }

    const focusedInteractable = this._focusedId
      ? sortedByTab.find(
          interactable => interactable.interactionState.id === this._focusedId
        )
      : undefined;

    const current = focusedInteractable ?? topPointerTarget;
    if (!current) {
      return;
    }

    const currentCenter = getInteractableCenter(current.interactionState);
    const direction = isKeyPressed(input, this.keyBindings.focusLeft)
      ? vec2(-1, 0)
      : isKeyPressed(input, this.keyBindings.focusRight)
        ? vec2(1, 0)
        : isKeyPressed(input, this.keyBindings.focusUp)
          ? vec2(0, -1)
          : isKeyPressed(input, this.keyBindings.focusDown)
            ? vec2(0, 1)
            : undefined;

    if (!direction) {
      return;
    }

    let best:
      | { interactable: Interactable; primary: number; secondary: number }
      | undefined;

    for (const candidate of sortedByTab) {
      if (candidate.interactionState.id === current.interactionState.id) {
        continue;
      }
      const candidateCenter = getInteractableCenter(candidate.interactionState);
      const delta = vec2(
        candidateCenter.x - currentCenter.x,
        candidateCenter.y - currentCenter.y
      );
      const primary = delta.x * direction.x + delta.y * direction.y;
      const secondary = Math.abs(direction.x !== 0 ? delta.y : delta.x);
      if (primary <= 0) {
        continue;
      }
      if (
        !best ||
        primary < best.primary ||
        (primary === best.primary && secondary < best.secondary)
      ) {
        best = { interactable: candidate, primary, secondary };
      }
    }

    if (best) {
      this._focusedId = best.interactable.interactionState.id;
    }
  }

  private findActiveDropZone(
    orderedInteractables: Interactable[],
    input: InputProvider,
    dragState: DragState
  ): Interactable | undefined {
    for (const interactable of orderedInteractables) {
      if (
        interactable.interactionState.id ===
        dragState.interactable.interactionState.id
      ) {
        continue;
      }
      const state = interactable.interactionState;
      if (state.isDisabled() || !state.receivePointerEvents) {
        continue;
      }
      const dropZoneBehavior = state.behaviors.find(
        behavior => behavior.type === BehaviorType.DropZone
      ) as DropZoneBehavior | undefined;
      if (!dropZoneBehavior) {
        continue;
      }
      if (!dropZoneBehavior.accepts(dragState.interactable)) {
        continue;
      }
      if (!this.dropZoneHasCapacity(dropZoneBehavior)) {
        continue;
      }
      if (state.hitTest?.call(state, input.mousePosition)) {
        return interactable;
      }
    }
    return undefined;
  }

  private getDropZoneBehavior(
    interactable: Interactable
  ): DropZoneBehavior | undefined {
    return interactable.interactionState.behaviors.find(
      behavior => behavior.type === BehaviorType.DropZone
    ) as DropZoneBehavior | undefined;
  }

  private dropZoneHasCapacity(behavior: DropZoneBehavior): boolean {
    return (
      behavior.maxInteractables === undefined ||
      behavior.interactables.length < behavior.maxInteractables
    );
  }

  private getDropZoneOffset(
    behavior: DropZoneBehavior,
    dropZone: Interactable,
    interactable: Interactable,
    index: number
  ): vec2 {
    if (!behavior.offset) {
      return vec2(0, 0);
    }

    if (typeof behavior.offset === 'function') {
      const result = behavior.offset({
        interactable,
        index,
        interactables: [...behavior.interactables],
        dropZone,
      });
      return vec2(result.x, result.y);
    }

    return vec2(behavior.offset.x, behavior.offset.y);
  }

  private layoutDropZoneInteractables(
    dropZone: Interactable,
    behavior: DropZoneBehavior
  ): void {
    const center = getInteractableCenter(dropZone.interactionState);

    behavior.interactables.forEach((interactable, index) => {
      const targetState = interactable.interactionState;
      const offset = this.getDropZoneOffset(
        behavior,
        dropZone,
        interactable,
        index
      );
      const newTopLeft = vec2(
        center.x - targetState.size.x / 2 + offset.x,
        center.y - targetState.size.y / 2 + offset.y
      );
      targetState.position = getPositionFromTopLeft(
        newTopLeft,
        targetState.size,
        targetState.anchor
      );
    });

    behavior.state = behavior.interactables.length > 0 ? 'occupied' : 'empty';
  }
}

// -----------------------------------------------------------------------------
// Interactable
// -----------------------------------------------------------------------------

export interface Interactable {
  interactionState: InteractionState;
}

export class InteractionState {
  public behaviors: Behavior[] = [];

  public zIndex: number = 0;

  public tabIndex: number = 0;

  public anchor: Anchor = 'top-left';

  public consumePointerEvents: boolean = true;

  public receivePointerEvents: boolean = true;

  public hitTest?: HitTestFunction;

  public owner?: Interactable;

  private internalState: Record<string, any> = {};

  public constructor(
    public id: string,
    public position: vec2,
    public size: vec2,
    hitTest?: HitTestFunction
  ) {
    this.hitTest = hitTest ?? defaultHitTest;
  }

  public setState(
    type: BehaviorType.Disableable,
    newState: DisableableState
  ): void;
  public setState(type: BehaviorType.Hoverable, newState: HoverableState): void;
  public setState(type: BehaviorType.Focusable, newState: FocusableState): void;
  public setState(
    type: BehaviorType.Selectable,
    newState: SelectableState
  ): void;
  public setState(type: BehaviorType.Clickable, newState: ClickableState): void;
  public setState(type: BehaviorType.Draggable, newState: DraggableState): void;
  public setState(type: BehaviorType.DropZone, newState: DropZoneState): void;
  public setState(type: BehaviorType.Resizable, newState: ResizableState): void;
  public setState(type: BehaviorType.Rotatable, newState: RotatableState): void;
  public setState(type: BehaviorType.Slideable, newState: SlideableState): void;
  public setState(type: BehaviorType.Dialable, newState: DialableState): void;
  public setState(type: BehaviorType, newState: any): void {
    const behavior = this.behaviors.find(b => b.type === type);
    if (behavior) {
      behavior.state = newState;
    }
  }

  public addBehavior(...behaviors: Behavior[]): void {
    for (const behavior of behaviors) {
      const existingIndex = this.behaviors.findIndex(
        b => b.type === behavior.type
      );
      if (existingIndex !== -1) {
        this.behaviors[existingIndex] = behavior;
      } else {
        this.behaviors.push(behavior);
      }
    }
  }

  public removeBehavior(...behaviorTypes: BehaviorType[]): void {
    for (const behaviorType of behaviorTypes) {
      const index = this.behaviors.findIndex(b => b.type === behaviorType);
      if (index !== -1) {
        this.behaviors.splice(index, 1);
      }
    }
  }

  public update(
    dt: number,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    this.internalState.__time = (this.internalState.__time ?? 0) + dt;
    const isDisabled = this.isDisabled();
    for (const behavior of this.behaviors) {
      if (isDisabled && behavior.type !== BehaviorType.Disableable) {
        continue;
      }
      switch (behavior.type) {
        case BehaviorType.Disableable:
          this.handleDisableable(behavior, input, context);
          break;
        case BehaviorType.Hoverable:
          this.handleHoverable(behavior, input, context);
          break;
        case BehaviorType.Focusable:
          this.handleFocusable(behavior, input, context);
          break;
        case BehaviorType.Selectable:
          this.handleSelectable(behavior, input, context);
          break;
        case BehaviorType.Clickable:
          this.handleClickable(behavior, input, context);
          break;
        case BehaviorType.Draggable:
          this.handleDraggable(behavior, input, context);
          break;
        case BehaviorType.DropZone:
          this.handleDropZone(behavior, input, context);
          break;
        case BehaviorType.Resizable:
          this.handleResizable(behavior, input, context);
          break;
        case BehaviorType.Rotatable:
          this.handleRotatable(behavior, input, context);
          break;
        case BehaviorType.Slideable:
          this.handleSlideable(behavior, input, context);
          break;
        case BehaviorType.Dialable:
          this.handleDialable(behavior, input, context);
          break;
      }
    }
  }

  private handleDisableable(
    behavior: DisableableBehavior,
    _input: InputProvider,
    _context?: InteractionContext
  ): void {
    const previous = this.internalState.disableableState;
    if (previous !== behavior.state) {
      if (behavior.state === 'disabled') {
        behavior.onDisable();
      } else {
        behavior.onEnable();
      }
      this.internalState.disableableState = behavior.state;
    }
  }

  private handleHoverable(
    behavior: HoverableBehavior,
    _input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isHovered = context.pointerTargets.some(
      interactable => interactable.interactionState.id === this.id
    );
    if (isHovered && behavior.state !== 'hovered') {
      behavior.state = 'hovered';
      behavior.onEnter();
    }
    if (!isHovered && behavior.state === 'hovered') {
      behavior.state = 'idle';
      behavior.onLeave();
    }
  }

  private handleFocusable(
    behavior: FocusableBehavior,
    _input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isFocused =
      context.focusedInteractable?.interactionState.id === this.id;
    if (isFocused && behavior.state !== 'focused') {
      behavior.state = 'focused';
      behavior.onFocus();
    }
    if (!isFocused && behavior.state === 'focused') {
      behavior.state = 'idle';
      behavior.onBlur();
    }
  }

  private handleSelectable(
    behavior: SelectableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isFocused =
      context.focusedInteractable?.interactionState.id === this.id;
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;
    const multiSelectKey = behavior.multiSelectKey ?? ['Ctrl'];
    const additiveSelection =
      behavior.multiSelect && isModifierHeld(input, multiSelectKey);
    const selectionBoxIntersects =
      behavior.multiSelect && context.selectionBox
        ? boxesIntersect(
            getTopLeftFromAnchor(this.position, this.size, this.anchor),
            this.size,
            context.selectionBox.topLeft,
            context.selectionBox.size
          )
        : false;

    const deselectOtherSelectables = (): void => {
      for (const interactable of context.interactables) {
        const state = interactable.interactionState;
        if (state.id === this.id) {
          continue;
        }
        const selectableBehavior = state.behaviors.find(
          b => b.type === BehaviorType.Selectable
        ) as SelectableBehavior | undefined;
        if (selectableBehavior?.state === 'selected') {
          selectableBehavior.state = 'idle';
          selectableBehavior.onDeselect();
        }
      }
    };

    const selectThis = (replaceSelection: boolean): void => {
      if (replaceSelection) {
        deselectOtherSelectables();
      }
      if (behavior.state !== 'selected') {
        behavior.state = 'selected';
        if (behavior.bringToFrontOnSelect && this.owner) {
          context.system.bringToFront(this.owner);
        }
        behavior.onSelect();
      }
    };

    const deselectThis = (): void => {
      if (behavior.state === 'selected') {
        behavior.state = 'idle';
        behavior.onDeselect();
      }
    };

    if (input.mousePressed(0) && isTopTarget) {
      this.internalState.selectPressed = true;
    }

    const activatePressed = isFocused
      ? isKeyPressed(input, context.keyBindings.activate)
      : false;

    if (activatePressed) {
      if (behavior.state === 'selected') {
        deselectThis();
      } else {
        selectThis(!additiveSelection);
      }
    }

    if (input.mouseReleased(0)) {
      if (selectionBoxIntersects) {
        selectThis(false);
      } else if (
        context.selectionBox &&
        behavior.state === 'selected' &&
        !additiveSelection
      ) {
        deselectThis();
      } else if (this.internalState.selectPressed && isTopTarget) {
        if (behavior.state === 'selected') {
          deselectThis();
        } else {
          selectThis(!additiveSelection);
        }
      } else if (context.deselectAll && behavior.state === 'selected') {
        deselectThis();
      }
      this.internalState.selectPressed = false;
    }
  }

  private handleClickable(
    behavior: ClickableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const now = this.internalState.__time ?? 0;
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;

    if (input.mousePressed(0) && isTopTarget) {
      this.internalState.clickPressed = true;
      this.internalState.pressTime = now;
      this.internalState.longPressFired = false;
      behavior.state = 'pressed';
      behavior.onPress();
    }

    if (this.internalState.clickPressed && input.mouseDown(0)) {
      const pressTime = this.internalState.pressTime ?? now;
      if (
        !this.internalState.longPressFired &&
        now - pressTime >= context.system.longPressThreshold
      ) {
        this.internalState.longPressFired = true;
        behavior.onLongPress();
      }
    }

    if (input.mouseReleased(0) && this.internalState.clickPressed) {
      behavior.onRelease();
      behavior.state = 'idle';

      if (isTopTarget) {
        behavior.onClick();
        const lastClickTime = this.internalState.lastClickTime ?? -Infinity;
        if (now - lastClickTime <= context.system.doubleClickThreshold) {
          behavior.onDoubleClick();
        }
        this.internalState.lastClickTime = now;
      }

      this.internalState.clickPressed = false;
    }
  }

  private handleDraggable(
    behavior: DraggableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context || !this.owner) {
      return;
    }
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;
    const dragState = context.activeDrag;
    const isDragging = dragState?.interactable.interactionState.id === this.id;

    if (input.mousePressed(0) && isTopTarget && !dragState) {
      const offset = vec2(
        this.position.x - input.mousePosition.x,
        this.position.y - input.mousePosition.y
      );
      const detachedDropZones = context.system.detachInteractableFromDropZones(
        this.owner
      );
      behavior.state = 'dragging';
      behavior.onDragStart();
      if (behavior.bringToFrontOnDrag) {
        context.system.bringToFront(this.owner);
      }
      context.system.startDrag(this.owner, behavior, offset, detachedDropZones);
    }

    const currentDrag = context.system.dragState;
    if (currentDrag?.interactable.interactionState.id !== this.id) {
      return;
    }

    if (isKeyPressed(input, context.keyBindings.cancel)) {
      this.position = vec2(
        currentDrag.startPosition.x,
        currentDrag.startPosition.y
      );
      context.system.reattachInteractableToDropZones(
        this.owner,
        currentDrag.detachedDropZones
      );
      behavior.state = 'idle';
      behavior.onCancel();
      context.system.endDrag();
      return;
    }

    if (input.mouseDown(0)) {
      let newPosition = vec2(
        input.mousePosition.x + currentDrag.offset.x,
        input.mousePosition.y + currentDrag.offset.y
      );

      if (behavior.axisConstraint === 'x') {
        newPosition = vec2(newPosition.x, this.position.y);
      } else if (behavior.axisConstraint === 'y') {
        newPosition = vec2(this.position.x, newPosition.y);
      }

      if (behavior.bounds) {
        newPosition = vec2(
          clamp(newPosition.x, behavior.bounds.min.x, behavior.bounds.max.x),
          clamp(newPosition.y, behavior.bounds.min.y, behavior.bounds.max.y)
        );
      }

      this.position = newPosition;
      behavior.onDrag(newPosition);
    }

    if (input.mouseReleased(0)) {
      let droppedInDropZone = false;

      if (behavior.snapPosition) {
        this.position = vec2(behavior.snapPosition.x, behavior.snapPosition.y);
      }

      const activeDropZone = context.activeDropZone;
      if (activeDropZone) {
        const dropBehavior = activeDropZone.interactionState.behaviors.find(
          b => b.type === BehaviorType.DropZone
        ) as DropZoneBehavior | undefined;
        if (
          dropBehavior &&
          context.system.addInteractableToDropZone(
            this.owner,
            activeDropZone,
            dropBehavior
          )
        ) {
          dropBehavior.onDrop(this.owner);
          droppedInDropZone = true;
        }
      }

      if (behavior.dropInDropZoneOnly && !droppedInDropZone) {
        this.position = vec2(
          currentDrag.startPosition.x,
          currentDrag.startPosition.y
        );
        context.system.reattachInteractableToDropZones(
          this.owner,
          currentDrag.detachedDropZones
        );
      }

      behavior.state = 'idle';
      behavior.onDragEnd();
      context.system.endDrag();
    }
  }

  private handleDropZone(
    behavior: DropZoneBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const activeDrag = context.activeDrag;
    const isActive = context.activeDropZone?.interactionState.id === this.id;
    const wasActive = this.internalState.dropZoneActive ?? false;
    const hasCapacity =
      behavior.maxInteractables === undefined ||
      behavior.interactables.length < behavior.maxInteractables;

    behavior.state = behavior.interactables.length > 0 ? 'occupied' : 'empty';

    if (!activeDrag) {
      behavior.hoveredState = 'idle';
    } else {
      const isSelfDrag =
        activeDrag.interactable.interactionState.id === this.id;
      const isPointerOverDropZone =
        !isSelfDrag && !!this.hitTest?.call(this, input.mousePosition);

      if (!isPointerOverDropZone) {
        behavior.hoveredState = 'idle';
      } else if (behavior.accepts(activeDrag.interactable) && hasCapacity) {
        behavior.hoveredState = 'hovered_acceptable';
      } else {
        behavior.hoveredState = 'hovered_not_acceptable';
      }
    }

    if (activeDrag && isActive && !wasActive) {
      behavior.onDragEnter(activeDrag.interactable);
      this.internalState.dropZoneActive = true;
      this.internalState.dropZoneLastDrag = activeDrag.interactable;
    }

    if ((!activeDrag || !isActive) && wasActive) {
      const lastDrag = this.internalState.dropZoneLastDrag as
        | Interactable
        | undefined;
      if (lastDrag) {
        behavior.onDragLeave(lastDrag);
      }
      this.internalState.dropZoneActive = false;
      this.internalState.dropZoneLastDrag = undefined;
    }
  }

  private handleResizable(
    behavior: ResizableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;
    const topLeft = getTopLeftFromAnchor(this.position, this.size, this.anchor);

    // Detect hovered handle (regardless of isTopTarget, since handles extend beyond element)
    const hoveredHandle = getHandleAtPoint(
      input.mousePosition,
      topLeft,
      this.size,
      behavior.handles,
      behavior.handleSize
    );

    // Call callbacks for handle hover state changes
    if (hoveredHandle !== behavior.hoveredHandle) {
      if (behavior.hoveredHandle && behavior.onHandleLeave) {
        behavior.onHandleLeave(behavior.hoveredHandle);
      }
      if (hoveredHandle && behavior.onHandleEnter) {
        behavior.onHandleEnter(hoveredHandle);
      }
      behavior.hoveredHandle = hoveredHandle ?? null;
    }

    if (input.mousePressed(0) && isTopTarget) {
      const handle = hoveredHandle;
      if (!handle) {
        return;
      }
      behavior.state = 'resizing';
      behavior.onResizeStart();
      this.internalState.resizeHandle = handle;
      this.internalState.resizeStartMouse = vec2(
        input.mousePosition.x,
        input.mousePosition.y
      );
      this.internalState.resizeStartSize = vec2(this.size.x, this.size.y);
      this.internalState.resizeStartTopLeft = vec2(topLeft.x, topLeft.y);
      this.internalState.resizeStartBottomRight = vec2(
        topLeft.x + this.size.x,
        topLeft.y + this.size.y
      );
    }

    if (behavior.state === 'resizing' && input.mouseDown(0)) {
      const handle = this.internalState.resizeHandle as Anchor | undefined;
      if (!handle) {
        return;
      }
      const startMouse = this.internalState.resizeStartMouse as vec2;
      const startSize = this.internalState.resizeStartSize as vec2;
      const startTopLeft = this.internalState.resizeStartTopLeft as vec2;
      const startBottomRight = this.internalState
        .resizeStartBottomRight as vec2;
      const delta = vec2(
        input.mousePosition.x - startMouse.x,
        input.mousePosition.y - startMouse.y
      );

      let newTopLeft = vec2(startTopLeft.x, startTopLeft.y);
      let newBottomRight = vec2(startBottomRight.x, startBottomRight.y);

      const adjustLeft = handle.includes('left');
      const adjustRight = handle.includes('right');
      const adjustTop = handle.includes('top');
      const adjustBottom = handle.includes('bottom');

      if (adjustLeft) {
        newTopLeft = vec2(newTopLeft.x + delta.x, newTopLeft.y);
      }
      if (adjustRight) {
        newBottomRight = vec2(newBottomRight.x + delta.x, newBottomRight.y);
      }
      if (adjustTop) {
        newTopLeft = vec2(newTopLeft.x, newTopLeft.y + delta.y);
      }
      if (adjustBottom) {
        newBottomRight = vec2(newBottomRight.x, newBottomRight.y + delta.y);
      }

      let newSize = vec2(
        newBottomRight.x - newTopLeft.x,
        newBottomRight.y - newTopLeft.y
      );

      if (handle === 'left' || handle === 'right') {
        newSize = vec2(newSize.x, startSize.y);
      }

      if (handle === 'top' || handle === 'bottom') {
        newSize = vec2(startSize.x, newSize.y);
      }

      if (behavior.aspectRatioConstraint) {
        const ratio = behavior.aspectRatioConstraint;
        if (Math.abs(delta.x) > Math.abs(delta.y)) {
          newSize = vec2(newSize.x, newSize.x / ratio);
        } else {
          newSize = vec2(newSize.y * ratio, newSize.y);
        }
      }

      newSize = vec2(
        clamp(newSize.x, behavior.minSize.x, behavior.maxSize.x),
        clamp(newSize.y, behavior.minSize.y, behavior.maxSize.y)
      );

      if (behavior.snapSize) {
        newSize = vec2(
          snap(newSize.x, behavior.snapSize.x),
          snap(newSize.y, behavior.snapSize.y)
        );
      }

      if (behavior.resizeFromCenter) {
        const center = vec2(
          startTopLeft.x + startSize.x / 2,
          startTopLeft.y + startSize.y / 2
        );
        newTopLeft = vec2(center.x - newSize.x / 2, center.y - newSize.y / 2);
      } else {
        if (adjustLeft && !adjustRight) {
          newTopLeft = vec2(newBottomRight.x - newSize.x, newTopLeft.y);
        } else if (!adjustLeft && adjustRight) {
          newBottomRight = vec2(newTopLeft.x + newSize.x, newBottomRight.y);
        }

        if (adjustTop && !adjustBottom) {
          newTopLeft = vec2(newTopLeft.x, newBottomRight.y - newSize.y);
        } else if (!adjustTop && adjustBottom) {
          newBottomRight = vec2(newBottomRight.x, newTopLeft.y + newSize.y);
        }
      }

      this.size = vec2(newSize.x, newSize.y);
      this.position = getPositionFromTopLeft(newTopLeft, newSize, this.anchor);
      behavior.size = vec2(newSize.x, newSize.y);
      behavior.onResize(newSize);
    }

    if (behavior.state === 'resizing' && input.mouseReleased(0)) {
      behavior.state = 'idle';
      behavior.onResizeEnd();
      this.internalState.resizeHandle = undefined;
    }
  }

  private handleRotatable(
    behavior: RotatableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;

    if (input.mousePressed(0) && isTopTarget) {
      behavior.state = 'rotating';
      behavior.onRotateStart();
      this.internalState.rotateCenter = behavior.rotationCenter
        ? vec2(behavior.rotationCenter.x, behavior.rotationCenter.y)
        : getInteractableCenter(this);
    }

    if (behavior.state === 'rotating' && input.mouseDown(0)) {
      const center = this.internalState.rotateCenter as vec2;
      let angle = Math.atan2(
        input.mousePosition.y - center.y,
        input.mousePosition.x - center.x
      );

      angle = clamp(angle, behavior.minAngle, behavior.maxAngle);
      if (
        behavior.directionConstraint === 'clockwise' &&
        angle < behavior.angle
      ) {
        angle = behavior.angle;
      }
      if (
        behavior.directionConstraint === 'counterclockwise' &&
        angle > behavior.angle
      ) {
        angle = behavior.angle;
      }
      if (behavior.snapAngle) {
        angle = snap(angle, behavior.snapAngle);
      }

      behavior.angle = angle;
      behavior.onRotate(angle);
    }

    if (behavior.state === 'rotating' && input.mouseReleased(0)) {
      behavior.state = 'idle';
      behavior.onRotateEnd();
    }
  }

  private handleSlideable(
    behavior: SlideableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;
    const topLeft = getTopLeftFromAnchor(this.position, this.size, this.anchor);
    const maxExtent = behavior.axis === 'x' ? this.size.x : this.size.y;
    const start = behavior.axis === 'x' ? topLeft.x : topLeft.y;

    if (input.mousePressed(0) && isTopTarget) {
      behavior.state = 'sliding';
      behavior.onSlideStart();
    }

    if (behavior.state === 'sliding' && input.mouseDown(0)) {
      const position =
        behavior.axis === 'x' ? input.mousePosition.x : input.mousePosition.y;
      const t = clamp((position - start) / maxExtent, 0, 1);
      let value =
        behavior.minValue + (behavior.maxValue - behavior.minValue) * t;
      value = snap(value, behavior.stepSize);
      behavior.value = value;
      behavior.onSlide(value);
    }

    if (behavior.state === 'sliding' && input.mouseReleased(0)) {
      behavior.state = 'idle';
      behavior.onSlideEnd();
    }
  }

  private handleDialable(
    behavior: DialableBehavior,
    input: InputProvider,
    context?: InteractionContext
  ): void {
    if (!context) {
      return;
    }
    const isTopTarget =
      context.topPointerTarget?.interactionState.id === this.id;

    if (input.mousePressed(0) && isTopTarget) {
      behavior.state = 'turning';
      behavior.onTurnStart();
      this.internalState.dialCenter = behavior.rotationCenter
        ? vec2(behavior.rotationCenter.x, behavior.rotationCenter.y)
        : getInteractableCenter(this);
    }

    if (behavior.state === 'turning' && input.mouseDown(0)) {
      const center = this.internalState.dialCenter as vec2;
      let angle = Math.atan2(
        input.mousePosition.y - center.y,
        input.mousePosition.x - center.x
      );
      angle = clamp(angle, behavior.minAngle, behavior.maxAngle);
      if (behavior.snapAngle) {
        angle = snap(angle, behavior.snapAngle);
      }
      behavior.angle = angle;
      const t =
        (angle - behavior.minAngle) / (behavior.maxAngle - behavior.minAngle);
      let value =
        behavior.minValue + (behavior.maxValue - behavior.minValue) * t;
      value = snap(value, behavior.stepSize);
      behavior.value = value;
      behavior.onTurn(value);
    }

    if (behavior.state === 'turning' && input.mouseReleased(0)) {
      behavior.state = 'idle';
      behavior.onTurnEnd();
    }
  }

  public isDisabled(): boolean {
    const behavior = this.behaviors.find(
      b => b.type === BehaviorType.Disableable
    ) as DisableableBehavior | undefined;
    return behavior?.state === 'disabled';
  }
}

function defaultHitTest(this: InteractionState, point: vec2): boolean {
  const { anchor, position, size } = this;
  let topLeft: vec2;
  switch (anchor) {
    case 'top-left':
      topLeft = position;
      break;
    case 'top-right':
      topLeft = vec2(position.x - size.x, position.y);
      break;
    case 'bottom-left':
      topLeft = vec2(position.x, position.y - size.y);
      break;
    case 'bottom-right':
      topLeft = vec2(position.x - size.x, position.y - size.y);
      break;
    case 'top':
      topLeft = vec2(position.x - size.x / 2, position.y);
      break;
    case 'bottom':
      topLeft = vec2(position.x - size.x / 2, position.y - size.y);
      break;
    case 'left':
      topLeft = vec2(position.x, position.y - size.y / 2);
      break;
    case 'right':
      topLeft = vec2(position.x - size.x, position.y - size.y / 2);
      break;
  }
  return (
    point.x >= topLeft.x &&
    point.x <= topLeft.x + size.x &&
    point.y >= topLeft.y &&
    point.y <= topLeft.y + size.y
  );
}

// -----------------------------------------------------------------------------
// Behaviors
// -----------------------------------------------------------------------------

export enum BehaviorType {
  Disableable = 'disableable',
  Hoverable = 'hoverable',
  Focusable = 'focusable',
  Selectable = 'selectable',
  Clickable = 'clickable',
  Draggable = 'draggable',
  DropZone = 'dropZone',
  Resizable = 'resizable',
  Rotatable = 'rotatable',
  Slideable = 'slideable',
  Dialable = 'dialable',
}

type BaseBehavior = {
  type: BehaviorType;
  state: string;
};

type DisableableBehavior = BaseBehavior & {
  type: BehaviorType.Disableable;
  state: DisableableState;
  onEnable: () => void;
  onDisable: () => void;
};

type HoverableBehavior = BaseBehavior & {
  type: BehaviorType.Hoverable;
  state: HoverableState;
  onEnter: () => void;
  onLeave: () => void;
};

type FocusableBehavior = BaseBehavior & {
  type: BehaviorType.Focusable;
  state: FocusableState;
  onFocus: () => void;
  onBlur: () => void;
};

type SelectableBehavior = BaseBehavior & {
  type: BehaviorType.Selectable;
  state: SelectableState;
  multiSelect?: boolean;
  multiSelectKey?: string[];
  bringToFrontOnSelect?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
};

type ClickableBehavior = BaseBehavior & {
  type: BehaviorType.Clickable;
  state: ClickableState;
  onPress: () => void;
  onRelease: () => void;
  onClick: () => void;
  onLongPress: () => void;
  onDoubleClick: () => void;
};

type DraggableBehavior = BaseBehavior & {
  type: BehaviorType.Draggable;
  state: DraggableState;
  axisConstraint?: 'x' | 'y';
  bounds?: { min: vec2; max: vec2 };
  bringToFrontOnDrag?: boolean;
  dropInDropZoneOnly?: boolean;
  snapPosition?: vec2;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrag: (newPosition: vec2) => void;
  onCancel: () => void;
};

type DropZoneBehavior = BaseBehavior & {
  type: BehaviorType.DropZone;
  state: DropZoneState;
  hoveredState: DropZoneHoveredState;
  interactables: Interactable[];
  maxInteractables?: number;
  offset?: vec2 | DropZoneOffsetFunction;
  accepts: (draggable: Interactable) => boolean;
  onDragEnter: (draggable: Interactable) => void;
  onDragLeave: (draggable: Interactable) => void;
  onDrop: (draggable: Interactable) => void;
};

type ResizableBehavior = BaseBehavior & {
  type: BehaviorType.Resizable;
  state: ResizableState;
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
};

type RotatableBehavior = BaseBehavior & {
  type: BehaviorType.Rotatable;
  state: RotatableState;
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
};

type SlideableBehavior = BaseBehavior & {
  type: BehaviorType.Slideable;
  state: SlideableState;
  value: number;
  minValue: number;
  maxValue: number;
  axis: 'x' | 'y';
  stepSize?: number;
  onSlideStart: () => void;
  onSlideEnd: () => void;
  onSlide: (newValue: number) => void;
  onCancel: () => void;
};

type DialableBehavior = BaseBehavior & {
  type: BehaviorType.Dialable;
  state: DialableState;
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
  onTurn: (newValue: number) => void;
  onCancel: () => void;
};

export type Behavior =
  | DisableableBehavior
  | HoverableBehavior
  | FocusableBehavior
  | SelectableBehavior
  | ClickableBehavior
  | DraggableBehavior
  | DropZoneBehavior
  | ResizableBehavior
  | RotatableBehavior
  | SlideableBehavior
  | DialableBehavior;

export function createBehavior<T extends BehaviorType>(
  type: T,
  params: Omit<Extract<Behavior, { type: T }>, 'type' | 'state'>
): Extract<Behavior, { type: T }> | undefined {
  switch (type) {
    case BehaviorType.Disableable:
      return {
        type,
        state: 'enabled',
        onEnable: () => {},
        onDisable: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Hoverable:
      return {
        type,
        state: 'idle',
        onEnter: () => {},
        onLeave: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Focusable:
      return {
        type,
        state: 'idle',
        onFocus: () => {},
        onBlur: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Selectable:
      return {
        type,
        state: 'idle',
        onSelect: () => {},
        onDeselect: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Clickable:
      return {
        type,
        state: 'idle',
        onPress: () => {},
        onRelease: () => {},
        onClick: () => {},
        onLongPress: () => {},
        onDoubleClick: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Draggable:
      return {
        type,
        state: 'idle',
        onDragStart: () => {},
        onDragEnd: () => {},
        onDrag: (_newPosition: vec2) => {},
        onCancel: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.DropZone:
      return {
        type,
        state: 'empty',
        hoveredState: 'idle',
        interactables: [] as Interactable[],
        accepts: (_draggable: Interactable) => true,
        onDragEnter: (_draggable: Interactable) => {},
        onDragLeave: (_draggable: Interactable) => {},
        onDrop: (_draggable: Interactable) => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Resizable:
      return {
        type,
        state: 'idle',
        hoveredHandle: null,
        size: vec2(0, 0),
        minSize: vec2(0, 0),
        maxSize: vec2(Infinity, Infinity),
        handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        handleSize: 10,
        onResizeStart: () => {},
        onResizeEnd: () => {},
        onResize: (_newSize: vec2) => {},
        onCancel: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Rotatable:
      return {
        type,
        state: 'idle',
        angle: 0,
        minAngle: -Infinity,
        maxAngle: Infinity,
        onRotateStart: () => {},
        onRotateEnd: () => {},
        onRotate: (_newAngle: number) => {},
        onCancel: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Slideable:
      return {
        type,
        state: 'idle',
        value: 0,
        minValue: 0,
        maxValue: 1,
        axis: 'x',
        onSlideStart: () => {},
        onSlideEnd: () => {},
        onSlide: (_newValue: number) => {},
        onCancel: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
    case BehaviorType.Dialable:
      return {
        type,
        state: 'idle',
        angle: 0,
        minAngle: -Infinity,
        maxAngle: Infinity,
        value: 0,
        minValue: 0,
        maxValue: 1,
        onTurnStart: () => {},
        onTurnEnd: () => {},
        onTurn: (_newValue: number) => {},
        onCancel: () => {},
        ...params,
      } as Extract<Behavior, { type: T }>;
  }

  return undefined;
}
