/* Iconos propios (SVG): los símbolos de texto como ☰ ✕ ← se ven como un cuadro con rayas en algunos Android */
type P = { className?: string };
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;
export const IconMenu = ({ className }: P) => (<svg {...base} className={className}><path d="M4 7h16M4 12h16M4 17h16" /></svg>);
export const IconClose = ({ className }: P) => (<svg {...base} className={className}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconBack = ({ className }: P) => (<svg {...base} className={`${className ?? ''} rtl:rotate-180`}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
