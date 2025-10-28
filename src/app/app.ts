import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MovieDashboardComponent } from './features/movie-dashboard/movie-dashboard';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MovieDashboardComponent],
  template: `
    <app-movie-dashboard />
    <router-outlet />
  `
})
export class App {}
