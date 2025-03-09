import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { NgxEditorComponent } from './ngx-editor/ngx-editor.component';

export const routes: Routes = [
  { path: '', redirectTo: 'codemirror', pathMatch: 'full' },
  { path: 'codemirror', component: AppComponent },
  { path: 'ngx-editor', component: NgxEditorComponent }
];
