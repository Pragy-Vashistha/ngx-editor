import { Injectable } from '@angular/core';
import { Node, NodeSpec } from 'prosemirror-model';
import { NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';

/**
 * Interface defining the attributes of a property node
 */
export interface PropertyAttrs {
  id: string;
  label: string;
  value: string;
}

/**
 * Service responsible for managing custom property nodes in the editor
 * Built on ProseMirror's node system
 */
@Injectable({
  providedIn: 'root'
})
export class PropertyNodeService {
  /**
   * Node specification for property nodes following ProseMirror schema
   * - group: 'inline' - Allows node to be placed inline with text
   * - inline: true - Node behaves as an inline element
   * - atom: true - Node is treated as a single unit
   * - draggable: true - Enables drag and drop functionality
   */
  readonly nodeSpec: NodeSpec = {
    group: 'inline',
    inline: true,
    atom: true,
    draggable: true,
    selectable: true,
    attrs: {
      id: { default: '' },
      label: { default: '' },
      value: { default: '' }
    },
    toDOM: (node: Node) => {
      const wrapper = document.createElement('span');
      wrapper.className = 'property-node';
      wrapper.contentEditable = 'false';
      wrapper.setAttribute('aria-label', `Property: ${node.attrs['label']}, Value: ${node.attrs['value']}`);
      const content = document.createElement('span');
      content.className = 'property-content';
      content.textContent = `${node.attrs['label']} (${node.attrs['value']})`;
      wrapper.appendChild(content);
      return wrapper;
    },
    parseDOM: [{
      tag: 'span.property-node',
      getAttrs: (dom: any) => {
        const node = dom as HTMLElement;
        const content = node.querySelector('.property-content');
        const text = content?.textContent || '';
        const match = text.match(/(.+) \((.+)\)/);
        return match ? { label: match[1], value: match[2], id: node.getAttribute('data-id') || '' } : {};
      }
    }]
  };

  /**
   * Creates a custom node view for property nodes
   * @param node The ProseMirror node
   * @param view The editor view instance
   * @param getPos Function to get current node position
   * @returns NodeView instance for the property node
   */
  createNodeView(node: Node, view: any, getPos: () => number): NodeView {
    if (typeof getPos !== 'function') {
      throw new Error('getPos must be a function');
    }
    return new PropertyNodeView(node, view, getPos);
  }
}

/**
 * Custom NodeView implementation for property nodes
 * Handles rendering and interaction behavior
 */
class PropertyNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: null;
  private selected: boolean = false;

  /**
   * Creates a new PropertyNodeView instance
   * @param node The ProseMirror node
   * @param view The editor view instance
   * @param getPos Function to get current node position
   */
  constructor(private node: Node, private view: any, private getPos: () => number) {
    this.dom = document.createElement('span');
    this.dom.className = 'property-node';
    this.dom.setAttribute('data-id', node.attrs['id']);
    this.dom.setAttribute('aria-label', `Property: ${node.attrs['label']}, Value: ${node.attrs['value']}`);
    this.dom.draggable = true;
    this.dom.contentEditable = 'false';

    const content = document.createElement('span');
    content.className = 'property-content';
    content.textContent = `${node.attrs['label']} (${node.attrs['value']})`;
    this.dom.appendChild(content);

    this.contentDOM = null;
    this.setupEventListeners();
  }

  /**
   * Sets up click event listeners for node selection
   */
  private setupEventListeners(): void {
    this.dom.addEventListener('click', (event) => {
      event.preventDefault();
      const pos = this.getPos();
      const tr = this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos));
      this.view.dispatch(tr);
      this.view.focus();
    });
  }

  /**
   * Updates the node's content and attributes
   * @param node Updated node data
   * @returns Boolean indicating if update was successful
   */
  update(node: Node): boolean {
    if (node.type.name !== 'property') return false;
    this.node = node;
    this.dom.setAttribute('data-id', node.attrs['id']);
    this.dom.setAttribute('aria-label', `Property: ${node.attrs['label']}, Value: ${node.attrs['value']}`);
    const content = this.dom.querySelector('.property-content');
    if (content) {
      content.textContent = `${node.attrs['label']} (${node.attrs['value']})`;
    }
    return true;
  }

  /**
   * Handles node selection state
   */
  selectNode(): void {
    if (!this.selected) {
      this.selected = true;
      this.dom.classList.add('ProseMirror-selectednode');
    }
  }

  /**
   * Handles node deselection state
   */
  deselectNode(): void {
    if (this.selected) {
      this.selected = false;
      this.dom.classList.remove('ProseMirror-selectednode');
    }
  }

  /**
   * Controls which events should be handled by the node
   * @param event DOM event
   * @returns Boolean indicating if event should be stopped
   */
  stopEvent(event: Event): boolean {
    return event.type !== 'click' && !['dragstart', 'dragover', 'dragleave', 'dragend', 'drop'].includes(event.type);
  }

  /**
   * Controls whether DOM mutations should be ignored
   * @returns Always returns true as we handle updates manually
   */
  ignoreMutation(): boolean {
    return true;
  }
} 