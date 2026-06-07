import { Routes } from '@angular/router';
import { DraftProjectionComponent } from './draft-projection/draft-projection';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { LandingComponent } from './landing/landing';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'draft-projection', component: DraftProjectionComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
];
