import { vec2 } from '@basementuniverse/vec';
export type Anchor = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
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
export type DropZoneHoveredState = 'idle' | 'hovered_acceptable' | 'hovered_not_acceptable';
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
export declare class InteractionSystem {
    private _interactables;
    private _focusedId;
    private _dragState?;
    private _activeDropZoneId;
    private _pressedOnNonSelectable;
    private _selectionBoxState?;
    dragSelectEnabled: boolean;
    keyBindings: KeyBindings;
    options: InteractionOptions;
    private _doubleClickThreshold;
    private _longPressThreshold;
    private _dragSelectThreshold;
    constructor(options?: InteractionOptions);
    get interactables(): Interactable[];
    register(interactable: Interactable, ...behaviors: Behavior[]): void;
    unregister(id: string): void;
    unregister(interactable: Interactable): void;
    update(dt: number, input: InputProvider): void;
    setKeyBindings(bindings: Partial<KeyBindings>): void;
    setThresholds(thresholds: {
        doubleClick?: number;
        longPress?: number;
        dragSelect?: number;
    }): void;
    get doubleClickThreshold(): number;
    get longPressThreshold(): number;
    get dragSelectThreshold(): number;
    get selectionBox(): SelectionBoxState | undefined;
    startDrag(interactable: Interactable, behavior: DraggableBehavior, offset: vec2, detachedDropZones: DetachedDropZoneEntry[]): void;
    bringToFront(interactable: Interactable): void;
    endDrag(): void;
    detachInteractableFromDropZones(interactable: Interactable): DetachedDropZoneEntry[];
    reattachInteractableToDropZones(interactable: Interactable, entries: DetachedDropZoneEntry[]): void;
    addInteractableToDropZone(interactable: Interactable, dropZone: Interactable, behavior: DropZoneBehavior): boolean;
    get dragState(): DragState | undefined;
    private handleFocusNavigation;
    private findActiveDropZone;
    private getDropZoneBehavior;
    private dropZoneHasCapacity;
    private getDropZoneOffset;
    private layoutDropZoneInteractables;
}
export interface Interactable {
    interactionState: InteractionState;
}
export declare class InteractionState {
    id: string;
    position: vec2;
    size: vec2;
    behaviors: Behavior[];
    zIndex: number;
    tabIndex: number;
    anchor: Anchor;
    consumePointerEvents: boolean;
    receivePointerEvents: boolean;
    hitTest?: HitTestFunction;
    owner?: Interactable;
    private internalState;
    constructor(id: string, position: vec2, size: vec2, hitTest?: HitTestFunction);
    setState(type: BehaviorType.Disableable, newState: DisableableState): void;
    setState(type: BehaviorType.Hoverable, newState: HoverableState): void;
    setState(type: BehaviorType.Focusable, newState: FocusableState): void;
    setState(type: BehaviorType.Selectable, newState: SelectableState): void;
    setState(type: BehaviorType.Clickable, newState: ClickableState): void;
    setState(type: BehaviorType.Draggable, newState: DraggableState): void;
    setState(type: BehaviorType.DropZone, newState: DropZoneState): void;
    setState(type: BehaviorType.Resizable, newState: ResizableState): void;
    setState(type: BehaviorType.Rotatable, newState: RotatableState): void;
    setState(type: BehaviorType.Slideable, newState: SlideableState): void;
    setState(type: BehaviorType.Dialable, newState: DialableState): void;
    addBehavior(...behaviors: Behavior[]): void;
    removeBehavior(...behaviorTypes: BehaviorType[]): void;
    update(dt: number, input: InputProvider, context?: InteractionContext): void;
    private handleDisableable;
    private handleHoverable;
    private handleFocusable;
    private handleSelectable;
    private handleClickable;
    private handleDraggable;
    private handleDropZone;
    private handleResizable;
    private handleRotatable;
    private handleSlideable;
    private handleDialable;
    isDisabled(): boolean;
}
export declare enum BehaviorType {
    Disableable = "disableable",
    Hoverable = "hoverable",
    Focusable = "focusable",
    Selectable = "selectable",
    Clickable = "clickable",
    Draggable = "draggable",
    DropZone = "dropZone",
    Resizable = "resizable",
    Rotatable = "rotatable",
    Slideable = "slideable",
    Dialable = "dialable"
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
export type Behavior = DisableableBehavior | HoverableBehavior | FocusableBehavior | SelectableBehavior | ClickableBehavior | DraggableBehavior | DropZoneBehavior | ResizableBehavior | RotatableBehavior | SlideableBehavior | DialableBehavior;
export declare function createBehavior<T extends BehaviorType>(type: T, params: Omit<Extract<Behavior, {
    type: T;
}>, 'type' | 'state'>): Extract<Behavior, {
    type: T;
}> | undefined;
export {};
