import { Injectable } from '@angular/core';
import { Node, NodeSpec } from 'prosemirror-model';
import { NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';

export interface PropertyAttrs {
  id: string;
  label: string;
  value: string;
}

@Injectable({
  providedIn: 'root'
})
export class PropertyNodeService {
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

  createNodeView(node: Node, view: any, getPos: () => number): NodeView {
    if (typeof getPos !== 'function') {
      throw new Error('getPos must be a function');
    }
    return new PropertyNodeView(node, view, getPos);
  }
}

class PropertyNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: null;
  private selected: boolean = false;

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

  private setupEventListeners(): void {
    this.dom.addEventListener('click', (event) => {
      event.preventDefault();
      const pos = this.getPos();
      const tr = this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos));
      this.view.dispatch(tr);
      this.view.focus();
    });
  }

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

  selectNode(): void {
    if (!this.selected) {
      this.selected = true;
      this.dom.classList.add('ProseMirror-selectednode');
    }
  }

  deselectNode(): void {
    if (this.selected) {
      this.selected = false;
      this.dom.classList.remove('ProseMirror-selectednode');
    }
  }

  stopEvent(event: Event): boolean {
    return event.type !== 'click' && !['dragstart', 'dragover', 'dragleave', 'dragend', 'drop'].includes(event.type);
  }

  ignoreMutation(): boolean {
    return true;
  }
} 