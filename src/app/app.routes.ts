import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { NgxEditorComponent } from './ngx-editor/ngx-editor.component';
import { ProsemirrorEditorComponent } from './prosemirror-editor/prosemirror-editor.component';

export const routes: Routes = [
  { path: '', redirectTo: 'prosemirror', pathMatch: 'full' },
  { path: 'codemirror', component: AppComponent },
  { path: 'ngx-editor', component: NgxEditorComponent },
  { path: 'prosemirror', component: ProsemirrorEditorComponent }
];
