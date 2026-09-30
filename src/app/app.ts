import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  readonly path: string;
  readonly label: string;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly navItems: readonly NavItem[] = [
    { path: '/why-timezones', label: 'Why Timezones?' },
    { path: '/how-dates-work', label: 'Dates in JS' },
    { path: '/dst', label: 'DST & Offsets' },
    { path: '/intl-api', label: 'Intl API' },
    { path: '/angular-dates', label: 'Angular & Dates' },
    { path: '/libraries', label: 'Libraries' },
    { path: '/switch-timezone', label: 'Switch Timezone' },
    { path: '/playground', label: 'Playground' },
    { path: '/sources', label: 'Sources' },
  ];
}
