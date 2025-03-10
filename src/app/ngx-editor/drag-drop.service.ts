import { Injectable } from '@angular/core';
import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { Node } from 'prosemirror-model';

/**
 * Interface representing the state of drag and drop operations
 */
export interface DragDropState {
  lastTarget: HTMLElement | null;
  insertionType: 'before' | 'after' | null;
  pos: number | null;
  node: Node | null;
  originalPos: number | null;
  originalNodeSize: number | null;
}

/**
 * Service handling drag and drop functionality for property nodes
 * Implements ProseMirror plugin for custom drag and drop behavior
 */
@Injectable({
  providedIn: 'root'
})
export class DragDropService {
  private readonly pluginKey = new PluginKey('dragDropTracker');

  /**
   * Creates a ProseMirror plugin for drag and drop functionality
   * @returns Plugin instance with drag and drop state management
   */
  createPlugin(): Plugin<DragDropState> {
    return new Plugin<DragDropState>({
      key: this.pluginKey,
      state: {
        init: () => ({
          lastTarget: null,
          insertionType: null,
          pos: null,
          node: null,
          originalPos: null,
          originalNodeSize: null
        }),
        apply: (tr, value) => value
      },
      props: {
        handleDOMEvents: {
          dragstart: this.handleDragStart.bind(this),
          dragover: this.handleDragOver.bind(this),
          drop: this.handleDrop.bind(this),
          dragend: this.handleDragEnd.bind(this)
        }
      }
    });
  }

  /**
   * Retrieves current drag and drop state from editor state
   * @param state Current editor state
   * @returns Current drag and drop state
   */
  private getState(state: EditorState): DragDropState {
    return this.pluginKey.getState(state) || {
      lastTarget: null,
      insertionType: null,
      pos: null,
      node: null,
      originalPos: null,
      originalNodeSize: null
    };
  }

  /**
   * Finds the first valid position in the document for dropping a node
   * @param view Editor view instance
   * @returns Position index where node can be dropped
   */
  private findFirstValidPosition(view: any): number {
    const firstNode = view.state.doc.firstChild;
    return firstNode ? firstNode.nodeSize : 0;
  }

  /**
   * Validates if a position is valid for dropping a node
   * @param pos Position to validate
   * @param view Editor view instance
   * @returns Boolean indicating if position is valid
   */
  private isValidDropPosition(pos: number, view: any): boolean {
    if (pos === 0) return false;
    const doc = view.state.doc;
    let isValid = false;
    doc.nodesBetween(0, doc.content.size, (node: Node, nodePos: number): boolean => {
      if (node.type.name === 'property') {
        if (pos === nodePos || pos === nodePos + node.nodeSize) {
          isValid = true;
          return false;
        }
      }
      return true;
    });
    return isValid;
  }

  /**
   * Finds the nearest valid position for dropping a node
   * @param pos Current position
   * @param view Editor view instance
   * @returns Nearest valid position for dropping
   */
  private findNearestValidPosition(pos: number, view: any): number {
    const doc = view.state.doc;
    let nearestPos = -1;
    let minDistance = Infinity;

    doc.nodesBetween(0, doc.content.size, (node: Node, nodePos: number): boolean => {
      if (node.type.name === 'property') {
        const distBefore = Math.abs(nodePos - pos);
        if (distBefore < minDistance) {
          minDistance = distBefore;
          nearestPos = nodePos;
        }

        const distAfter = Math.abs((nodePos + node.nodeSize) - pos);
        if (distAfter < minDistance) {
          minDistance = distAfter;
          nearestPos = nodePos + node.nodeSize;
        }
      }
      return true;
    });

    return nearestPos >= 0 ? nearestPos : this.findFirstValidPosition(view);
  }

  /**
   * Handles the start of drag operation
   * Sets up drag data and visual feedback
   */
  private handleDragStart(view: any, event: DragEvent): boolean {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('property-node')) return false;

    target.classList.add('dragging');
    const domPos = view.posAtDOM(target, 0);
    if (domPos === undefined) return false;

    const state = this.getState(view.state);
    state.originalPos = domPos;

    const originalNode = view.state.doc.nodeAt(domPos);
    state.originalNodeSize = originalNode?.nodeSize || 0;

    const id = target.getAttribute('data-id') || '';
    const content = target.querySelector('.property-content');
    const text = content?.textContent || '';
    const match = text.match(/(.+) \((.+)\)/);
    const label = match ? match[1] : '';
    const value = match ? match[2] : '';

    event.dataTransfer?.setData('application/prosemirror-node', JSON.stringify({
      type: 'property',
      attrs: { id, label, value },
      pos: domPos
    }));
    event.dataTransfer?.setData('text/plain', text);

    return true;
  }

  /**
   * Handles drag over events
   * Updates visual feedback and validates drop positions
   */
  private handleDragOver(view: any, event: DragEvent): boolean {
    event.preventDefault();
    const target = event.target as HTMLElement;
    const state = this.getState(view.state);

    view.dom.querySelectorAll('.property-node').forEach((node: Element) => {
      node.classList.remove('drag-over', 'insert-before', 'insert-after');
    });

    if (target.classList.contains('property-node')) {
      const rect = target.getBoundingClientRect();
      const mouseX = event.clientX;
      const centerX = rect.left + (rect.width / 2);

      const pos = view.posAtDOM(target, 0);
      if (pos !== undefined) {
        const node = view.state.doc.nodeAt(pos);
        const potentialPos = mouseX < centerX ? pos : pos + (node?.nodeSize || 0);

        if (this.isValidDropPosition(potentialPos, view)) {
          state.insertionType = mouseX < centerX ? 'before' : 'after';
          state.lastTarget = target;
          state.pos = pos;
          state.node = node;

          target.classList.add('drag-over', `insert-${state.insertionType}`);
        }
      }
    } else {
      state.lastTarget = null;
      state.insertionType = null;
      state.pos = null;
      state.node = null;
    }

    view.dom.classList.add('drag-active');
    return true;
  }

  /**
   * Handles drop events
   * Performs the actual node movement in the document
   */
  private handleDrop(view: any, event: DragEvent): boolean {
    event.preventDefault();
    view.dom.classList.remove('drag-active');

    const state = this.getState(view.state);
    let dropPos;

    if (state.lastTarget && state.pos !== null && state.node) {
      dropPos = state.insertionType === 'before' ? 
        state.pos : 
        state.pos + state.node.nodeSize;
    } else {
      const coords = view.posAtCoords({
        left: event.clientX,
        top: event.clientY
      });
      dropPos = coords?.pos;
    }

    if (dropPos === undefined || dropPos === 0 || !this.isValidDropPosition(dropPos, view)) {
      dropPos = this.findNearestValidPosition(dropPos || 0, view);
    }

    view.dom.querySelectorAll('.property-node').forEach((node: Element) => {
      node.classList.remove('drag-over', 'insert-before', 'insert-after', 'dragging');
    });

    const data = event.dataTransfer?.getData('application/prosemirror-node');
    if (!data) return false;

    try {
      const nodeData = JSON.parse(data);
      const tr = view.state.tr;
      const newNode = view.state.schema.nodes['property'].create(nodeData.attrs);

      tr.insert(dropPos, newNode);

      if (state.originalPos !== null && state.originalNodeSize !== null) {
        const deletePos = dropPos <= state.originalPos ? 
          state.originalPos + newNode.nodeSize : 
          state.originalPos;

        if (deletePos >= 0 && deletePos + state.originalNodeSize <= tr.doc.content.size) {
          tr.delete(deletePos, deletePos + state.originalNodeSize);
        }
      }

      this.resetState(state);
      view.updateState(view.state.apply(tr));
      return true;
    } catch (e) {
      console.error('Error in drop handler:', e);
      return false;
    }
  }

  /**
   * Handles the end of drag operation
   * Cleans up visual feedback and resets state
   */
  private handleDragEnd(view: any): boolean {
    view.dom.classList.remove('drag-active');
    view.dom.querySelectorAll('.property-node').forEach((node: Element) => {
      node.classList.remove('drag-over', 'insert-before', 'insert-after', 'dragging');
    });

    const state = this.getState(view.state);
    this.resetState(state);
    return false;
  }

  /**
   * Resets drag and drop state to initial values
   * @param state Current drag and drop state
   */
  private resetState(state: DragDropState): void {
    state.lastTarget = null;
    state.insertionType = null;
    state.pos = null;
    state.node = null;
    state.originalPos = null;
    state.originalNodeSize = null;
  }
} 