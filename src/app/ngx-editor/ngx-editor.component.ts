import { Component, OnInit, OnDestroy, ViewEncapsulation, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Editor, schema, NgxEditorModule } from 'ngx-editor';
import { Schema, Node } from 'prosemirror-model';
import { Plugin, PluginKey, NodeSelection } from 'prosemirror-state';
import { NodeViewConstructor } from 'prosemirror-view';
import { isPlatformBrowser } from '@angular/common';

import { PropertyNodeService } from './property-node.service';
import { DragDropService } from './drag-drop.service';

/**
 * Main editor component that integrates ngx-editor with custom property nodes
 * Provides a rich text editor with support for draggable property nodes
 */
@Component({
  selector: 'app-ngx-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NgxEditorModule],
  template: `
    <div class="editor-container">
      <div class="toolbar">
        <select (change)="insertProperty($event)">
          <option value="">Insert Property...</option>
          <option *ngFor="let prop of properties" [value]="prop.id">{{prop.label}}</option>
        </select>
        
        <div class="toolbar-group">
          <button *ngFor="let op of operators" 
                  (click)="insertOperator(op)"
                  class="toolbar-button">
            {{op}}
          </button>
        </div>

        <div class="toolbar-group">
          <button *ngFor="let func of functions" 
                  (click)="insertFunction(func)"
                  class="toolbar-button">
            {{func}}
          </button>
        </div>

        <a class="nav-link" [routerLink]="['/codemirror']">Switch to CodeMirror</a>
      </div>

      <div *ngIf="!isBrowser" class="editor-placeholder">
        Loading editor...
      </div>

      <div class="editor-wrapper">
        <ngx-editor
          *ngIf="isBrowser"
          [editor]="editor"
          [ngModel]="html"
          (ngModelChange)="onChange($event)"
          [placeholder]="'Type here...'"
        ></ngx-editor>

        <div class="editor-stats">
          <div>Total Nodes: {{stats.totalNodes}}</div>
          <div>Selected Nodes: {{stats.selectedNodes}}</div>
        </div>

        <div class="raw-view">
          <h4>Raw View</h4>
          <pre>{{rawContent}}</pre>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .editor-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
      height: 100vh;
    }
    .toolbar {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
      padding: 0.5rem;
      background: #f5f5f5;
      border-radius: 4px;
    }
    .toolbar-group {
      display: flex;
      gap: 0.5rem;
      padding: 0 0.5rem;
      border-left: 1px solid #ddd;
    }
    .toolbar-button {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 14px;
      color: #1976d2;
      transition: all 0.2s;
    }
    .toolbar-button:hover {
      background: #e3f2fd;
      border-color: #1976d2;
    }
    .nav-link {
      text-decoration: none;
      color: #1976d2;
      font-weight: 500;
    }
    .editor-wrapper {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 1rem;
      height: calc(100vh - 120px);
    }
    .editor-stats {
      padding: 1rem;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 14px;
    }
    .raw-view {
      padding: 1rem;
      background: #f5f5f5;
      border-radius: 4px;
      overflow: auto;
    }
    .raw-view h4 {
      margin: 0 0 0.5rem 0;
      font-size: 14px;
      color: #666;
    }
    .raw-view pre {
      margin: 0;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .editor-placeholder {
      min-height: 200px;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      background: #f5f5f5;
    }
    .ProseMirror span.property-node {
      display: inline-flex;
      align-items: center;
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 6px;
      margin: 0 2px;
      border-radius: 4px;
      font-weight: 500;
      cursor: move;
      user-select: none;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(25, 118, 210, 0.2);
      transition: all 0.2s ease;
      position: relative;
      z-index: 0;
    }
    .ProseMirror span.property-node.ProseMirror-selectednode {
      background-color: #1976d2 !important;
      color: white !important;
      border: 1px solid #1565c0 !important;
      box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3) !important;
      z-index: 1;
      outline: 2px solid #1976d2;
      outline-offset: 1px;
    }
    .property-node.drag-over {
      background: #bbdefb;
      border: 1px dashed #1976d2;
      box-shadow: 0 2px 6px rgba(25, 118, 210, 0.2);
    }
    .property-node.dragging {
      opacity: 0.5;
    }
    .property-content {
      pointer-events: none;
    }
    .ProseMirror {
      min-height: 200px;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      position: relative;
    }
    .ProseMirror.drag-active {
      background: #f5f5f5;
      border-color: #1976d2;
    }
    .property-node.insert-before::before {
      content: '';
      position: absolute;
      left: -2px;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: #1976d2;
      border-radius: 2px;
    }
    .property-node.insert-after::after {
      content: '';
      position: absolute;
      right: -2px;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: #1976d2;
      border-radius: 2px;
    }
    .ProseMirror::before,
    .ProseMirror::after {
      content: '';
      display: block;
      height: 8px;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class NgxEditorComponent implements OnInit, OnDestroy {
  editor!: Editor;
  html = '';
  isBrowser: boolean;
  rawContent = '';
  stats: EditorStats = {
    totalNodes: 0,
    selectedNodes: 0
  };

  // Available operators for formula building
  operators = ['+', '-', '*', '/', '(', ')'];
  
  // Available functions for formula building
  functions = ['Avg()', 'Sum()', 'Scale()'];

  // Sample properties that can be inserted into the editor
  properties: Property[] = [
    { label: 'temperature', id: '1', value: '25°C' },
    { label: 'speed', id: '2', value: '60 km/h' },
    { label: 'pressure', id: '3', value: '1013 hPa' }
  ];

  constructor(
    @Inject(PLATFORM_ID) platformId: Object,
    private propertyNodeService: PropertyNodeService,
    private dragDropService: DragDropService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /**
   * Initializes the editor with custom schema and plugins
   * Sets up property nodes and drag-drop functionality
   */
  ngOnInit(): void {
    if (!this.isBrowser) return;

    const customSchema = new Schema({
      nodes: schema.spec.nodes.addToEnd('property', this.propertyNodeService.nodeSpec),
      marks: schema.spec.marks
    });

    this.editor = new Editor({
      schema: customSchema,
      nodeViews: {
        property: ((node: Node, view: any, getPos: (() => number) | boolean) => {
          if (typeof getPos !== 'function') return null;
          return this.propertyNodeService.createNodeView(node, view, getPos as () => number);
        }) as unknown as NodeViewConstructor
      },
      plugins: [
        this.dragDropService.createPlugin(),
        new Plugin({
          key: new PluginKey('selectionDebug'),
          state: {
            init: () => {},
            apply: (tr, value, oldState, newState) => {
              if (newState.selection instanceof NodeSelection && 
                  newState.selection.node.type.name === 'property') {
                console.log('Property node selected:', newState.selection.node);
              }
              // Update stats after each transaction
              this.updateStats(newState);
              this.updateRawView(newState);
            }
          }
        })
      ],
      history: true,
      keyboardShortcuts: true,
      inputRules: true
    });
  }

  /**
   * Updates editor statistics based on current state
   * Tracks total nodes and selected nodes
   * @param state Current editor state
   */
  private updateStats(state: any): void {
    let totalNodes = 0;
    let selectedNodes = 0;

    state.doc.descendants((node: Node) => {
      if (node.type.name === 'property') {
        totalNodes++;
        if (state.selection instanceof NodeSelection && 
            state.selection.node === node) {
          selectedNodes++;
        }
      }
    });

    this.stats = { totalNodes, selectedNodes };
  }

  /**
   * Updates the raw view of editor content
   * Shows simplified text representation of the document
   * @param state Current editor state
   */
  private updateRawView(state: any): void {
    const content: string[] = [];
    state.doc.descendants((node: Node, pos: number) => {
      if (node.type.name === 'property') {
        content.push(`${node.attrs['label']}`);
      } else if (node.text) {
        content.push(node.text);
      }
    });
    this.rawContent = content.join(' ');
  }

  /**
   * Inserts an operator at current cursor position
   * @param op Operator to insert
   */
  insertOperator(op: string): void {
    const view = this.editor.view;
    const { state } = view;
    view.dispatch(state.tr.insertText(op + ' '));
  }

  /**
   * Inserts a function at current cursor position
   * @param func Function to insert
   */
  insertFunction(func: string): void {
    const view = this.editor.view;
    const { state } = view;
    view.dispatch(state.tr.insertText(func + ' '));
  }

  /**
   * Cleans up editor resources on component destruction
   */
  ngOnDestroy(): void {
    if (this.isBrowser && this.editor) {
      this.editor.destroy();
    }
  }

  /**
   * Handles changes to editor content
   * Updates HTML content and statistics
   * @param html Updated HTML content
   */
  onChange(html: string): void {
    this.html = html;
    const state = this.editor.view.state;
    this.updateStats(state);
    this.updateRawView(state);
  }

  /**
   * Inserts a property node at current selection
   * Creates a new property node with selected attributes
   * @param event Select element change event
   */
  insertProperty(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const propertyId = select.value;
    if (!propertyId) return;

    const property = this.properties.find(p => p.id === propertyId);
    if (!property) return;

    const view = this.editor.view;
    const state = view.state;
    const node = state.schema.nodes['property'].create({
      id: property.id,
      label: property.label,
      value: property.value
    });

    view.updateState(state.apply(state.tr.replaceSelectionWith(node).scrollIntoView()));
    select.value = '';
  }
}

/**
 * Interface for property node data
 */
interface Property {
  label: string;
  id: string;
  value: string;
}

/**
 * Interface for tracking editor statistics
 */
interface EditorStats {
  totalNodes: number;
  selectedNodes: number;
}