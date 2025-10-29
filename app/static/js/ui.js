(function () {
    const doc = document.documentElement;
    if (doc.classList.contains('no-js')) {
        doc.classList.remove('no-js');
    }

    const body = document.body;
    requestAnimationFrame(() => {
        body.classList.add('ready');
    });

    const pageShell = document.querySelector('[data-page-transition]');
    if (pageShell) {
        requestAnimationFrame(() => pageShell.classList.add('transition-layer'));
    }

    window.NovaTalk = window.NovaTalk || {};
    let socketClientPromise = null;

    const SOCKET_IO_CLIENT_SRC = 'https://cdn.socket.io/4.7.4/socket.io.min.js';

    function ensureSocketClient() {
        if (typeof window.io === 'function') {
            return Promise.resolve();
        }
        if (socketClientPromise) {
            return socketClientPromise;
        }
        socketClientPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = SOCKET_IO_CLIENT_SRC;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = (error) => {
                console.error('Failed to load Socket.IO client.', error);
                reject(error);
            };
            document.head.appendChild(script);
        });
        return socketClientPromise;
    }

    window.NovaTalk.ensureSocketClient = ensureSocketClient;
    const csrfInput = document.getElementById('global-csrf-token');
    if (csrfInput) {
        window.NovaTalk.csrfToken = csrfInput.value;
    }

    function applyRipple(element) {
        element.addEventListener('pointerdown', () => {
            element.setAttribute('data-ripple-active', 'true');
        });
        ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((eventName) => {
            element.addEventListener(eventName, () => {
                element.removeAttribute('data-ripple-active');
            });
        });
    }

    document.querySelectorAll('.md-ripple').forEach(applyRipple);

    function isRequestsPanelVisible() {
        const panel = document.querySelector('[data-tab-panel="requests"]');
        return panel ? !panel.hasAttribute('hidden') : false;
    }

    function isFriendSidebarVisible() {
        const list = document.querySelector('.profile-panel__member-list');
        if (!list) {
            return false;
        }
        const style = window.getComputedStyle(list);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    const flashRegion = document.getElementById('flash-region');
    if (flashRegion) {
        flashRegion.querySelectorAll('[data-dismiss-flash]').forEach((button) => {
            button.addEventListener('click', () => {
                const host = button.closest('[data-flash]');
                if (host) {
                    host.classList.add('transition-layer');
                    host.addEventListener(
                        'animationend',
                        () => {
                            host.remove();
                        },
                        { once: true }
                    );
                }
            });
        });
    }

    const THEME_STORAGE_KEY = 'novatalk-theme';
    const validThemes = new Set(['system', 'light', 'dark']);

    function getSystemTheme() {
        if (!window.matchMedia) {
            return 'light';
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    const themeIcon = document.querySelector('[data-theme-icon]');

    function updateThemeIcon(theme) {
        if (!themeIcon) {
            return;
        }
        const icon = theme === 'dark' ? 'dark_mode' : 'light_mode';
        themeIcon.textContent = icon;
    }

    function syncColorScheme(resolved) {
        const scheme = resolved === 'dark' ? 'dark' : 'light';
        doc.style.setProperty('color-scheme', scheme);
        doc.dataset.themeResolved = resolved;
    }

    function applyTheme(theme) {
        const resolved = theme === 'system' ? getSystemTheme() : theme;
        if (theme === 'system') {
            body.removeAttribute('data-theme');
        } else {
            body.dataset.theme = theme;
        }
        body.dataset.themePreference = theme;
        body.dataset.themeResolved = resolved;
        body.classList.toggle('dark-mode', resolved === 'dark');
        updateThemeIcon(resolved);
        syncColorScheme(resolved);
    }

    const themeToggle = document.querySelector('[data-theme-toggle]');

    function syncThemeToggleState(theme) {
        if (!themeToggle) {
            return;
        }
        const resolved = theme === 'system' ? getSystemTheme() : theme;
        themeToggle.dataset.theme = theme;
        const labelSuffix = theme === 'system' ? ' · System' : '';
        themeToggle.setAttribute('aria-label', `Switch theme (current: ${resolved}${labelSuffix})`);
    }

    let storedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    if (!validThemes.has(storedTheme)) {
        storedTheme = 'system';
    }
    applyTheme(storedTheme);
    syncThemeToggleState(storedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const order = ['system', 'light', 'dark'];
            const current = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
            const currentIndex = order.indexOf(current);
            const nextTheme = order[(currentIndex + 1) % order.length];
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            applyTheme(nextTheme);
            syncThemeToggleState(nextTheme);
        });
    }

    if (window.matchMedia) {
        const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkQuery.addEventListener('change', () => {
            const persisted = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
            if (persisted === 'system') {
                applyTheme('system');
                syncThemeToggleState('system');
            }
        });
    }

    const avatarInput = document.querySelector('[data-avatar-input]');
    const avatarPreview = document.querySelector('[data-avatar-preview]');
    const avatarPlaceholder = document.querySelector('[data-avatar-placeholder]');
    const avatarZoom = document.querySelector('[data-avatar-zoom]');
    const avatarZoomContainer = document.querySelector('[data-avatar-zoom-container]');
    const avatarContainer = document.querySelector('[data-avatar-container]');
    const avatarOffsetX = document.querySelector('[data-avatar-offset-x]');
    const avatarOffsetY = document.querySelector('[data-avatar-offset-y]');
    const avatarScale = document.querySelector('[data-avatar-scale]');
    const avatarLivePreviewContainer = document.querySelector('[data-avatar-live-preview-container]');
    const avatarLivePreview = document.querySelector('[data-avatar-live-preview]');
    const avatarLivePlaceholder = document.querySelector('[data-avatar-live-placeholder]');

    const cropState = {
        x: 0,
        y: 0,
        scale: 1,
        active: false,
    };

    function updateAvatarTransform() {
        if (!avatarPreview || !avatarContainer) {
            return;
        }
        const containerWidth = avatarContainer.clientWidth || 0;
        if (!containerWidth) {
            return;
        }
        const bounds = ((cropState.scale - 1) * containerWidth) / 2;
        cropState.x = Math.max(-bounds, Math.min(bounds, cropState.x));
        cropState.y = Math.max(-bounds, Math.min(bounds, cropState.y));
        avatarPreview.style.transform = `translate(calc(-50% + ${cropState.x}px), calc(-50% + ${cropState.y}px)) scale(${cropState.scale})`;
        if (avatarLivePreview && avatarLivePreviewContainer) {
            const liveWidth = avatarLivePreviewContainer.clientWidth || containerWidth;
            const ratio = liveWidth / containerWidth;
            const liveX = cropState.x * ratio;
            const liveY = cropState.y * ratio;
            avatarLivePreview.style.transform = `translate(calc(-50% + ${liveX}px), calc(-50% + ${liveY}px)) scale(${cropState.scale})`;
        }
        if (avatarOffsetX) {
            avatarOffsetX.value = String(cropState.x);
        }
        if (avatarOffsetY) {
            avatarOffsetY.value = String(cropState.y);
        }
        if (avatarScale) {
            avatarScale.value = String(cropState.scale);
        }
    }

    function enableAvatarControls() {
        if (avatarPlaceholder) {
            avatarPlaceholder.hidden = true;
        }
        if (avatarPreview) {
            avatarPreview.hidden = false;
            avatarPreview.draggable = false;
        }
        const hasImage = avatarPreview ? !avatarPreview.hidden : false;
        if (avatarLivePreview) {
            if (hasImage && avatarPreview.src) {
                avatarLivePreview.hidden = false;
                if (avatarLivePreview.src !== avatarPreview.src) {
                    avatarLivePreview.src = avatarPreview.src;
                }
            } else {
                avatarLivePreview.hidden = true;
            }
        }
        if (avatarLivePlaceholder) {
            avatarLivePlaceholder.hidden = Boolean(hasImage && avatarPreview.src);
        }
        if (avatarZoom) {
            avatarZoom.disabled = false;
            if (avatarZoomContainer) {
                avatarZoomContainer.classList.remove('hidden');
            } else {
                avatarZoom.parentElement?.classList.remove('hidden');
            }
            avatarZoom.value = String(cropState.scale);
        }
    }

    if (avatarPreview && avatarPreview.getAttribute('src')) {
        enableAvatarControls();
        updateAvatarTransform();
    }

    if (avatarInput && avatarPreview && avatarContainer) {
        avatarInput.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                avatarPreview.src = reader.result;
                if (avatarLivePreview) {
                    avatarLivePreview.src = reader.result;
                    avatarLivePreview.hidden = false;
                }
                if (avatarLivePlaceholder) {
                    avatarLivePlaceholder.hidden = true;
                }
                cropState.scale = 1.2;
                cropState.x = 0;
                cropState.y = 0;
                enableAvatarControls();
                updateAvatarTransform();
            });
            reader.readAsDataURL(file);
        });

        if (avatarZoom) {
            avatarZoom.addEventListener('input', () => {
                const value = Number.parseFloat(avatarZoom.value) || 1;
                cropState.scale = Math.min(Math.max(value, 1), 2.4);
                updateAvatarTransform();
            });
        }

        let pointerActive = false;
        let origin = { x: 0, y: 0 };
        let start = { x: 0, y: 0 };

        avatarContainer.addEventListener('pointerdown', (event) => {
            if (!avatarPreview || !avatarPreview.src) {
                return;
            }
            pointerActive = true;
            start = { x: event.clientX, y: event.clientY };
            origin = { x: cropState.x, y: cropState.y };
            avatarContainer.setPointerCapture(event.pointerId);
            avatarContainer.classList.add('is-dragging');
            event.preventDefault();
        });

        avatarContainer.addEventListener('pointermove', (event) => {
            if (!pointerActive) {
                return;
            }
            const deltaX = event.clientX - start.x;
            const deltaY = event.clientY - start.y;
            cropState.x = origin.x + deltaX;
            cropState.y = origin.y + deltaY;
            event.preventDefault();
            updateAvatarTransform();
        });

        const releasePointer = (event) => {
            if (!pointerActive) {
                return;
            }
            pointerActive = false;
            avatarContainer.classList.remove('is-dragging');
            try {
                avatarContainer.releasePointerCapture(event.pointerId);
            } catch (err) {
                // ignore when pointer is not captured
            }
        };

        avatarContainer.addEventListener('pointerup', releasePointer);
        avatarContainer.addEventListener('pointercancel', releasePointer);
        avatarContainer.addEventListener('pointerleave', () => {
            pointerActive = false;
            avatarContainer.classList.remove('is-dragging');
        });

        if ('ResizeObserver' in window) {
            const resizeObserver = new window.ResizeObserver(() => updateAvatarTransform());
            resizeObserver.observe(avatarContainer);
        } else {
            window.addEventListener('resize', updateAvatarTransform);
        }
    }

    const scrollButton = document.querySelector('[data-scroll-bottom]');
    const messageList = document.getElementById('message-list');
    if (scrollButton && messageList) {
        const updateVisibility = () => {
            const nearBottom = messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 120;
            scrollButton.hidden = nearBottom;
        };
        messageList.addEventListener('scroll', updateVisibility);
        scrollButton.addEventListener('click', () => {
            messageList.scrollTo({ top: messageList.scrollHeight, behavior: 'smooth' });
        });
        updateVisibility();
    }

    function requestNotificationPermission() {
        if (!('Notification' in window)) {
            return;
        }
        const STORAGE_KEY = 'novatalk-notifications';
        const stored = localStorage.getItem(STORAGE_KEY);
        const ctx = ensureNotificationContext();
        const primeAudio = () => {
            if (ctx) {
                loadNotificationBuffer(ctx);
            }
        };
        if (Notification.permission === 'granted') {
            localStorage.setItem(STORAGE_KEY, 'granted');
            primeAudio();
            return;
        }
        if (stored === 'granted') {
            primeAudio();
        }
        if (stored === 'denied' || Notification.permission === 'denied') {
            return;
        }
        Notification.requestPermission()
            .then((result) => {
                localStorage.setItem(STORAGE_KEY, result);
                if (result === 'granted') {
                    primeAudio();
                }
            })
            .catch(() => {});
    }

    const NOTIFICATION_AUDIO_URL = '/static/media/ding.wav';
    let notificationAudioContext = null;
    let notificationAudioBuffer = null;
    let notificationAudioBufferLoading = null;

    function ensureNotificationContext() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) {
            return null;
        }
        if (notificationAudioContext && notificationAudioContext.state === 'closed') {
            notificationAudioContext = null;
            notificationAudioBuffer = null;
        }
        if (!notificationAudioContext) {
            notificationAudioContext = new Context();
            notificationAudioBuffer = null;
            notificationAudioBufferLoading = null;
        }
        if (notificationAudioContext.state === 'suspended') {
            const resume = () => {
                notificationAudioContext.resume().catch(() => {});
            };
            const resumeOnce = () => {
                document.removeEventListener('pointerdown', resumeOnce);
                document.removeEventListener('keydown', resumeOnce);
                resume();
            };
            document.addEventListener('pointerdown', resumeOnce, { once: true });
            document.addEventListener('keydown', resumeOnce, { once: true });
        }
        return notificationAudioContext;
    }

    function loadNotificationBuffer(ctx) {
        if (!ctx || typeof fetch !== 'function' || typeof ctx.decodeAudioData !== 'function') {
            return Promise.resolve(null);
        }
        if (notificationAudioBuffer && ctx === notificationAudioContext) {
            return Promise.resolve(notificationAudioBuffer);
        }
        if (notificationAudioBufferLoading) {
            return notificationAudioBufferLoading;
        }
        notificationAudioBufferLoading = fetch(NOTIFICATION_AUDIO_URL, { cache: 'force-cache' })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load notification sound: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((buffer) => ctx.decodeAudioData(buffer))
            .then((decoded) => {
                notificationAudioBuffer = decoded;
                notificationAudioBufferLoading = null;
                return decoded;
            })
            .catch((error) => {
                console.warn('NovaTalk: unable to prepare notification sound.', error);
                notificationAudioBuffer = null;
                notificationAudioBufferLoading = null;
                return null;
            });
        return notificationAudioBufferLoading;
    }

    function playSynthesisTone(ctx) {
        const now = ctx.currentTime;
        const primary = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        primary.type = 'sine';
        primary.frequency.setValueAtTime(880, now);
        primary.frequency.exponentialRampToValueAtTime(523.25, now + 0.35);
        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(1318.51, now);
        overtone.frequency.exponentialRampToValueAtTime(659.25, now + 0.28);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        primary.connect(gain);
        overtone.connect(gain);
        gain.connect(ctx.destination);
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) {
                return;
            }
            cleaned = true;
            primary.disconnect();
            overtone.disconnect();
            gain.disconnect();
        };
        primary.onended = cleanup;
        overtone.onended = cleanup;
        primary.start(now);
        overtone.start(now);
        primary.stop(now + 0.5);
        overtone.stop(now + 0.4);
    }

    function playNotificationTone() {
        const ctx = ensureNotificationContext();
        if (!ctx) {
            return;
        }
        if (ctx.state !== 'running') {
            ctx.resume()
                .then(() => {
                    if (ctx.state === 'running') {
                        playNotificationTone();
                    }
                })
                .catch(() => {});
            return;
        }
        const startBufferPlayback = (buffer) => {
            if (!buffer) {
                playSynthesisTone(ctx);
                return;
            }
            const source = ctx.createBufferSource();
            const gain = ctx.createGain();
            source.buffer = buffer;
            gain.gain.setValueAtTime(0.85, ctx.currentTime);
            source.connect(gain);
            gain.connect(ctx.destination);
            const cleanup = () => {
                source.disconnect();
                gain.disconnect();
            };
            source.addEventListener('ended', cleanup, { once: true });
            try {
                source.start();
            } catch (error) {
                cleanup();
                playSynthesisTone(ctx);
            }
        };

        loadNotificationBuffer(ctx)
            .then((buffer) => {
                startBufferPlayback(buffer);
            })
            .catch(() => {
                playSynthesisTone(ctx);
            });
    }

    function updateAvatarNodes(url) {
        if (!url) {
            return;
        }
        window.NovaTalk.currentUserAvatar = url;
        document.querySelectorAll('[data-avatar-refresh="self"]').forEach((container) => {
            const alt = container.getAttribute('data-avatar-alt') || 'Profile avatar';
            container.innerHTML = '';
            const img = document.createElement('img');
            img.alt = alt;
            img.src = url;
            container.appendChild(img);
        });
        const profilePreview = document.querySelector('[data-avatar-preview]');
        if (profilePreview) {
            profilePreview.src = url;
            profilePreview.hidden = false;
        }
        const livePreview = document.querySelector('[data-avatar-live-preview]');
        if (livePreview) {
            livePreview.src = url;
            livePreview.hidden = false;
        }
        const livePlaceholder = document.querySelector('[data-avatar-live-placeholder]');
        if (livePlaceholder) {
            livePlaceholder.hidden = true;
        }
    }

    function showToast(category, message) {
        const region = document.getElementById('flash-region');
        if (!region || !message) {
            return;
        }
        const host = document.createElement('div');
        host.className = 'md-snackbar md-elevation';
        host.dataset.flash = 'client';
        host.dataset.category = category || 'Info';

        const headline = document.createElement('div');
        headline.className = 'md-snackbar__headline';
        headline.textContent = category || 'Info';
        host.appendChild(headline);

        const body = document.createElement('p');
        body.className = 'md-snackbar__body';
        body.textContent = message;
        host.appendChild(body);

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'md-text-button md-ripple';
        dismiss.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span><span class="sr-only">Dismiss</span>';
        dismiss.addEventListener('click', () => host.remove());
        applyRipple(dismiss);
        host.appendChild(dismiss);

        region.appendChild(host);
        setTimeout(() => {
            if (host.isConnected) {
                host.classList.add('transition-layer');
                setTimeout(() => host.remove(), 220);
            }
        }, 5000);
    }

    function updateRequestBadge(count) {
        if (typeof count !== 'number') {
            return;
        }
        document.querySelectorAll('[data-request-count]').forEach((badge) => {
            badge.textContent = String(count);
            badge.dataset.count = String(count);
            badge.hidden = count <= 0;
        });
    }

    window.NovaTalk = window.NovaTalk || {};
    window.NovaTalk.playNotificationTone = playNotificationTone;
    window.NovaTalk.requestNotificationPermission = requestNotificationPermission;
    window.NovaTalk.updateAvatarNodes = updateAvatarNodes;
    window.NovaTalk.showToast = showToast;
    window.NovaTalk.updateRequestBadge = updateRequestBadge;

    requestNotificationPermission();

    if (window.NovaTalk.currentUserId) {
        ensureSocketClient()
            .then(() => {
                if (typeof window.io !== 'function' || window.NovaTalk.socket) {
                    return;
                }
                const socket = window.io({ transports: ['websocket', 'polling'] });
                window.NovaTalk.socket = socket;
                const register = () =>
                    socket.emit('register_user', {
                        user_id: window.NovaTalk.currentUserId,
                    });
                socket.on('connect', register);
                socket.on('reconnect', register);
                socket.on('profile:avatar-updated', (payload) => {
                    if (!payload) {
                        return;
                    }
                    if (Number(payload.user_id) === Number(window.NovaTalk.currentUserId)) {
                        updateAvatarNodes(payload.avatar_url);
                    }
                });
                socket.on('friend:update', (payload = {}) => {
                    const action = payload.action;
                    if (!action) {
                        return;
                    }
                    if (typeof payload.pending_count === 'number') {
                        updateRequestBadge(payload.pending_count);
                    }
                    const fromUser = payload.from_user || payload.friend || payload.to_user;
                    const name = fromUser && fromUser.display_name ? fromUser.display_name : 'Someone';
                    switch (action) {
                        case 'request_received':
                            showToast('Friend request', `${name} sent you a friend request`);
                            if (isRequestsPanelVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        case 'request_sent':
                            showToast('Friend request', `Request sent to ${name}`);
                            break;
                        case 'request_accepted':
                            showToast('Friend update', `${name} accepted your friend request`);
                            if (isRequestsPanelVisible() || isFriendSidebarVisible()) {
                                window.setTimeout(() => window.location.reload(), 800);
                            }
                            break;
                        case 'request_declined':
                            showToast('Friend update', `${name} declined your friend request`);
                            if (isRequestsPanelVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        case 'request_cancelled':
                            showToast('Friend update', `${name} cancelled a friend request`);
                            if (isRequestsPanelVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        case 'request_cancelled_self':
                            showToast('Friend update', `You cancelled a friend request to ${name}`);
                            break;
                        case 'friend_added':
                            showToast('Friend update', `${name} is now in your friends list`);
                            if (isFriendSidebarVisible() || isRequestsPanelVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        case 'friend_removed':
                            showToast('Friend update', `${name} removed you from their friends list`);
                            if (isFriendSidebarVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        case 'friend_removed_self':
                            showToast('Friend update', `You removed ${name} from your friends list`);
                            if (isFriendSidebarVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        case 'request_declined_self':
                            showToast('Friend update', `You declined ${name}'s friend request`);
                            if (isRequestsPanelVisible()) {
                                window.setTimeout(() => window.location.reload(), 600);
                            }
                            break;
                        default:
                            break;
                    }
                });
            })
            .catch(() => {});
    }

const tablists = document.querySelectorAll('[data-tablist]');
tablists.forEach((tablist) => {
    const container = tablist.nextElementSibling;
    if (!container) {
        return;
    }
    const panels = container.querySelectorAll('[data-tab-panel]');
    const buttons = tablist.querySelectorAll('[data-tab-target]');
    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            if (button.classList.contains('is-active')) {
                return;
            }
            const target = button.getAttribute('data-tab-target');
            buttons.forEach((btn) => btn.classList.toggle('is-active', btn === button));
            panels.forEach((panel) => {
                panel.hidden = panel.getAttribute('data-tab-panel') !== target;
            });
        });
    });
});

let mobileOverlay = null;
let primaryToggle = document.querySelector('[data-toggle-inbox]');

const refreshOverlay = () => {
    const open = body.classList.contains('mobile-primary-open');
    if (mobileOverlay) {
        mobileOverlay.classList.toggle('visible', open);
    }
    if (primaryToggle) {
        primaryToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
};

const ensureOverlay = () => {
    if (!mobileOverlay) {
        mobileOverlay = document.createElement('div');
        mobileOverlay.className = 'mobile-overlay';
        mobileOverlay.addEventListener('click', () => {
            body.classList.remove('mobile-primary-open');
            refreshOverlay();
        });
        document.body.appendChild(mobileOverlay);
    }
    refreshOverlay();
};

const togglePrimaryDrawer = () => {
    ensureOverlay();
    body.classList.toggle('mobile-primary-open');
    refreshOverlay();
};

if (primaryToggle) {
    primaryToggle.addEventListener('click', togglePrimaryDrawer);
}

const mediaQuery = window.matchMedia('(min-width: 861px)');
const syncDrawerState = () => {
    if (mediaQuery.matches) {
        body.classList.remove('mobile-primary-open');
    }
    refreshOverlay();
};
mediaQuery.addEventListener('change', syncDrawerState);
syncDrawerState();

if ('MutationObserver' in window) {
    const bodyObserver = new MutationObserver(() => refreshOverlay());
    bodyObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
}

document.addEventListener('keyup', (event) => {
    if (event.key === 'Escape' && body.classList.contains('mobile-primary-open')) {
        body.classList.remove('mobile-primary-open');
        refreshOverlay();
    }
});
})();