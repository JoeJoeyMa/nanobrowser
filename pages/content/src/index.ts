console.log('content script loaded');

// 全局变量类型声明
export {};
declare global {
  interface Window {
    __NANO_RECORDER_ENABLED__?: boolean;
    __NANO_RECORDER_LOGS__?: any[];
  }
}

(window as any).__NANO_RECORDER_ENABLED__ = false;
(window as any).__NANO_RECORDER_LOGS__ = [];

function getXPath(element: Element): string {
  if ((element as HTMLElement).id) return `id("${(element as HTMLElement).id}")`;
  if (element === document.body) return 'html/body';
  let ix = 0;
  const siblings = element.parentNode ? element.parentNode.childNodes : [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return getXPath(element.parentNode as Element) + '/' + element.tagName.toLowerCase() + `[${ix + 1}]`;
    }
    if (sibling.nodeType === 1 && (sibling as Element).tagName === element.tagName) {
      ix++;
    }
  }
  return '';
}

function getElementInfo(element: HTMLElement): Record<string, any> {
  let className = '';
  if (typeof element.className === 'string') {
    className = element.className;
  } else if (typeof (element as any).getAttribute === 'function') {
    className = (element as any).getAttribute('class') || '';
  }
  return {
    xpath: getXPath(element),
    cssSelector: className
      ? `${element.tagName.toLowerCase()}.${className.split(' ').join('.')}`
      : element.tagName.toLowerCase(),
    tagName: element.tagName,
    elementText: element.innerText || (element as HTMLInputElement).value || '',
    attributes: Object.fromEntries(Array.from(element.attributes || []).map(attr => [attr.name, attr.value])),
  };
}

function recordLog(log: any) {
  if (!(window as any).__NANO_RECORDER_ENABLED__) return;
  (window as any).__NANO_RECORDER_LOGS__.push(log);
  window.postMessage({ type: 'NANO_RECORDER_LOG', log }, '*');
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  const info = getElementInfo(target);
  recordLog({
    timestamp: new Date().toISOString(),
    action: 'click',
    target: info,
    context: {
      url: window.location.href,
      title: document.title,
    },
    result: { success: true, error: null },
  });
}

function handleInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const info = getElementInfo(target);
  recordLog({
    timestamp: new Date().toISOString(),
    action: 'input',
    target: { ...info, value: target.value },
    context: {
      url: window.location.href,
      title: document.title,
    },
    result: { success: true, error: null },
  });
}

function handleScroll() {
  recordLog({
    timestamp: new Date().toISOString(),
    action: 'scroll',
    context: {
      url: window.location.href,
      title: document.title,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    result: { success: true, error: null },
  });
}

function enableRecorder() {
  if ((window as any).__NANO_RECORDER_ENABLED__) return;
  (window as any).__NANO_RECORDER_ENABLED__ = true;
  window.addEventListener('click', handleClick, true);
  window.addEventListener('input', handleInput, true);
  window.addEventListener('scroll', handleScroll, true);
  console.log('[NanoRecorder] 录制已开启');
}

function disableRecorder() {
  if (!(window as any).__NANO_RECORDER_ENABLED__) return;
  (window as any).__NANO_RECORDER_ENABLED__ = false;
  window.removeEventListener('click', handleClick, true);
  window.removeEventListener('input', handleInput, true);
  window.removeEventListener('scroll', handleScroll, true);
  console.log('[NanoRecorder] 录制已关闭');
}

window.addEventListener('message', event => {
  if (event.data && event.data.type === 'NANO_RECORDER_TOGGLE') {
    if (event.data.enabled) enableRecorder();
    else disableRecorder();
  }
  if (event.data && event.data.type === 'NANO_RECORDER_EXPORT') {
    window.postMessage({ type: 'NANO_RECORDER_EXPORT_RESULT', logs: (window as any).__NANO_RECORDER_LOGS__ }, '*');
  }
});

// 监听来自 SidePanel 的消息，控制录制开关和导出日志
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'NANO_RECORDER_TOGGLE') {
    if (msg.enabled) {
      enableRecorder();
    } else {
      disableRecorder();
    }
  }
  if (msg && msg.type === 'NANO_RECORDER_EXPORT') {
    chrome.runtime.sendMessage({ type: 'NANO_RECORDER_EXPORT_RESULT', logs: (window as any).__NANO_RECORDER_LOGS__ });
  }
});
