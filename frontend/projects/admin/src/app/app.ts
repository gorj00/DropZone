import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from './core/toast';

@Component({
  selector: 'adm-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
    @if (toast.message(); as m) {
      <div class="toast" [class.err]="m.error" role="status">{{ m.text }}</div>
    }
  `
})
export class App {
  protected readonly toast = inject(Toast);
}
