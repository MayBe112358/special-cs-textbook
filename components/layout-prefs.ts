/**
 * @module        界面尺寸偏好——侧边栏多宽、藏没藏起来、终端展开时多高
 * @problem       每个人的屏幕不一样，想要的比例也不一样：有人要宽正文，有人要高终端。
 *                尺寸写死，总有人觉得“一大坨”；能拖动调节，还得在刷新之后记住，不然每次都要重新拖。
 * @design        三个数存在浏览器里（访问者状态，和心得、进度一样只属于这台浏览器），
 *                然后写成 <html> 上的两个 CSS 变量和一个 data 属性，布局全靠 CSS 读它们。
 *                页面刚打开、React 还没跑起来时，由 BOOT_SCRIPT 这段小脚本先把变量设好，免得先闪一下默认尺寸。
 *                拖动的逻辑不在这里，这里只管“读、写、应用”。
 * @courses       CS50x Week 8（CSS 变量、localStorage）；Stanford CS147（让用户控制布局）
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        知道 CSS 变量可以由 JavaScript 在运行时改；localStorage 只在当前浏览器里。
 * @unclear       尺寸偏好没有进心得备份文件：它换一台电脑本来就该重新调，带过去反而不合适。
 *
 * @letter
 * 为什么拖动时不用 React 的 state，而是直接改 <html> 上的 CSS 变量？
 *
 * 拖动时鼠标每秒要报几十次位置。如果每次都 setState，React 就要把整个布局重新算一遍、画一遍，
 * 侧边栏会跟不上手。直接改一个 CSS 变量，浏览器只需要重新排版，不经过 React——这是“走捷径”，
 * 但它是一条被允许的捷径：这些数字只影响样子，不影响任何数据，也没有第二个地方存着它们。
 *
 * 另一个细节是那段 BOOT_SCRIPT。网站是静态生成的，服务器不知道你上次把侧边栏拖到了多宽，
 * 页面第一次画出来一定是默认宽度；等 React 跑起来再改，你就会看到它“跳”一下。
 * 所以在 <head> 里放一小段最先执行的脚本，先把变量设好，再让页面露面。深浅色主题也是用同样的办法防止闪烁的。
 */

export const SIDEBAR_DEFAULT = 248;
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
/** 拖到比这还窄，就当你是想把它收起来。 */
export const SIDEBAR_SNAP = 120;

export const TERMINAL_DEFAULT = 208;
export const TERMINAL_MIN = 120;
/** 拖到比这还矮，就当你是想把终端收起来。 */
export const TERMINAL_SNAP = 72;

const KEY = 'special-cs-textbook:layout:v1';
export const LAYOUT_CHANGED = 'special-cs-textbook:layout-changed';

export type LayoutPrefs = { sidebarWidth: number; sidebarHidden: boolean; terminalHeight: number };

const DEFAULTS: LayoutPrefs = { sidebarWidth: SIDEBAR_DEFAULT, sidebarHidden: false, terminalHeight: TERMINAL_DEFAULT };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readLayout(): LayoutPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<LayoutPrefs>;
    return {
      sidebarWidth: typeof raw.sidebarWidth === 'number' ? clamp(raw.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX) : DEFAULTS.sidebarWidth,
      sidebarHidden: raw.sidebarHidden === true,
      terminalHeight: typeof raw.terminalHeight === 'number' ? Math.max(TERMINAL_MIN, raw.terminalHeight) : DEFAULTS.terminalHeight,
    };
  } catch {
    // 存储被禁用或内容读不懂：用默认尺寸，不影响阅读。
    return { ...DEFAULTS };
  }
}

/** 把尺寸写到 <html> 上。拖动过程中每一帧都调它，所以只改变量，不做别的事。 */
export function applyLayout(prefs: LayoutPrefs): void {
  const root = document.documentElement;
  root.style.setProperty('--cs-sidebar-width', `${prefs.sidebarHidden ? 0 : prefs.sidebarWidth}px`);
  root.style.setProperty('--cs-terminal-height', `${prefs.terminalHeight}px`);
  root.dataset.sidebar = prefs.sidebarHidden ? 'hidden' : 'shown';
}

/** 改一部分、应用、保存、广播。松手时调一次，拖动中间只 applyLayout。 */
export function updateLayout(patch: Partial<LayoutPrefs>): LayoutPrefs {
  const next = { ...readLayout(), ...patch };
  applyLayout(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 存不下也照样生效，只是刷新后回到默认。
  }
  window.dispatchEvent(new Event(LAYOUT_CHANGED));
  return next;
}

/**
 * 放进 <head> 的那段脚本，在页面画出来之前执行。
 * 它和 applyLayout 做同一件事；写成字符串是因为它要在 React 和任何打包代码加载之前就跑。
 */
export const BOOT_SCRIPT = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||'{}'),r=document.documentElement,w=typeof p.sidebarWidth==='number'?Math.min(${SIDEBAR_MAX},Math.max(${SIDEBAR_MIN},p.sidebarWidth)):${SIDEBAR_DEFAULT};r.style.setProperty('--cs-sidebar-width',(p.sidebarHidden===true?0:w)+'px');if(typeof p.terminalHeight==='number')r.style.setProperty('--cs-terminal-height',Math.max(${TERMINAL_MIN},p.terminalHeight)+'px');r.dataset.sidebar=p.sidebarHidden===true?'hidden':'shown';}catch(e){}`;
