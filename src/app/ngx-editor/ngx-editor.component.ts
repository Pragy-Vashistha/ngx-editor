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

interface Property {
  label: string;
  id: string;
  value: string;
}

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
        <a class="nav-link" [routerLink]="['/codemirror']">Switch to CodeMirror</a>
      </div>
      <div *ngIf="!isBrowser" class="editor-placeholder">
        Loading editor...
      </div>
      <ngx-editor
        *ngIf="isBrowser"
        [editor]="editor"
        [ngModel]="html"
        (ngModelChange)="onChange($event)"
        [placeholder]="'Type here...'"
      ></ngx-editor>
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
    }
    .nav-link {
      text-decoration: none;
      color: #1976d2;
      font-weight: 500;
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
            }
          }
        })
      ],
      history: true,
      keyboardShortcuts: true,
      inputRules: true
    });
  }

  ngOnDestroy(): void {
    if (this.isBrowser && this.editor) {
      this.editor.destroy();
    }
  }

  onChange(html: string): void {
    this.html = html;
  }

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