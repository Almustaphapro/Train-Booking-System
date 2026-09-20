export default function RailIllustration() {
  return <svg className="rail-illustration" viewBox="0 0 620 440" fill="none" aria-hidden="true">
    <defs><linearGradient id="rail-sky" x1="100" y1="0" x2="520" y2="440" gradientUnits="userSpaceOnUse"><stop stopColor="#286e55"/><stop offset="1" stopColor="#153f33"/></linearGradient><linearGradient id="rail-body" x1="70" y1="180" x2="490" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#faf9e9"/><stop offset="1" stopColor="#b8cdbb"/></linearGradient></defs>
    <rect width="620" height="440" rx="28" fill="url(#rail-sky)"/>
    <circle cx="462" cy="106" r="57" fill="#d6b871"/><circle cx="462" cy="106" r="79" stroke="#d6b871" strokeOpacity=".18"/>
    <path d="M0 265 104 141 203 240 320 167 470 294 620 199V440H0Z" fill="#3b7a5b"/>
    <path d="M0 323 115 253 228 297 343 239 501 299 620 272V440H0Z" fill="#235e46"/>
    <path d="m20 441 565-130M76 441l512-117" stroke="#729578" strokeWidth="8"/>
    <path d="m69 413 48 23m19-39 49 24m14-39 48 24m15-40 46 26m15-39 44 25m19-39 42 25m15-37 40 22m17-35 38 21" stroke="#99ae88" strokeWidth="5"/>
    <path d="M54 210c0-19 13-35 32-39l327-67c27-6 51 8 65 30l59 89c17 26 6 60-24 68L112 380c-26 6-52-13-53-40Z" fill="url(#rail-body)"/>
    <path d="m58 307 454-99 25 38-426 101-51 10Z" fill="#d0a64f"/>
    <path d="m359 146 52-11c18-4 33 3 43 19l25 39-109 24Z" fill="#163e35"/>
    <path d="m77 205 56-12 2 64-57 13Z M152 189l57-12 4 64-58 12Z M229 173l58-12 7 65-60 13Z M307 157l31-7 10 66-34 7Z" fill="#276352"/>
    <path d="m84 210 40-9m37-7 40-9m37-7 39-8m39-8 15-3" stroke="#75a38c" strokeWidth="3"/>
    <path d="m405 255 42-10m33-7 22-5" stroke="#faf6d8" strokeWidth="10" strokeLinecap="round"/>
    <path d="m99 349 301-67" stroke="#607c68" strokeWidth="4"/>
    <ellipse cx="141" cy="369" rx="19" ry="12" transform="rotate(-13 141 369)" fill="#123b30"/><ellipse cx="430" cy="303" rx="21" ry="12" transform="rotate(-13 430 303)" fill="#123b30"/>
    <path d="M30 91h108M48 108h58M514 373h72M541 389h43" stroke="#a2c1a4" strokeOpacity=".4" strokeWidth="2"/>
    <circle cx="43" cy="49" r="4" fill="#d6b871"/><path d="M55 49h83" stroke="#bad0bc" strokeOpacity=".6"/>
  </svg>;
}
