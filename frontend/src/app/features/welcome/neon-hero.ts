import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-neon-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { --h-pink: #ff2e7e; --h-mint: #3dffb5; --h-cyan: #3df0ff; --h-deep: #3a2296; --h-slot: #18124a; --h-pink-2: #ff6fa5; --h-light: #efeaff; --h-pink-dark: #c4125a; --h-moon-2: #7b5cff; --h-panel-top: #3a2c9e; --h-hair: #2b1b66; --h-panel: #281e78; --h-eye: #1b1240; --h-sole: #150f42; --h-pink-glow: #ff4b91; --h-bar: #e3ddff; --h-moon-1: #c0b0ff; --h-ring: #a48cff; --h-label: #9a93c9; --h-hood-1: #8f63ff; --h-sleeve-l: #6b43ef; --h-sleeve-r: #5a36d8; --h-pocket: #5a35d4; --h-hood-2: #4a2bc4; --h-hair-2: #3d27a6; --h-shield-in: #37269f; --h-stripe: #352a9a; --h-pants-1: #30257c; --h-shield: #2a1d84; --h-pad-in: #271c74; --h-pants-r: #20185c; --h-pants-2: #1c1455; --h-wall: #1b1561; --h-pad: #18124d; }
    :host-context([data-theme=stealth]) { --h-pink: #ff5a1f; --h-mint: #c6ff3a; --h-cyan: #5cc8ff; --h-deep: #191c23; --h-slot: #0e1014; --h-pink-2: #ff8a3d; --h-light: #e6e8ee; --h-pink-dark: #c43a0e; --h-moon-2: #ff5a1f; --h-panel-top: #2a2e38; --h-hair: #1c1f26; --h-panel: #1a1d25; --h-eye: #0b0c10; --h-sole: #0e1014; --h-pink-glow: #ff6a2b; --h-bar: #d8dbe3; --h-moon-1: #ff8a3d; --h-ring: #ff7a3d; --h-label: #8a8fa0; --h-hood-1: #3a3f4c; --h-sleeve-l: #343844; --h-sleeve-r: #2c303b; --h-pocket: #2a2e38; --h-hood-2: #1f232c; --h-hair-2: #2a2d36; --h-shield-in: #242833; --h-stripe: #1f232c; --h-pants-1: #242833; --h-shield: #1a1d25; --h-pad-in: #1a1d25; --h-pants-r: #1a1d25; --h-pants-2: #14161d; --h-wall: #12141a; --h-pad: #0e1014; }
  `,
  host: { class: 'block absolute inset-x-0 pointer-events-none', style: 'top:calc(env(safe-area-inset-top) + 8px)' },
  template: `
    <svg class="block w-full h-auto" viewBox="0 30 360 390" aria-hidden="true">
      <defs>
        <radialGradient id="hMoon" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color: var(--h-moon-1)" stop-opacity=".34"/><stop offset=".65" style="stop-color: var(--h-moon-2)" stop-opacity=".14"/><stop offset="1" style="stop-color: var(--h-moon-2)" stop-opacity="0"/></radialGradient>
        <linearGradient id="hHood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color: var(--h-hood-1)"/><stop offset="1" style="stop-color: var(--h-hood-2)"/></linearGradient>
        <linearGradient id="hSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd9c0"/><stop offset="1" stop-color="#f0a283"/></linearGradient>
        <linearGradient id="hPants" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color: var(--h-pants-1)"/><stop offset="1" style="stop-color: var(--h-pants-2)"/></linearGradient>
        <radialGradient id="hPad" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color: var(--h-pink)" stop-opacity=".6"/><stop offset="1" style="stop-color: var(--h-pink)" stop-opacity="0"/></radialGradient>
        <linearGradient id="hBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" style="stop-color: var(--h-pink)" stop-opacity=".32"/><stop offset="1" style="stop-color: var(--h-pink)" stop-opacity="0"/></linearGradient>
        <radialGradient id="bubM" cx="35%" cy="30%" r="70%"><stop offset="0" style="stop-color: var(--h-mint)" stop-opacity=".38"/><stop offset="1" style="stop-color: var(--h-mint)" stop-opacity=".05"/></radialGradient>
        <radialGradient id="bubP" cx="35%" cy="30%" r="70%"><stop offset="0" style="stop-color: var(--h-pink-2)" stop-opacity=".4"/><stop offset="1" style="stop-color: var(--h-pink)" stop-opacity=".05"/></radialGradient>
        <radialGradient id="bubC" cx="35%" cy="30%" r="70%"><stop offset="0" style="stop-color: var(--h-cyan)" stop-opacity=".4"/><stop offset="1" style="stop-color: var(--h-cyan)" stop-opacity=".05"/></radialGradient>
        <filter id="hGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
    
      <g opacity=".6">
        <rect x="200" y="96" width="146" height="236" fill="var(--h-wall)"/>
        <g fill="var(--h-stripe)"><rect x="200" y="100" width="146" height="5"/><rect x="200" y="112" width="146" height="5"/><rect x="200" y="124" width="146" height="5"/><rect x="200" y="136" width="146" height="5"/><rect x="200" y="148" width="146" height="5"/><rect x="200" y="160" width="146" height="5"/><rect x="200" y="172" width="146" height="5"/><rect x="200" y="184" width="146" height="5"/><rect x="200" y="196" width="146" height="5"/><rect x="200" y="208" width="146" height="5"/><rect x="200" y="220" width="146" height="5"/><rect x="200" y="232" width="146" height="5"/><rect x="200" y="244" width="146" height="5"/><rect x="200" y="256" width="146" height="5"/><rect x="200" y="268" width="146" height="5"/><rect x="200" y="280" width="146" height="5"/><rect x="200" y="292" width="146" height="5"/><rect x="200" y="304" width="146" height="5"/><rect x="200" y="316" width="146" height="5"/></g>
      </g>
      <circle cx="180" cy="240" r="134" fill="url(#hMoon)"/>
      <circle cx="180" cy="240" r="120" fill="none" stroke="var(--h-ring)" stroke-opacity=".2"/>
    
      <g>
        <rect x="14" y="304" width="56" height="84" rx="6" fill="var(--h-panel)"/>
        <rect x="10" y="296" width="64" height="14" rx="5" fill="var(--h-panel-top)"/>
        <rect x="22" y="320" width="40" height="18" rx="3" fill="var(--h-slot)"/>
        <rect x="22" y="346" width="40" height="18" rx="3" fill="var(--h-slot)"/>
        <circle cx="30" cy="329" r="2.5" fill="var(--h-mint)"/><circle cx="38" cy="329" r="2.5" fill="var(--h-mint)" opacity=".45"/><circle cx="30" cy="355" r="2.5" fill="var(--h-pink)"/>
        <rect x="290" y="304" width="56" height="84" rx="6" fill="var(--h-panel)"/>
        <rect x="286" y="296" width="64" height="14" rx="5" fill="var(--h-panel-top)"/>
        <rect x="298" y="320" width="40" height="18" rx="3" fill="var(--h-slot)"/>
        <rect x="298" y="346" width="40" height="18" rx="3" fill="var(--h-slot)"/>
        <circle cx="330" cy="329" r="2.5" fill="var(--h-pink)"/><circle cx="322" cy="329" r="2.5" fill="var(--h-pink)" opacity=".45"/><circle cx="330" cy="355" r="2.5" fill="var(--h-cyan)"/>
      </g>
    
      <g transform="translate(22 108)">
        <path d="M30 0 L58 10 V34 C58 52 46 64 30 70 C14 64 2 52 2 34 V10Z" fill="var(--h-shield)" stroke="var(--h-mint)" stroke-opacity=".75" stroke-width="2"/>
        <path d="M30 8 L50 15 V34 C50 47 41 56 30 61 C19 56 10 47 10 34 V15Z" fill="var(--h-shield-in)"/>
        <g fill="none" stroke="var(--h-mint)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="19" y="22" width="22" height="22" rx="6"/><path d="M24.5 31a5.5 5.5 0 0 1 11 0"/><path d="M30 31l2.4-2.4"/></g>
      </g>
    
      <g transform="translate(232 100)">
        <rect width="94" height="58" rx="10" fill="var(--h-cyan)" fill-opacity=".07" stroke="var(--h-cyan)" stroke-opacity=".5"/>
        <text x="10" y="17" font-family="Barlow" font-weight="700" font-size="8.5" letter-spacing="1.5" fill="var(--h-label)">WEIGHT</text>
        <text x="10" y="40" font-family="Oswald" font-weight="600" font-size="21" fill="#fff">88.2</text>
        <text x="52" y="40" font-family="Oswald" font-weight="600" font-size="10" fill="var(--h-pink-2)">▼4.2</text>
        <path d="M10 50 L24 47 L36 49 L50 43 L62 45 L84 34" fill="none" stroke="var(--h-pink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#hGlow)"/>
        <circle cx="84" cy="34" r="2.6" fill="#fff"/>
      </g>
    
      <path d="M126 236 L234 236 L276 392 L84 392Z" fill="url(#hBeam)"/>
      <ellipse cx="180" cy="394" rx="152" ry="30" fill="var(--h-pad)"/>
      <ellipse cx="180" cy="394" rx="152" ry="30" fill="url(#hPad)" opacity=".55"/>
      <ellipse cx="180" cy="392" rx="128" ry="23" fill="none" stroke="var(--h-pink)" stroke-opacity=".8" stroke-width="2" filter="url(#hGlow)"/>
      <ellipse cx="180" cy="392" rx="98" ry="17" fill="var(--h-pad-in)"/>
      <ellipse cx="180" cy="392" rx="98" ry="17" fill="none" stroke="var(--h-cyan)" stroke-opacity=".55" stroke-width="1.5"/>
      <ellipse cx="180" cy="386" rx="48" ry="8" fill="#000" opacity=".35"/>
    
      <g class="float">
        <circle cx="62" cy="212" r="28" fill="url(#bubM)" stroke="var(--h-mint)" stroke-opacity=".55" stroke-width="1.5"/>
        <path d="M46 202 A18 18 0 0 1 58 191" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <g transform="translate(62 214)">
          <path d="M0 -6 C-10 -14 -20 -6 -18 6 C-16 16 -8 20 0 17 C8 20 16 16 18 6 C20 -6 10 -14 0 -6Z" fill="#ff4b6e"/>
          <path d="M-11 -3 C-14 1 -14 6 -12 9" stroke="#fff" stroke-opacity=".6" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M0 -6 C0 -12 2 -15 4 -17" stroke="#7a3b2a" stroke-width="2" fill="none" stroke-linecap="round"/>
          <path d="M2 -12 C8 -19 14 -17 15 -13 C10 -9 5 -10 2 -12Z" fill="var(--h-mint)"/>
        </g>
      </g>
      <g class="float2">
        <circle cx="302" cy="226" r="30" fill="url(#bubP)" stroke="var(--h-pink)" stroke-opacity=".6" stroke-width="1.5"/>
        <path d="M284 214 A20 20 0 0 1 298 202" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <g transform="translate(302 227) rotate(-22)">
          <rect x="-13" y="-2.5" width="26" height="5" rx="2" fill="var(--h-bar)"/>
          <rect x="-21" y="-11" width="7" height="22" rx="2.5" fill="var(--h-pink)"/><rect x="-25" y="-7" width="4" height="14" rx="1.5" fill="var(--h-pink-dark)"/>
          <rect x="14" y="-11" width="7" height="22" rx="2.5" fill="var(--h-pink)"/><rect x="21" y="-7" width="4" height="14" rx="1.5" fill="var(--h-pink-dark)"/>
        </g>
      </g>
      <g class="float">
        <circle cx="92" cy="300" r="20" fill="url(#bubC)" stroke="var(--h-cyan)" stroke-opacity=".6" stroke-width="1.5"/>
        <path d="M92 289 C97 296 100 300 100 304 A8 8 0 0 1 84 304 C84 300 87 296 92 289Z" fill="var(--h-cyan)"/>
        <path d="M88 303 A4 4 0 0 0 91 307" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </g>
    
      <g>
        <path d="M152 292 L180 292 L177 368 L157 368Z" fill="url(#hPants)"/>
        <path d="M180 292 L208 292 L203 368 L183 368Z" fill="var(--h-pants-r)"/>
        <rect x="156" y="358" width="22" height="10" rx="3" fill="var(--h-sole)"/><rect x="182" y="358" width="22" height="10" rx="3" fill="var(--h-sole)"/>
        <path d="M150 380 L150 373 C150 367 154 365 158 365 L174 365 C177 365 178 368 178 371 L178 380Z" fill="var(--h-pink)"/>
        <path d="M182 380 L182 371 C182 368 183 365 186 365 L202 365 C206 365 210 367 210 373 L210 380Z" fill="var(--h-pink)"/>
        <rect x="149" y="378" width="30" height="5" rx="2" fill="#fff"/><rect x="181" y="378" width="30" height="5" rx="2" fill="#fff"/>
        <path d="M156 372 L170 370 M188 370 L202 372" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    
        <rect x="173" y="180" width="14" height="18" rx="5" fill="#e3937a"/>
        <path d="M144 214 C144 202 152 196 164 194 L196 194 C208 196 216 202 216 214 L212 288 C212 294 208 298 202 298 L158 298 C152 298 148 294 148 288Z" fill="url(#hHood)"/>
        <rect x="148" y="286" width="64" height="12" rx="5" fill="var(--h-deep)"/>
        <path d="M160 262 L200 262 L204 282 L156 282Z" fill="var(--h-pocket)"/>
        <path d="M164 194 C168 208 192 208 196 194 C190 201 170 201 164 194Z" fill="var(--h-deep)"/>
        <path d="M174 204 L172 228 M186 204 L188 228" stroke="var(--h-light)" stroke-width="2" stroke-linecap="round"/>
        <circle cx="172" cy="230" r="2" fill="var(--h-light)"/><circle cx="188" cy="230" r="2" fill="var(--h-light)"/>
        <path d="M180 236 l9 3.2 v6.5 c0 5.5 -4.2 8.8 -9 10.8 c-4.8 -2 -9 -5.3 -9 -10.8 v-6.5z" fill="var(--h-pink)"/>
    
        <path d="M152 206 L128 176 L132 142" fill="none" stroke="var(--h-sleeve-l)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M131.6 151 L132 141" stroke="var(--h-deep)" stroke-width="22.5"/>
        <circle cx="132" cy="128" r="12.5" fill="url(#hSkin)"/>
        <path d="M124.5 124 h15 M124.5 130 h15" stroke="#d98468" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M208 206 L222 246 L216 280" fill="none" stroke="var(--h-sleeve-r)" stroke-width="21" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M216.5 276 L216 285" stroke="var(--h-deep)" stroke-width="21"/>
        <circle cx="216" cy="293" r="10" fill="url(#hSkin)"/>
    
        <ellipse cx="158" cy="164" rx="5" ry="7" fill="#f0a283"/>
        <ellipse cx="202" cy="164" rx="5" ry="7" fill="#f0a283"/>
        <ellipse cx="180" cy="160" rx="22" ry="25" fill="url(#hSkin)"/>
        <path d="M157 160 C152 136 166 122 184 122 C202 122 210 136 204 158 C200 148 192 143 182 144 C172 142 162 148 157 160Z" fill="var(--h-hair)"/>
        <path d="M166 131 C172 113 196 108 208 122 C198 118 186 121 177 133Z" fill="var(--h-hair-2)"/>
        <path d="M158 146 C170 140 190 140 203 146 L202 153 C190 147 170 147 159 153Z" fill="var(--h-pink)"/>
        <ellipse cx="172" cy="164" rx="2.8" ry="3.6" fill="var(--h-eye)"/><ellipse cx="188" cy="164" rx="2.8" ry="3.6" fill="var(--h-eye)"/>
        <circle cx="173" cy="162.5" r="1" fill="#fff"/><circle cx="189" cy="162.5" r="1" fill="#fff"/>
        <path d="M167 157 q5 -3 9 0 M184 157 q5 -3 9 0" stroke="var(--h-hair)" stroke-width="2" stroke-linecap="round" fill="none"/>
        <path d="M172 174 Q180 182 188 174 Q180 177.5 172 174Z" fill="#fff" stroke="#9b3f4a" stroke-width="1.6" stroke-linejoin="round"/>
        <ellipse cx="166" cy="172" rx="4" ry="2.2" fill="#ff6f9c" opacity=".45"/><ellipse cx="194" cy="172" rx="4" ry="2.2" fill="#ff6f9c" opacity=".45"/>
    
        <g fill="none" stroke-width="2.4" stroke-linecap="round" filter="url(#hGlow)">
          <g stroke="var(--h-cyan)">
            <path d="M160 150 C157 160 159 172 166 181"/>
            <path d="M141 212 L117 182 L121 146"/>
            <path d="M145 222 L149 284"/>
            <path d="M153 298 L158 364"/>
            <path d="M121 122 A12.5 12.5 0 0 0 122 136"/>
          </g>
          <g stroke="var(--h-pink-glow)">
            <path d="M200 150 C203 160 201 172 194 181"/>
            <path d="M219 212 L233 246 L227 280"/>
            <path d="M215 222 L211 284"/>
            <path d="M207 298 L203 364"/>
          </g>
        </g>
        <g fill="var(--h-mint)"><path d="M108 118 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2z"/></g>
        <g fill="var(--h-pink-2)"><path d="M152 108 l1.5 -4.5 l1.5 4.5 l4.5 1.5 l-4.5 1.5 l-1.5 4.5 l-1.5 -4.5 l-4.5 -1.5z"/></g>
      </g>
      <g fill="#fff"><circle cx="120" cy="96" r="1.4" opacity=".5"/><circle cx="246" cy="270" r="1.2" opacity=".5"/><circle cx="40" cy="250" r="1.2" opacity=".4"/><circle cx="330" cy="280" r="1" opacity=".5"/></g>
    </svg>
  `
})
export class NeonHero { }
