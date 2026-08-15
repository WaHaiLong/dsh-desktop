'use strict';
// 主窗口 preload:在聊天界面右上角注入一个「设置」按钮。
//
// 入口原来只在应用菜单里,聊天页看不到;这里在页面右上角放一个带文字的
// 醒目按钮(⚙ 设置),点一下直达金蝶 MCP 设置窗口。只做 DOM 注入,不动
// dsh 网页逻辑。挂在 documentElement 并观察 childList,SPA 重渲染冲掉可
// 自动补回。

const { ipcRenderer } = require('electron');

const BTN_ID = 'dsh-settings-float-btn';

const GEAR_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">' +
  '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>' +
  '</svg>';

function injectButton() {
  if (document.getElementById(BTN_ID)) return;
  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.type = 'button';
  btn.title = '金蝶 MCP 设置';
  btn.setAttribute('aria-label', '金蝶 MCP 设置');
  btn.innerHTML = GEAR_SVG + '<span>设置</span>';
  btn.style.cssText = [
    'position: fixed',
    'top: 12px',
    'right: 12px',
    'z-index: 2147483647',
    'cursor: pointer',
    'color: #ffffff',
    'border: none',
    'border-radius: 8px',
    'padding: 8px 14px',
    'display: flex',
    'align-items: center',
    'gap: 6px',
    'font-size: 13px',
    'line-height: 1',
    'font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    'background: #2f6fed',
    'box-shadow: 0 2px 10px rgba(47,111,237,0.45)',
    'transition: background 0.15s ease',
  ].join(';');
  btn.onmouseenter = () => { btn.style.background = '#1e5bd6'; };
  btn.onmouseleave = () => { btn.style.background = '#2f6fed'; };
  btn.addEventListener('click', () => ipcRenderer.send('main:open-settings'));
  (document.documentElement || document.body).appendChild(btn);
}

function start() {
  injectButton();
  // SPA 若整体重挂 html 子节点导致按钮丢失,观察 childList 兜底补回。
  const root = document.documentElement || document.body;
  const obs = new MutationObserver(() => injectButton());
  obs.observe(root, { childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
