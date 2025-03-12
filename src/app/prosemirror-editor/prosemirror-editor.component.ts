import { Component, OnInit, OnDestroy, ViewEncapsulation, PLATFORM_ID, Inject, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Schema, Node, Slice, DOMSerializer, DOMParser } from 'prosemirror-model';
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

        <div class="toolbar-group">
          <button (click)="loadDemoContent()" class="toolbar-button">
            Load Demo Content
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
          <h4>JSON View</h4>
          <pre>{{jsonContent}}</pre>
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
    /* Context Menu Styles */
    .context-menu {
      min-width: 120px;
      border-radius: 4px;
      background: #fff;
      border: 1px solid #ccc;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
      padding: 8px 0;
    }
    
    .context-menu-item {
      font-size: 14px;
      color: #333;
      padding: 4px 16px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .context-menu-item:hover {
      background-color: #f0f0f0;
    }
    
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
  private contextMenuElement: HTMLElement | null = null;
  
  isBrowser: boolean;
  rawContent = '';
  jsonContent = '{}';
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
    private syntaxHighlightService: SyntaxHighlightService,
    private renderer: Renderer2
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
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          // Prevent default browser context menu
          event.preventDefault();
          
          // Check if we're right-clicking on a property node
          const target = event.target as HTMLElement;
          const propertyNode = target.closest('.property-node') as HTMLElement;
          
          if (propertyNode) {
            // Find the position of the node in the document
            const pos = this.findNodePosition(view, propertyNode);
            if (pos !== null) {
              // Select the node before showing the context menu
              const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos));
              view.dispatch(tr);
            }
          }
          
          // Show our custom context menu
          this.showContextMenu(event, view);
          return true;
        }
      }
    });
    
    // Add a global click listener to close the context menu when clicking outside
    if (typeof window !== 'undefined') {
      this.renderer.listen('document', 'click', (event) => {
        this.closeContextMenu();
      });
    }
  }

  ngOnDestroy(): void {
    if (this.editorView) {
      this.editorView.destroy();
    }
    this.closeContextMenu();
  }

  /**
   * Shows a custom context menu at the specified position
   * @param event The mouse event that triggered the context menu
   * @param view The editor view
   */
  /**
   * Finds the position of a property node in the document
   * @param view The editor view
   * @param domNode The DOM node to find
   * @returns The position of the node or null if not found
   */
  private findNodePosition(view: EditorView, domNode: HTMLElement): number | null {
    // Get the data-id attribute from the property node
    const nodeId = domNode.getAttribute('data-id');
    if (!nodeId) return null;
    
    let foundPos: number | null = null;
    
    // Search through the document for the node with matching id
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'property' && node.attrs['id'] === nodeId) {
        foundPos = pos;
        return false; // Stop searching
      }
      return true; // Continue searching
    });
    
    return foundPos;
  }

  private showContextMenu(event: MouseEvent, view: EditorView): void {
    // Close any existing context menu
    this.closeContextMenu();
    
    // Create context menu element
    const contextMenu = this.renderer.createElement('div');
    this.renderer.addClass(contextMenu, 'context-menu');
    this.renderer.setStyle(contextMenu, 'position', 'absolute');
    this.renderer.setStyle(contextMenu, 'left', `${event.pageX}px`);
    this.renderer.setStyle(contextMenu, 'top', `${event.pageY}px`);
    this.renderer.setStyle(contextMenu, 'z-index', '1000');
    
    // Determine which options to show based on selection
    const { state } = view;
    const hasSelection = state.selection.from !== state.selection.to;
    const hasNodeSelection = state.selection instanceof NodeSelection;
    
    // Check if we have a property node selected
    const isPropertyNodeSelected = hasNodeSelection && 
                                 (state.selection as NodeSelection).node.type.name === 'property';
    
    // Always show all options, but disable them if not applicable
    this.addMenuItem(contextMenu, 'Delete', () => this.deleteSelection(view), !hasSelection && !hasNodeSelection);
    this.addMenuItem(contextMenu, 'Copy', () => this.copySelection(view), !hasSelection && !hasNodeSelection);
    this.addMenuItem(contextMenu, 'Cut', () => this.cutSelection(view), !hasSelection && !hasNodeSelection);
    this.addMenuItem(contextMenu, 'Paste', () => this.pasteSelection(view), false); // Paste is always enabled
    
    // Add to console for debugging
    if (isPropertyNodeSelected) {
      console.log('Property node selected:', (state.selection as NodeSelection).node.attrs);
    }
    
    // Add to DOM
    this.renderer.appendChild(document.body, contextMenu);
    this.contextMenuElement = contextMenu;
    
    // Prevent the menu from being closed immediately by the global click handler
    setTimeout(() => {
      if (this.contextMenuElement) {
        this.renderer.listen(this.contextMenuElement, 'click', (e) => {
          e.stopPropagation();
        });
      }
    }, 0);
  }
  
  /**
   * Adds a menu item to the context menu
   * @param contextMenu The context menu element
   * @param label The label for the menu item
   * @param action The action to perform when clicked
   * @param disabled Whether the menu item should be disabled
   */
  private addMenuItem(contextMenu: HTMLElement, label: string, action: () => void, disabled: boolean = false): void {
    const menuItem = this.renderer.createElement('div');
    this.renderer.addClass(menuItem, 'context-menu-item');
    
    if (disabled) {
      this.renderer.addClass(menuItem, 'disabled');
      this.renderer.setStyle(menuItem, 'opacity', '0.5');
      this.renderer.setStyle(menuItem, 'cursor', 'default');
    }
    
    const text = this.renderer.createText(label);
    this.renderer.appendChild(menuItem, text);
    
    if (!disabled) {
      this.renderer.listen(menuItem, 'click', (event) => {
        event.stopPropagation();
        action();
        this.closeContextMenu();
      });
    }
    
    this.renderer.appendChild(contextMenu, menuItem);
  }
  
  /**
   * Closes the context menu if it's open
   */
  private closeContextMenu(): void {
    if (this.contextMenuElement) {
      this.renderer.removeChild(document.body, this.contextMenuElement);
      this.contextMenuElement = null;
    }
  }
  
  /**
   * Deletes the selected content
   * @param view The editor view
   */
  private deleteSelection(view: EditorView): void {
    const { state, dispatch } = view;
    
    // Handle node selection (for property nodes)
    if (state.selection instanceof NodeSelection) {
      const { from, to } = state.selection;
      dispatch(state.tr.delete(from, to));
      return;
    }
    
    // Handle text selection
    const { from, to } = state.selection;
    if (from !== to) {
      dispatch(state.tr.delete(from, to));
    }
  }
  
  /**
   * Copies the selected content to the clipboard
   * @param view The editor view
   */
  private copySelection(view: EditorView): void {
    const { state } = view;
    
    try {
      let slice;
      let text;
      
      // Handle node selection (for property nodes)
      if (state.selection instanceof NodeSelection) {
        const node = state.selection.node;
        if (node.type.name === 'property') {
          // For property nodes, copy the label
          text = node.attrs['label'];
          
          // Create a slice with just this node
          const { from, to } = state.selection;
          slice = state.doc.slice(from, to);
        } else {
          return; // Unsupported node type
        }
      } else {
        // Handle text selection
        const { from, to } = state.selection;
        if (from === to) return; // Nothing selected
        
        slice = state.doc.slice(from, to);
        text = state.doc.textBetween(from, to, ' ');
      }
      
      // Serialize to HTML for rich text clipboard data
      const serializer = DOMSerializer.fromSchema(state.schema);
      const fragment = serializer.serializeFragment(slice.content);
      const tempDiv = document.createElement('div');
      tempDiv.appendChild(fragment);
      const html = tempDiv.innerHTML;
      
      // Use the Clipboard API if available
      if (navigator.clipboard && window.ClipboardItem) {
        const clipboardItems = [
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
          })
        ];
        navigator.clipboard.write(clipboardItems).catch(err => {
          console.error('Failed to copy with Clipboard API:', err);
          this.fallbackCopy(text);
        });
      } else {
        // Fallback for browsers without Clipboard API support
        this.fallbackCopy(text);
      }
    } catch (err) {
      console.error('Error during copy operation:', err);
    }
  }
  
  /**
   * Fallback copy method using execCommand
   * @param text The text to copy
   */
  private fallbackCopy(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    
    document.body.removeChild(textArea);
  }
  
  /**
   * Cuts the selected content (copy + delete)
   * @param view The editor view
   */
  private cutSelection(view: EditorView): void {
    // First copy the selection
    this.copySelection(view);
    
    // Then delete it
    this.deleteSelection(view);
  }
  
  /**
   * Pastes content from the clipboard
   * @param view The editor view
   */
  private pasteSelection(view: EditorView): void {
    const { state, dispatch } = view;
    
    try {
      if (navigator.clipboard) {
        // Try to read HTML content first
        navigator.clipboard.read().then(clipboardItems => {
          // Find HTML content if available
          const htmlItem = clipboardItems.find(item => item.types.includes('text/html'));
          
          if (htmlItem) {
            htmlItem.getType('text/html')
              .then(blob => blob.text())
              .then(html => {
                this.insertHtmlContent(view, html);
              })
              .catch(err => {
                console.error('Error getting HTML from clipboard:', err);
                this.fallbackPaste(view);
              });
          } else {
            // Try plain text
            navigator.clipboard.readText()
              .then(text => {
                if (text) {
                  dispatch(state.tr.insertText(text, state.selection.from));
                }
              })
              .catch(err => {
                console.error('Error getting text from clipboard:', err);
                this.fallbackPaste(view);
              });
          }
        }).catch(err => {
          console.error('Error reading from clipboard:', err);
          this.fallbackPaste(view);
        });
      } else {
        this.fallbackPaste(view);
      }
    } catch (err) {
      console.error('Error during paste operation:', err);
      this.fallbackPaste(view);
    }
  }
  
  /**
   * Inserts HTML content into the editor
   * @param view The editor view
   * @param html The HTML content to insert
   */
  private insertHtmlContent(view: EditorView, html: string): void {
    try {
      const { state, dispatch } = view;
      const parser = DOMParser.fromSchema(state.schema);
      
      // Parse the HTML content
      const container = document.createElement('div');
      container.innerHTML = html;
      
      const slice = parser.parseSlice(container);
      dispatch(state.tr.replaceSelection(slice));
    } catch (err) {
      console.error('Error inserting HTML content:', err);
      // Fallback to plain text insertion if HTML parsing fails
      const plainText = this.stripHtml(html);
      view.dispatch(view.state.tr.insertText(plainText, view.state.selection.from));
    }
  }
  
  /**
   * Fallback paste method using document.execCommand
   * @param view The editor view
   */
  private fallbackPaste(view: EditorView): void {
    // Focus the editor to ensure it receives the paste event
    view.focus();
    
    try {
      // Try to trigger a paste event
      document.execCommand('paste');
    } catch (err) {
      console.error('Fallback paste failed:', err);
    }
  }
  
  /**
   * Strips HTML tags from a string
   * @param html The HTML string to strip
   * @returns Plain text without HTML tags
   */
  private stripHtml(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }

  /**
   * Sets the editor content from a raw string expression and parameters from API
   * @param expression The raw string expression (e.g., "temperature + speed")
   * @param parameters List of parameters with IDs and names
   * @returns An object with success status and any validation errors
   */
  setEditorContentFromApi(expression: string, parameters: { Id: string; Name: string }[]): { success: boolean; errors?: string[] } {
    if (!this.isBrowser || !this.editorView) {
      return { success: false, errors: ['Editor not initialized'] };
    }
    
    // Validate that all property tokens exist in the parameters list
    const validationResult = this.validateExpression(expression, parameters);
    if (!validationResult.success) {
      return validationResult;
    }

    // Create a set of property names for quick lookup
    const propertyNames = new Set(parameters.map(p => p.Name));

    // Tokenize the expression (simple space-separated for now)
    const tokens = expression.split(/\s+/); // e.g., ["temperature", "+", "speed"]

    // Build inline nodes
    const inlineNodes = tokens.map(token => {
      if (propertyNames.has(token)) {
        const param = parameters.find(p => p.Name === token);
        if (param) {
          // Create a property node with only label and id (no value displayed)
          return this.schema.nodes['property'].create({
            id: param.Id,
            label: param.Name,
            value: '' // Value not displayed, set to empty
          });
        }
      }
      // Non-property tokens (e.g., operators) become text nodes
      return this.schema.text(token);
    }).filter(node => node); // Remove undefined nodes

    // Create paragraph and document nodes
    const paragraph = this.schema.nodes['paragraph'].create(null, inlineNodes);
    const doc = this.schema.nodes['doc'].create(null, [paragraph]);

    // Update editor state using a transaction
    const tr = this.editorView.state.tr;
    tr.replace(0, this.editorView.state.doc.content.size, new Slice(doc.content, 0, 0));
    this.editorView.dispatch(tr);
    
    return { success: true };
  }

  /**
   * Gets the editor content as a raw string expression
   * @returns A space-separated string of property labels and text content
   */
  getEditorContentAsString(): string {
    const content: string[] = [];
    this.editorView.state.doc.descendants((node) => {
      if (node.type.name === 'property') {
        content.push(node.attrs['label']); // Use label only
      } else if (node.isText) {
        content.push(node.text || '');
      }
    });
    return content.join(' '); // e.g., "temperature + speed"
  }

  /**
   * Gets the editor content as a JSON object for full state preservation
   * @returns JSON representation of the editor document
   */
  getEditorContentAsJson(): any {
    return this.editorView.state.doc.toJSON();
  }

  /**
   * Sets the editor content from a previously saved JSON state
   * @param json JSON representation of the editor document
   */
  setEditorContentFromJson(json: any): void {
    if (!this.isBrowser || !this.editorView) return;
    const doc = this.schema.nodeFromJSON(json);
    const tr = this.editorView.state.tr;
    tr.replace(0, this.editorView.state.doc.content.size, new Slice(doc.content, 0, 0));
    this.editorView.dispatch(tr);
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
        content.push(`${node.attrs['label']}`);
      } else if (node.isText) {
        content.push(node.text || '');
      }
    });
    this.rawContent = content.join(' ');
    
    // Update JSON content
    this.jsonContent = JSON.stringify(state.doc.toJSON(), null, 2);
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

  /**
   * Demonstrates how to use setEditorContentFromApi by loading a sample expression
   */
  loadDemoContent(): void {
    // Sample API data
    const apiExpression = "temperature + pressure";
    const apiParameters = [
      { Id: "1", Name: "temperature" },
      { Id: "3", Name: "pressure" }
    ];
    
    // Set editor content with API data and handle validation
    const result = this.setEditorContentFromApi(apiExpression, apiParameters);
    
    if (!result.success && result.errors) {
      console.error('Validation errors:', result.errors);
      // In a real application, you might want to display these errors to the user
      // For example: this.errorMessage = result.errors.join('\n');
    }
  }
  
  /**
   * Validates an expression to ensure all property tokens exist in the parameters list
   * @param expression The raw string expression to validate
   * @param parameters List of valid parameters with Id and Name
   * @returns Validation result with success status and any errors
   */
  validateExpression(expression: string, parameters: { Id: string; Name: string }[]): { success: boolean; errors?: string[] } {
    if (!expression || !parameters) {
      return { success: false, errors: ['Missing expression or parameters'] };
    }
    
    const errors: string[] = [];
    const propertyNames = new Set(parameters.map(p => p.Name));
    const operators = ['+', '-', '*', '/', '(', ')'];
    
    // Tokenize the expression
    const tokens = expression.split(/\s+/);
    
    // Check each token that's not an operator or number
    tokens.forEach(token => {
      // Skip operators and numbers
      if (operators.includes(token) || !isNaN(Number(token))) {
        return;
      }
      
      // Check if token is a valid parameter name
      if (!propertyNames.has(token)) {
        errors.push(`Property '${token}' not found in available properties`);
      }
    });
    
    return errors.length > 0 ? { success: false, errors } : { success: true };
  }
  
  /**
   * Validates that all properties in the editor exist in the provided parameters list
   * @param parameters List of valid parameters with Id and Name
   * @returns Validation result with success status and any errors
   */
  validateEditorContent(parameters: { Id: string; Name: string }[]): { success: boolean; errors?: string[] } {
    if (!this.editorView) {
      return { success: false, errors: ['Editor not initialized'] };
    }
    
    const errors: string[] = [];
    const propertyNames = new Set(parameters.map(p => p.Name));
    
    // Check each property node in the document
    this.editorView.state.doc.descendants((node) => {
      if (node.type.name === 'property') {
        const propertyLabel = node.attrs['label'];
        
        if (!propertyNames.has(propertyLabel)) {
          errors.push(`Property '${propertyLabel}' not found in available properties`);
        }
      }
    });
    
    return errors.length > 0 ? { success: false, errors } : { success: true };
  }
} 