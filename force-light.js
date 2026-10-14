// [MiniGemini] Content Script để ép Light Mode và Điều khiển Zoom

// 1. Ép Light Mode
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query) => {
        return {
            matches: query === '(prefers-color-scheme: dark)' ? false : true,
            media: query,
            onchange: null,
            addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => {}
        };
    }
});

const observer = new MutationObserver(() => {
    if (document.documentElement.hasAttribute('dark')) document.documentElement.removeAttribute('dark');
    if (document.documentElement.getAttribute('data-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'light');
    if (document.body && document.body.classList.contains('dark-theme')) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
});
observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });

// 2. Zoom xuống 0.25 (25%)
let currentZoom = 0.5;

function applyZoom() {
    document.body.style.zoom = currentZoom;
}

window.addEventListener('load', () => {
    applyZoom();
    injectZoomAndWhiteBackground();
});

function injectZoomAndWhiteBackground() {
    if (document.getElementById('mini-gemini-controls-container')) return;

    const container = document.createElement('div');
    container.id = 'mini-gemini-controls-container';

    // Nút điều khiển mờ ở góc
    container.style.cssText = 'position: fixed; bottom: 15px; right: 15px; z-index: 999999; display: flex; gap: 6px; opacity: 0.05; transition: opacity 0.3s ease;';

    container.onmouseenter = () => container.style.opacity = '0.5';
    container.onmouseleave = () => container.style.opacity = '0.05';

    const btnStyle = 'width: 26px; height: 26px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.5); color: #333; cursor: pointer; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);';

    const btnIn = document.createElement('button');
    btnIn.innerText = '+';
    btnIn.style.cssText = btnStyle;
    btnIn.onclick = () => { currentZoom += 0.05; applyZoom(); };

    const btnOut = document.createElement('button');
    btnOut.innerText = '-';
    btnOut.style.cssText = btnStyle;
    btnOut.onclick = () => { currentZoom -= 0.05; applyZoom(); };

    container.appendChild(btnOut);
    container.appendChild(btnIn);
    document.body.appendChild(container);
}