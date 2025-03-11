import { Component, OnInit, OnDestroy, ViewEncapsulation, PLATFORM_ID, Inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Schema, Node } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { isPlatformBrowser } from '@angular/common';

import { PropertyNodeService } from '../ngx-editor/property-node.service';
import { DragDropService } from '../ngx-editor/drag-drop.service';
import { SyntaxHighlightService } from './syntax-highlight.service';

interface EditorStats {
  totalNodes: number;
  selectedNodes: number;
}

interface Property {
  label: string;
  id: string;
  value: string;
}

@Component({
  selector: 'app-prosemirror-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
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
        <div #editorContainer class="prosemirror-editor"></div>

        <div class="editor-stats">
          <div>Total Nodes: {{stats.totalNodes}}</div>
          <div>Selected Nodes: {{stats.selectedNodes}}</div>
        </div>

        <div class="raw-view">
          <h4>Raw View</h4>
          <pre>{{rawContent}}</pre>
        </div>

        <div class="error-panel" *ngIf="syntaxErrors.length > 0">
          <h4>Syntax Errors</h4>
          <ol>
            <li *ngFor="let error of syntaxErrors">
              {{error.message}}
            </li>
          </ol>
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

    .error-panel {
      padding: 1rem;
      background: #ffebee;
      border-radius: 4px;
      margin-top: 1rem;
    }

    .error-panel h4 {
      margin: 0 0 0.5rem 0;
      font-size: 14px;
      color: #c62828;
    }

    .error-panel ol {
      margin: 0;
      padding-left: 1.5rem;
    }

    .error-panel li {
      color: #d32f2f;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 0.25rem;
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

    .prosemirror-editor {
      min-height: 200px;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      position: relative;
    }

    .prosemirror-editor.drag-active {
      background: #f5f5f5;
      border-color: #1976d2;
    }

    .prosemirror-editor span.property-node {
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

    .prosemirror-editor span.property-node.ProseMirror-selectednode {
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

    .prosemirror-editor::before,
    .prosemirror-editor::after {
      content: '';
      display: block;
      height: 8px;
    }

    /* Syntax highlighting styles */
    .syntax-operator {
      color: #d73a49;
      font-weight: bold;
    }
    
    .syntax-function {
      color: #6f42c1;
      font-weight: bold;
    }
    
    .syntax-property {
      color: #005cc5;
      font-weight: bold;
    }
    
    .syntax-number {
      color: #005cc5;
    }
    
    .syntax-bracket {
      color: #d73a49;
    }
    
    .bracket-match {
      background-color: rgba(25, 118, 210, 0.1);
      outline: 1px solid rgba(25, 118, 210, 0.5);
      border-radius: 2px;
    }
    
    .syntax-error {
      text-decoration: wavy underline #e53935;
      text-decoration-skip-ink: none;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ProsemirrorEditorComponent implements OnInit, OnDestroy {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;
  
  private editorView!: EditorView;
  private schema!: Schema;
  
  isBrowser: boolean;
  rawContent = '';
  stats: EditorStats = {
    totalNodes: 0,
    selectedNodes: 0
  };
  syntaxErrors: Array<{ message: string }> = [];

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
    private dragDropService: DragDropService,
    private syntaxHighlightService: SyntaxHighlightService
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    if (!this.isBrowser) return;

    // Set property labels for syntax highlighting
    this.syntaxHighlightService.setPropertyLabels(
      this.properties.map(p => p.label)
    );

    // Create schema with property node type
    this.schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { 
          group: 'block',
          content: 'inline*',
          parseDOM: [{ tag: 'p' }],
          toDOM: () => ['p', 0]
        },
        text: { group: 'inline' },
        property: this.propertyNodeService.nodeSpec
      },
      marks: {}
    });

    // Initialize editor state with plugins
    const state = EditorState.create({
      schema: this.schema,
      plugins: [
        history(),
        keymap(baseKeymap),
        this.dragDropService.createPlugin(),
        this.syntaxHighlightService.createPlugin(),
        new Plugin({
          key: new PluginKey('statsTracker'),
          state: {
            init: () => ({}),
            apply: (tr, value, oldState, newState) => {
              if (tr.selection !== oldState.selection || tr.docChanged) {
                this.updateStats(newState);
                this.updateRawView(newState);
              }
              return value;
            }
          }
        })
      ]
    });

    // Create editor view
    this.editorView = new EditorView(this.editorContainer.nativeElement, {
      state,
      nodeViews: {
        property: (node, view, getPos) => 
          this.propertyNodeService.createNodeView(node, view, getPos as () => number)
      },
      dispatchTransaction: (tr) => {
        const newState = this.editorView.state.apply(tr);
        this.editorView.updateState(newState);
        // Update syntax errors
        this.syntaxErrors = this.syntaxHighlightService.getErrors();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
  }

  private updateStats(state: EditorState): void {
    let totalNodes = 0;
    let selectedNodes = 0;

    state.doc.descendants((node) => {
      if (node.type.name === 'property') {
        totalNodes++;
        if (state.selection instanceof NodeSelection && 
            state.selection.node.type.name === 'property' &&
            state.selection.node === node) {
          selectedNodes++;
        }
      }
    });

    this.stats = { totalNodes, selectedNodes };
  }

  private updateRawView(state: EditorState): void {
    const content: string[] = [];
    state.doc.descendants((node) => {
      if (node.type.name === 'property') {
        content.push(`${node.attrs['label']} (${node.attrs['value']})`);
      } else if (node.isText) {
        content.push(node.text || '');
      }
    });
    this.rawContent = content.join(' ');
  }

  insertOperator(op: string): void {
    const { state } = this.editorView;
    this.editorView.dispatch(state.tr.insertText(op + ' '));
  }

  insertFunction(func: string): void {
    const { state } = this.editorView;
    this.editorView.dispatch(state.tr.insertText(func + ' '));
  }

  insertProperty(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const propertyId = select.value;
    if (!propertyId) return;

    const property = this.properties.find(p => p.id === propertyId);
    if (!property) return;

    const { state } = this.editorView;
    const node = state.schema.nodes['property'].create({
      id: property.id,
      label: property.label,
      value: property.value
    });

    this.editorView.dispatch(
      state.tr.replaceSelectionWith(node).scrollIntoView()
    );
    select.value = '';
  }
} 