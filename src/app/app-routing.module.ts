import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { NgxEditorComponent } from './ngx-editor/ngx-editor.component';
import { ProsemirrorEditorComponent } from './prosemirror-editor/prosemirror-editor.component';

const routes: Routes = [
  { path: '', redirectTo: 'codemirror', pathMatch: 'full' },
  { path: 'codemirror', component: AppComponent },
  { path: 'ngx-editor', component: NgxEditorComponent },
  { path: 'prosemirror', component: ProsemirrorEditorComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
