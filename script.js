// =====================================================
// CONFIGURATION
// =====================================================
const DEFAULT_WISP = window.SITE_CONFIG?.defaultWisp ?? "wss://anura.pro/wisp/";

const BareMux = window.BareMux ?? { BareMuxConnection: class { setTransport() {} } };

let sharedScramjet = null;
let sharedConnection = null;
let sharedConnectionReady = false;

// =====================================================
// UTILITIES
// =====================================================
const getBasePath = () => {
    const basePath = location.pathname.replace(/[^/]*$/, '');
    return basePath.endsWith('/') ? basePath : basePath + '/';
};

// =====================================================
// INITIALIZATION
// =====================================================
async function getSharedScramjet() {
    if (sharedScramjet) return sharedScramjet;

    const basePath = getBasePath();
    const { ScramjetController } = $scramjetLoadController();

    sharedScramjet = new ScramjetController({
        prefix: basePath + "scramjet/",
        files: {
            wasm: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.wasm.wasm",
            all: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.all.js",
            sync: "https://cdn.jsdelivr.net/gh/Destroyed12121/Staticsj@main/JS/scramjet.sync.js"
        }
    });

    await sharedScramjet.init();
    return sharedScramjet;
}

async function getSharedConnection() {
    if (sharedConnectionReady) return sharedConnection;

    const basePath = getBasePath();
    const wispUrl = localStorage.getItem("proxServer") ?? DEFAULT_WISP;

    sharedConnection = new BareMux.BareMuxConnection(basePath + "bareworker.js");
    await sharedConnection.setTransport(
        "https://cdn.jsdelivr.net/npm/@mercuryworkshop/libcurl-transport@1.5.2/dist/index.mjs",
        [{ wisp: wispUrl }]
    );
    sharedConnectionReady = true;
    return sharedConnection;
}

async function initializeBrowser() {
    const root = document.getElementById("app");
    root.innerHTML = `
        <div class="browser-container">
            <div class="iframe-container" id="iframe-container">
                <div id="loading" class="message-container">
                    <div class="message-content">
                        <div class="spinner"></div>
                        <h1>Connecting</h1>
                        <p id="loading-url">Loading...</p>
                        <button id="skip-btn">Skip</button>
                    </div>
                </div>
                <div id="error" class="message-container">
                    <div class="message-content">
                        <h1>Connection Error</h1>
                        <p id="error-message">An error occurred.</p>
                    </div>
                </div>
            </div>
        </div>`;

    const loading = document.getElementById('loading');
    const hideLoading = () => {
        loading.style.display = 'none';
        loading.setAttribute('aria-hidden', 'true');
    };

    const frame = sharedScramjet.createFrame();
    frame.frame.src = "NT.html";

    frame.frame.addEventListener('load', hideLoading);

    frame.addEventListener("urlchange", (e) => {
        // Navigation can complete without a subsequent iframe load event in
        // proxied pages, so don't leave the startup overlay covering the page.
        document.getElementById('loading-url').textContent = e.url;
        hideLoading();
    });

    document.getElementById('skip-btn').onclick = hideLoading;

    document.getElementById("iframe-container").appendChild(frame.frame);

    if (window.location.hash) {
        const hash = decodeURIComponent(window.location.hash.substring(1));
        if (hash) frame.go(hash.startsWith('http') ? hash : `https://${hash}`);
        history.replaceState(null, null, location.pathname);
    }

    window.addEventListener('message', (e) => {
        if (e.data?.type === 'navigate' && typeof e.data.url === 'string') {
            // Hide immediately: a proxy navigation may not emit iframe.onload
            // if the destination errors or keeps a long-lived request open.
            hideLoading();
            frame.go(e.data.url.startsWith('http') ? e.data.url : `https://${e.data.url}`);
        }
    });
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await getSharedScramjet();
        await getSharedConnection();

        if ('serviceWorker' in navigator) {
            await navigator.serviceWorker.register(getBasePath() + 'sw.js', { scope: getBasePath() });
            await navigator.serviceWorker.ready;

            navigator.serviceWorker.controller?.postMessage({
                type: 'config',
                wispurl: localStorage.getItem('proxServer') ?? DEFAULT_WISP
            });
        }

        await initializeBrowser();
    } catch (err) {
        console.error('Initialization error:', err);
        const error = document.getElementById('error');
        if (error) {
            error.style.display = 'flex';
            document.getElementById('error-message').textContent = err.message;
        }
    }
});
