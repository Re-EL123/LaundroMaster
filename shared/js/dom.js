export function $(sel, ctx=document) { return ctx.querySelector(sel); }
export function $all(sel, ctx=document) { return Array.from(ctx.querySelectorAll(sel)); }
export function el(tag, cls, text) { const e=document.createElement(tag); if (cls) e.className=cls; if (text) e.textContent=text; return e; }
export function safeText(t){ if(t==null) return ''; return String(t); }
