import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BodyKind = 'now' | 'goal' | 'slim' | 'buff';

const BODIES: Record<BodyKind, { head: number; path: string }> = {
  now: { head: 15, path: 'M67 36 L67 45 C72 49 80 51 87 53 C94 55 98 60 99 69 C102 84 103 100 104 114 C105 128 106 140 105 150 C108 154 108 164 104 168 C101 170 98 166 98 160 C97 152 96 142 95 130 C94 120 93 108 92 94 C91 86 90 80 88 76 C92 92 96 106 95 120 C94 132 92 138 91 148 C92 168 90 184 88 198 C89 210 88 224 84 240 C85 245 88 249 87 253 L68 253 C67 247 67 243 67 240 C67 224 67 212 66 198 C65 182 64 168 63 158 Q60 154 57 158 C56 168 55 182 54 198 C53 212 53 224 53 240 C53 243 53 247 52 253 L33 253 C32 249 35 245 36 240 C32 224 31 210 32 198 C30 184 28 168 29 148 C28 138 26 132 25 120 C24 106 28 92 32 76 C30 80 29 86 28 94 C27 108 26 120 25 130 C24 142 23 152 22 160 C22 166 19 170 16 168 C12 164 12 154 15 150 C14 140 15 128 16 114 C17 100 18 84 21 69 C22 60 26 55 33 53 C40 51 48 49 53 45 L53 36Z' },
  goal: { head: 14, path: 'M66 36 L66 44 C70 48 78 50 84 52 C90 54 94 58 95 66 C97 80 97 96 98 112 C99 126 101 138 101 148 C104 152 104 162 100 166 C97 168 94 164 94 158 C93 150 92 140 90 128 C89 118 88 106 87 92 C86 84 85 78 83 74 C84 92 81 108 79 120 C78 128 84 134 85 146 C86 166 84 182 82 196 C83 208 83 222 79 238 C80 244 84 248 83 252 L67 252 C66 246 66 242 66 238 C66 222 66 210 65 196 C64 180 63 164 62 154 Q60 150 58 154 C57 164 56 180 55 196 C54 210 54 222 54 238 C54 242 54 246 53 252 L37 252 C36 248 40 244 41 238 C37 222 37 208 38 196 C36 182 34 166 35 146 C36 134 42 128 41 120 C39 108 36 92 37 74 C35 78 34 84 33 92 C32 106 31 118 30 128 C28 140 27 150 26 158 C26 164 23 168 20 166 C16 162 16 152 19 148 C19 138 21 126 22 112 C23 96 23 80 25 66 C26 58 30 54 36 52 C42 50 50 48 54 44 L54 36Z' },
  slim: { head: 13.5, path: 'M65 36 L65 44 C68 47 74 49 79 51 C85 53 88 57 89 64 C90 78 90 94 91 110 C92 124 93 136 93 146 C96 150 96 160 92 164 C89 166 87 162 87 156 C86 148 86 138 85 126 C84 116 83 104 82 90 C81 82 81 77 79 73 C80 90 78 106 77 120 C77 128 80 134 81 146 C82 166 80 182 78 196 C79 208 79 222 76 238 C77 244 80 248 79 252 L66 252 C65 246 65 242 65 238 C65 222 65 210 64 196 C63 180 62 164 61.5 154 Q60 150 58.5 154 C58 164 57 180 56 196 C55 210 55 222 55 238 C55 242 55 246 54 252 L41 252 C40 248 43 244 44 238 C41 222 41 208 42 196 C40 182 38 166 39 146 C40 134 43 128 43 120 C42 106 40 90 41 73 C39 77 39 82 38 90 C37 104 36 116 35 126 C34 138 34 148 33 156 C33 162 31 166 28 164 C24 160 24 150 27 146 C27 136 28 124 29 110 C30 94 30 78 31 64 C32 57 35 53 41 51 C46 49 52 47 55 44 L55 36Z' },
  buff: { head: 14, path: 'M67 36 L67 43 C73 46 82 47 90 50 C99 53 104 60 104 70 C107 82 108 96 106 110 C106 124 106 136 104 148 C107 152 107 162 103 166 C100 168 97 164 97 158 C96 150 95 140 94 130 C93 120 93 108 92 96 C91 86 90 80 87 76 C88 90 84 106 80 120 C79 128 85 134 87 146 C89 166 87 182 84 196 C86 208 86 222 81 238 C82 244 86 248 85 252 L67 252 C66 246 66 242 66 238 C66 222 66 210 65 196 C64 180 63 164 62 154 Q60 150 58 154 C57 164 56 180 55 196 C54 210 54 222 54 238 C54 242 54 246 53 252 L35 252 C34 248 38 244 39 238 C34 222 34 208 36 196 C33 182 31 166 33 146 C35 134 41 128 40 120 C36 106 32 90 33 76 C30 80 29 86 28 96 C27 108 27 120 26 130 C25 140 24 150 23 158 C23 164 20 168 17 166 C13 162 13 152 16 148 C14 136 14 124 14 110 C12 96 13 82 16 70 C16 60 21 53 30 50 C38 47 47 46 53 43 L53 36Z' }
};

const FILLS: Record<string, [string, string, string]> = {
  dim: ['#8f86d8', '#2c2380', 'rgba(140,130,230,.55)'],
  accent: ['var(--accent-light)', 'var(--accent)', 'rgba(var(--accent-rgb),.75)'],
  cyan: ['#9ffaff', 'var(--accent-2)', 'rgba(var(--accent-2-rgb),.75)'],
  ok: ['color-mix(in srgb, var(--ok) 50%, white)', 'var(--ok)', 'rgba(var(--ok-rgb),.6)']
};

let seq = 0;

@Component({
  selector: 'app-silhouette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-block;line-height:0', '[style.filter]': "'drop-shadow(0 0 ' + (glow() ? 7 : 4) + 'px ' + f()[2] + ')'" },
  template: `
    <svg viewBox="0 0 120 260" [attr.width]="height() * 120 / 260" [attr.height]="height()">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" [attr.stop-color]="f()[0]"/><stop offset="1" [attr.stop-color]="f()[1]"/></linearGradient>
        <pattern [attr.id]="pid" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.3" fill="#fff" opacity=".22"/></pattern>
      </defs>
      <circle cx="60" cy="22" [attr.r]="body().head" [attr.fill]="'url(#' + gid + ')'"/>
      <path [attr.d]="body().path" [attr.fill]="'url(#' + gid + ')'"/>
      @if (scan()) {
        <circle cx="60" cy="22" [attr.r]="body().head" [attr.fill]="'url(#' + pid + ')'"/>
        <path [attr.d]="body().path" [attr.fill]="'url(#' + pid + ')'"/>
      }
    </svg>
  `
})
export class Silhouette {
  readonly kind = input<BodyKind>('goal');
  readonly tone = input<'dim' | 'accent' | 'cyan' | 'ok'>('accent');
  readonly height = input(150);
  readonly scan = input(false);
  readonly glow = input(true);
  protected readonly gid = `sil${++seq}`;
  protected readonly pid = `silp${seq}`;
  protected readonly body = computed(() => BODIES[this.kind()]);
  protected readonly f = computed(() => FILLS[this.tone()]);
}
