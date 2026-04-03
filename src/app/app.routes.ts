import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';

export const routes: Routes = [
  { path: '', redirectTo: 'draft-projection', pathMatch: 'full' },
  { path: 'draft-projection', component: DraftProjectionComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
];
