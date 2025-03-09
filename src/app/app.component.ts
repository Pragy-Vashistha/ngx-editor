import { Component, ElementRef, ViewChild, AfterViewInit, NgZone, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterOutlet } from '@angular/router';
import { EditorState, StateField, StateEffect, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, Decoration, WidgetType, DecorationSet, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { lineNumbers, highlightActiveLineGutter, highlightSpecialChars,
         drawSelection, dropCursor, rectangularSelection, crosshairCursor,
         highlightActiveLine, keymap as keymapSetup } from '@codemirror/view';
import { foldGutter, indentOnInput, syntaxHighlighting,
         defaultHighlightStyle, bracketMatching, foldKeymap } from '@codemirror/language';

interface Property {
  label: string;
  id: string;
  value: string;
}

interface PropertyWidget {
  id: string;        // Property ID from the properties array
  instanceId: string; // Unique ID for this specific widget instance
  label: string;
  value: string;
  range: { from: number; to: number };
}

class PropertyWidgetView extends WidgetType {
  constructor(private props: { label: string; value: string }) {
    super();
  }

  toDOM() {
    const wrapper = document.createElement('span');
    wrapper.className = 'property-node';
    wrapper.contentEditable = 'false';
    wrapper.draggable = false;
    wrapper.setAttribute('aria-label', `Property: ${this.props.label}, Value: ${this.props.value}`);
    
    const content = document.createElement('span');
    content.className = 'property-content';
    content.textContent = `${this.props.label} (${this.props.value})`;
    
    wrapper.appendChild(content);
    return wrapper;
  }

  override eq(other: PropertyWidgetView) {
    return other.props.label === this.props.label && other.props.value === this.props.value;
  }

  override ignoreEvent() {
    return true;
  }
}

// Generate a unique ID for each widget instance
function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 15);
}

const addPropertyWidgetEffect = StateEffect.define<{
  property: Property;
  instanceId: string;
  from: number;
  textLength: number;
}>();

// Field to track property widgets and their positions
const deletePropertyEffect = StateEffect.define<{ id: string }>(); // id here refers to instanceId

const propertyWidgetsField = StateField.define<PropertyWidget[]>({
  create: () => [],
  update: (widgets, tr) => {
    if (tr.docChanged) {
      widgets = widgets.map(w => ({
        ...w,
        range: {
          from: tr.changes.mapPos(w.range.from),
          to: tr.changes.mapPos(w.range.to)
        }
      }));
    }

    for (const effect of tr.effects) {
      if (effect.is(addPropertyWidgetEffect)) {
        const { property, from, textLength } = effect.value;
        widgets.push({
          id: property.id,
          instanceId: effect.value.instanceId,
          label: property.label,
          value: property.value,
          range: { from, to: from + textLength }
        });
      } else if (effect.is(deletePropertyEffect)) {
        widgets = widgets.filter(w => w.instanceId !== effect.value.id);
      }
    }
    return widgets;
  }
});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet],
  template: `
    <router-outlet></router-outlet>
    <div *ngIf="isCurrentRoute('/codemirror')" class="editor-container">
      <div class="toolbar">
        <select (change)="insertProperty($event)">
          <option value="">Insert Property...</option>
          <option *ngFor="let prop of properties" [value]="prop.label">{{prop.label}}</option>
        </select>
        <a class="nav-link" [routerLink]="['/ngx-editor']">Switch to NgxEditor</a>
      </div>
      <div #editor class="editor"></div>
    </div>
  `,
  styles: [`
    .nav-link {
      text-decoration: none;
      color: #1976d2;
      font-weight: 500;
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
    }
    .editor {
      flex: 1;
      border: 1px solid #ccc;
      border-radius: 4px;
      min-height: 300px;
    }
    :host ::ng-deep .property-node {
      display: inline-flex;
      align-items: center;
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 6px;
      margin: 0;
      border-radius: 4px;
      font-weight: 500;
      cursor: default;
      user-select: none;
      white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(25, 118, 210, 0.2);
      position: relative;
      z-index: 1;
    }
    :host ::ng-deep .property-atomic {
      background: rgba(25, 118, 210, 0.05);
      border-radius: 4px;
      pointer-events: none;
    }
    :host ::ng-deep .property-content {
      pointer-events: none;
    }
    :host ::ng-deep .cm-editor {
      height: 100%;
      min-height: 300px;
    }
    :host ::ng-deep .cm-scroller {
      font-family: monospace;
      line-height: 1.4;
    }
  `]
})
export class AppComponent implements AfterViewInit {
  @ViewChild('editor') private editorRef!: ElementRef;
  private editor?: EditorView;

  private isBrowser: boolean;

  constructor(
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }
  
  isCurrentRoute(route: string): boolean {
    if (typeof window !== 'undefined') {
      return window.location.pathname === route || 
        (route === '/codemirror' && window.location.pathname === '/');
    }
    return false;
  }

  properties: Property[] = [
    { label: 'temperature', id: '1', value: '25°C' },
    { label: 'speed', id: '2', value: '60 km/h' },
    { label: 'pressure', id: '3', value: '1013 hPa' }
  ];

  ngAfterViewInit() {
    // Only initialize editor in browser environment
    if (this.isBrowser) {
      // Initialize editor in NgZone to ensure proper Angular change detection
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.initializeEditor();
        });
      });
    }
  }

  private initializeEditor() {
    const propertyWidgetViewPlugin: ViewPlugin<{ decorations: DecorationSet }> = ViewPlugin.fromClass(class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.createDecorations(view.state);
      }

      update(update: { docChanged: boolean, state: EditorState, startState: EditorState }) {
        if (update.docChanged || update.state.field(propertyWidgetsField) !== update.startState.field(propertyWidgetsField)) {
          this.decorations = this.createDecorations(update.state);
        }
      }

      createDecorations(state: EditorState) {
        const widgets = state.field(propertyWidgetsField);
        return Decoration.set(widgets.map(widget => 
          Decoration.replace({
            widget: new PropertyWidgetView({ label: widget.label, value: widget.value }),
            inclusive: false,
            block: false,
            selectLeft: true,
            selectRight: true,
            stopEvent: () => true
          }).range(widget.range.from, widget.range.to)
        ));
      }
    }, {
      decorations: v => v.decorations,
      provide: plugin => [
        EditorView.atomicRanges.of(view => {
          const widgets = view.state.field(propertyWidgetsField);
          return Decoration.set(widgets.map(w => 
            Decoration.mark({
              class: 'property-atomic',
              inclusive: false,
              atomic: true,
              selectLeft: true,
              selectRight: true,
              side: 1
            }).range(w.range.from, w.range.to)
          ));
        }),
        EditorView.editorAttributes.of({
          class: 'property-editor'
        })
      ]
    });

    // Custom keymap to handle widget interaction
    // Handle widget interaction and keyboard navigation
    const preventWidgetEdit = keymap.of([
      {
        key: 'Mod-a',
        run: view => {
          const doc = view.state.doc;
          view.dispatch({ selection: { anchor: 0, head: doc.length } });
          return true;
        }
      },
      {
        key: 'Backspace',
        run: view => {
          const widgets = view.state.field(propertyWidgetsField);
          const pos = view.state.selection.main.from;
          
          console.log('[Backspace] Cursor position:', pos);
          console.log('[Backspace] Widgets:', widgets.map(w => ({ 
            id: w.instanceId, 
            label: w.label, 
            range: w.range,
            content: view.state.doc.sliceString(w.range.from, w.range.to)
          })));
          
          // Check if cursor is immediately after a widget
          const widgetBefore = widgets.find(w => w.range.to === pos);
          if (widgetBefore) {
            console.log('[Backspace] Prevented: Cursor immediately after widget', widgetBefore.label);
            return true;
          }
          
          // Check if cursor is inside a widget (should delete the whole widget)
          const widget = widgets.find(w => pos > w.range.from && pos <= w.range.to);
          if (widget) {
            const from = widget.range.from;
            const to = widget.range.to;
            const beforeSpace = from > 0 && view.state.doc.sliceString(from - 1, from) === ' ';
            const afterSpace = to < view.state.doc.length && view.state.doc.sliceString(to, to + 1) === ' ';
            
            console.log('[Backspace] Deleting widget:', {
              widget: widget.label,
              from,
              to,
              beforeSpace,
              afterSpace,
              content: view.state.doc.sliceString(from, to)
            });
            
            view.dispatch({
              effects: deletePropertyEffect.of({ id: widget.instanceId }),
              changes: { 
                from: beforeSpace ? from - 1 : from, 
                to: afterSpace ? to + 1 : to, 
                insert: '' 
              },
              selection: { anchor: beforeSpace ? from - 1 : from }
            });
            return true;
          }
          
          // Check if backspace would delete into a widget
          const wouldDeleteIntoWidget = widgets.some(w => pos - 1 >= w.range.from && pos - 1 < w.range.to);
          if (wouldDeleteIntoWidget) {
            console.log('[Backspace] Prevented: Would delete into widget');
            return true; // Prevent deletion into widget
          }
          
          console.log('[Backspace] Allowing normal behavior');
          return false; // Allow normal backspace behavior
        }
      },
      {
        key: 'Delete',
        run: view => {
          const widgets = view.state.field(propertyWidgetsField);
          const pos = view.state.selection.main.from;
          
          console.log('[Delete] Cursor position:', pos);
          console.log('[Delete] Widgets:', widgets.map(w => ({ 
            id: w.instanceId, 
            label: w.label, 
            range: w.range,
            content: view.state.doc.sliceString(w.range.from, w.range.to)
          })));
          
          // Check if cursor is immediately before a widget
          const widgetAfter = widgets.find(w => w.range.from === pos);
          if (widgetAfter) {
            console.log('[Delete] Prevented: Cursor immediately before widget', widgetAfter.label);
            return true;
          }
          
          // Check if cursor is inside a widget (should delete the whole widget)
          const widget = widgets.find(w => pos >= w.range.from && pos < w.range.to);
          if (widget) {
            const from = widget.range.from;
            const to = widget.range.to;
            const beforeSpace = from > 0 && view.state.doc.sliceString(from - 1, from) === ' ';
            const afterSpace = to < view.state.doc.length && view.state.doc.sliceString(to, to + 1) === ' ';
            
            console.log('[Delete] Deleting widget:', {
              widget: widget.label,
              from,
              to,
              beforeSpace,
              afterSpace,
              content: view.state.doc.sliceString(from, to)
            });
            
            view.dispatch({
              effects: deletePropertyEffect.of({ id: widget.instanceId }),
              changes: { 
                from: beforeSpace ? from - 1 : from, 
                to: afterSpace ? to + 1 : to, 
                insert: '' 
              },
              selection: { anchor: beforeSpace ? from - 1 : from }
            });
            return true;
          }
          
          // Check if delete would delete into a widget
          const wouldDeleteIntoWidget = widgets.some(w => pos + 1 > w.range.from && pos + 1 <= w.range.to);
          if (wouldDeleteIntoWidget) {
            console.log('[Delete] Prevented: Would delete into widget');
            return true; // Prevent deletion into widget
          }
          
          console.log('[Delete] Allowing normal behavior');
          return false; // Allow normal delete behavior
        }
      }
    ]);

    const editorConfig: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(false),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      propertyWidgetsField,
      propertyWidgetViewPlugin,
      preventWidgetEdit,
      EditorView.lineWrapping,
      EditorView.editable.of(true),
      keymap.of([...defaultKeymap, ...foldKeymap]),
      EditorState.tabSize.of(2),
      foldGutter()
    ];

    this.editor = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: editorConfig
      }),
      parent: this.editorRef.nativeElement
    });
  }

  insertProperty(event: Event) {
    if (!this.isBrowser) return;
    
    this.ngZone.run(() => {
      const select = event.target as HTMLSelectElement;
      const selectedLabel = select.value;
      if (!selectedLabel || !this.editor) return;

      const property = this.properties.find(p => p.label === selectedLabel);
      if (!property) return;

      const pos = this.editor.state.selection.main.head;
      const text = property.label;
      
      console.log('[InsertProperty] Starting insertion:', {
        property: property.label,
        cursorPos: pos,
        docLength: this.editor.state.doc.length
      });
      
      // Add spaces around the widget for better separation
      let insertPos = pos;
      const needsSpaceBefore = pos > 0 && this.editor.state.sliceDoc(pos - 1, pos) !== ' ' && this.editor.state.sliceDoc(pos - 1, pos) !== '\n';
      const needsSpaceAfter = pos < this.editor.state.doc.length && this.editor.state.sliceDoc(pos, pos + 1) !== ' ' && this.editor.state.sliceDoc(pos, pos + 1) !== '\n';
      
      console.log('[InsertProperty] Space analysis:', {
        needsSpaceBefore,
        needsSpaceAfter,
        charBefore: pos > 0 ? this.editor.state.sliceDoc(pos - 1, pos) : null,
        charAfter: pos < this.editor.state.doc.length ? this.editor.state.sliceDoc(pos, pos + 1) : null
      });
      
      const insertText = `${needsSpaceBefore ? ' ' : ''}${text}${needsSpaceAfter ? ' ' : ''}`;
      const from = insertPos + (needsSpaceBefore ? 1 : 0);
      
      console.log('[InsertProperty] Preparing transaction:', {
        insertText,
        insertPos,
        from,
        finalCursorPos: from + text.length + (needsSpaceAfter ? 1 : 0)
      });
      
      const transaction = this.editor.state.update({
        changes: { from: insertPos, insert: insertText },
        effects: addPropertyWidgetEffect.of({
          property,
          instanceId: generateUniqueId(),
          from,
          textLength: text.length
        }),
        selection: { anchor: from + text.length + (needsSpaceAfter ? 1 : 0) },
        scrollIntoView: true
      });
      
      this.editor.dispatch(transaction);
      this.editor.focus();
      select.value = '';
      
      // Ensure proper widget rendering
      requestAnimationFrame(() => {
        console.log('[InsertProperty] Widget rendered');
        this.editor?.dispatch({
          effects: EditorView.announce.of('Property widget inserted')
        });
      });
    });
  }
}
