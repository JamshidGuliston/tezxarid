import { Component, input } from '@angular/core';

@Component({
  selector: 'tx-app-header',
  standalone: true,
  template: `<header class="hdr"><span class="brand">{{ title() }}</span></header>`,
  styles: [`
    .hdr { background: #F60; color: #fff; text-align: center; font-weight: 700;
      padding: .85rem 1rem; font-size: 1.1rem; }
  `],
})
export class AppHeader {
  title = input<string>('Tezxarid');
}
