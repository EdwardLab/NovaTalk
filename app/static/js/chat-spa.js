(function () {
    const stateElement = document.getElementById('nova-initial-state');
    if (!stateElement) {
        return;
    }

    let initialState = {};
    try {
        initialState = JSON.parse(stateElement.textContent || '{}');
    } catch (error) {
        console.error('Failed to parse initial state payload.', error);
    }

    const SOCKET_IO_CLIENT_SRC = 'https://cdn.socket.io/4.7.4/socket.io.min.js';

    const DAY_MS = 24 * 60 * 60 * 1000;

    const formatTime = (value) => {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatRelative = (value) => {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        const now = Date.now();
        const diff = now - date.getTime();
        if (diff < 60 * 1000) {
            return 'Just now';
        }
        if (diff < 60 * 60 * 1000) {
            const mins = Math.max(1, Math.round(diff / (60 * 1000)));
            return `${mins} min${mins > 1 ? 's' : ''} ago`;
        }
        if (diff < DAY_MS) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const sameDay = (a, b) => {
        const aDate = new Date(a);
        const bDate = new Date(b);
        return (
            aDate.getFullYear() === bDate.getFullYear() &&
            aDate.getMonth() === bDate.getMonth() &&
            aDate.getDate() === bDate.getDate()
        );
    };

    const groupMessagesByDay = (messages) => {
        const groups = [];
        let currentGroup = null;
        messages.forEach((message) => {
            if (!currentGroup || !sameDay(currentGroup.date, message.created_at)) {
                currentGroup = {
                    date: message.created_at,
                    label: new Date(message.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                    }),
                    items: [],
                };
                groups.push(currentGroup);
            }
            currentGroup.items.push(message);
        });
        return groups;
    };

    const truncate = (value, max = 90) => {
        if (!value) {
            return '';
        }
        if (value.length <= max) {
            return value;
        }
        return `${value.slice(0, max - 1)}…`;
    };

    const readFileAsDataUrl = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Unable to read file.'));
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });

    class NovaTalkApp {
        constructor(root, bootState) {
            this.root = root;
            this.state = {
                user: bootState.user || {},
                chats: Array.isArray(bootState.chats) ? bootState.chats : [],
                contacts: bootState.contacts || { friends: [], incoming: [], outgoing: [] },
                ui: {
                    activeTab: bootState.ui?.activeChatId ? 'chats' : bootState.ui?.activeTab || 'chats',
                    activeChatId: bootState.ui?.activeChatId || null,
                    pendingCount: bootState.ui?.pendingCount || 0,
                },
            };
            this.messageStore = new Map();
            this.socket = null;
            this.typingTimers = new Map();
            this.typingTimeout = null;
            this.attachmentQueue = [];
            this.profileAvatarPayload = null;
            this.isSending = false;
            this.viewer = null;
            this.notificationAudio = null;
            this.audioCtx = null;
            this.chatShell = root;
            this.socketLoading = false;
            this.connectionErrorNotified = false;
        }

        init() {
            this.cacheElements();
            this.preloadNotificationAudio();
            if (typeof window.NovaTalk?.requestNotificationPermission === 'function') {
                window.NovaTalk.requestNotificationPermission();
            }
            this.ensureToastHost();
            this.bindTabControls();
            this.bindSidebarToggle();
            this.bindChatList();
            this.bindContacts();
            this.bindComposer();
            this.bindProfileForm();
            this.renderSidebarProfile();
            this.renderChats();
            this.renderContacts();
            this.renderProfileForm();
            this.switchTab(this.state.ui.activeTab || 'chats');
            this.setupSocket();
            this.resumeAudioContext();
            if (this.state.ui.activeChatId) {
                this.openChat(this.state.ui.activeChatId);
            }
            if (window.Viewer && this.messageList) {
                this.viewer = new window.Viewer(this.messageList, {
                    navbar: false,
                    title: false,
                    tooltip: false,
                    movable: true,
                    transition: false,
                });
            }
        }

        cacheElements() {
            this.sidebar = this.root.querySelector('[data-sidebar]');
            this.tabButtons = Array.from(this.root.querySelectorAll('[data-tab-trigger]'));
            this.tabPanels = Array.from(this.root.querySelectorAll('[data-tab-panel]'));
            this.profileAvatar = this.root.querySelector('[data-profile-avatar]');
            this.profileName = this.root.querySelector('[data-profile-name]');
            this.profileUsername = this.root.querySelector('[data-profile-username]');
            this.presenceIndicator = this.root.querySelector('[data-presence-indicator]');
            this.presenceText = this.root.querySelector('[data-presence-text]');
            this.newChatButton = this.root.querySelector('[data-new-chat]');
            this.chatList = this.root.querySelector('[data-chat-list]');
            this.chatsCount = this.root.querySelector('[data-chats-count]');
            this.pendingBadge = this.root.querySelector('[data-pending-count]');
            this.pendingBadgeInline = this.root.querySelector('[data-pending-count-inline]');
            this.contactsSearchForm = this.root.querySelector('[data-contacts-search]');
            this.contactsSearchInput = this.root.querySelector('[data-contacts-search-input]');
            this.contactsResults = this.root.querySelector('[data-contacts-results]');
            this.incomingList = this.root.querySelector('[data-incoming-list]');
            this.outgoingList = this.root.querySelector('[data-outgoing-list]');
            this.friendsList = this.root.querySelector('[data-friends-list]');
            this.profileForm = this.root.querySelector('[data-profile-form]');
            this.profileDisplayInput = this.root.querySelector('[data-profile-display-name]');
            this.profileBioInput = this.root.querySelector('[data-profile-bio]');
            this.profileBioCount = this.root.querySelector('[data-profile-bio-count]');
            this.profileEmailInput = this.root.querySelector('[data-profile-email]');
            this.profileAvatarLarge = this.root.querySelector('[data-profile-avatar-large]');
            this.profileAvatarInput = this.root.querySelector('[data-profile-avatar-input]');
            this.profileAvatarRemove = this.root.querySelector('[data-profile-avatar-remove]');
            this.conversationSection = this.root.querySelector('[data-conversation]');
            this.conversationEmpty = this.root.querySelector('[data-conversation-empty]');
            this.conversationBody = this.root.querySelector('[data-conversation-body]');
            this.conversationTitle = this.root.querySelector('[data-conversation-title]');
            this.conversationSubtitle = this.root.querySelector('[data-conversation-subtitle]');
            this.conversationAvatar = this.root.querySelector('[data-conversation-avatar]');
            this.openProfileButton = this.root.querySelector('[data-open-profile]');
            this.closeConversationButton = this.root.querySelector('[data-close-conversation]');
            this.messageList = this.root.querySelector('[data-message-list]');
            this.scrollButton = this.root.querySelector('[data-scroll-bottom]');
            this.typingIndicator = this.root.querySelector('[data-typing-indicator]');
            this.typingText = this.root.querySelector('[data-typing-text]');
            this.composer = this.root.querySelector('[data-message-composer]');
            this.composerForm = this.root.querySelector('[data-message-form]');
            this.messageInput = this.root.querySelector('[data-message-input]');
            this.attachmentTrigger = this.root.querySelector('[data-attachment-trigger]');
            this.attachmentInput = this.root.querySelector('[data-attachment-input]');
            this.attachmentPreview = this.root.querySelector('[data-attachment-preview]');
            this.sendButton = this.root.querySelector('[data-send-button]');
            this.toggleInboxButton = document.querySelector('[data-toggle-inbox]');
        }

        ensureToastHost() {
            this.toastHost = document.querySelector('.toast-host');
            if (!this.toastHost) {
                this.toastHost = document.createElement('div');
                this.toastHost.className = 'toast-host';
                document.body.appendChild(this.toastHost);
            }
        }

        bindTabControls() {
            this.tabButtons.forEach((button) => {
                button.addEventListener('click', () => {
                    const tab = button.getAttribute('data-tab-trigger');
                    if (tab) {
                        this.switchTab(tab);
                    }
                });
            });
            if (this.newChatButton) {
                this.newChatButton.addEventListener('click', () => {
                    this.switchTab('contacts');
                    if (this.contactsSearchInput) {
                        this.contactsSearchInput.focus();
                    }
                });
            }
        }

        bindSidebarToggle() {
            if (!this.toggleInboxButton) {
                return;
            }
            this.toggleInboxButton.addEventListener('click', () => {
                if (this.chatShell.classList.contains('is-mobile-chat-open')) {
                    this.closeConversation();
                } else {
                    this.chatShell.classList.remove('is-mobile-chat-open');
                    if (this.sidebar) {
                        this.sidebar.scrollTop = 0;
                    }
                }
            });
        }

        bindChatList() {
            if (!this.chatList) {
                return;
            }
            this.chatList.addEventListener('click', (event) => {
                const item = event.target.closest('[data-chat-id]');
                if (!item) {
                    return;
                }
                const chatId = Number(item.getAttribute('data-chat-id'));
                if (Number.isNaN(chatId)) {
                    return;
                }
                this.openChat(chatId);
            });
        }

        bindContacts() {
            if (this.contactsSearchForm) {
                this.contactsSearchForm.addEventListener('submit', (event) => {
                    event.preventDefault();
                    const query = (this.contactsSearchInput?.value || '').trim();
                    if (!query) {
                        this.showToast('Enter a name or @username to search.');
                        return;
                    }
                    if (!this.isSocketReady()) {
                        this.showToast('Still connecting. Try again in a moment.');
                        return;
                    }
                    this.contactsSearchForm.classList.add('is-loading');
                    this.emitSocket('contacts:search', { query }, (response) => {
                        this.contactsSearchForm.classList.remove('is-loading');
                        if (!response?.ok) {
                            this.showToast(response?.error || 'Search failed.');
                            return;
                        }
                        this.renderSearchResults(response.results || []);
                    });
                });
            }

            const handleAction = (event) => {
                const button = event.target.closest('[data-contact-action]');
                if (!button || !this.isSocketReady()) {
                    return;
                }
                const action = button.getAttribute('data-contact-action');
                const requestId = Number(button.getAttribute('data-request-id'));
                const userId = Number(button.getAttribute('data-user-id'));
                button.disabled = true;
                switch (action) {
                    case 'accept':
                        this.emitSocket(
                            'friend:respond',
                            { request_id: requestId, action: 'accept' },
                            (response) => {
                                button.disabled = false;
                                if (!response?.ok) {
                                    this.showToast(response?.error || 'Unable to accept request.');
                                }
                            }
                        );
                        break;
                    case 'decline':
                        this.emitSocket(
                            'friend:respond',
                            { request_id: requestId, action: 'decline' },
                            (response) => {
                                button.disabled = false;
                                if (!response?.ok) {
                                    this.showToast(response?.error || 'Unable to decline request.');
                                }
                            }
                        );
                        break;
                    case 'cancel':
                        this.emitSocket('friend:cancel', { request_id: requestId }, (response) => {
                            button.disabled = false;
                            if (!response?.ok) {
                                this.showToast(response?.error || 'Unable to cancel request.');
                            }
                        });
                        break;
                    case 'remove':
                        this.emitSocket('friend:remove', { friend_id: userId }, (response) => {
                            button.disabled = false;
                            if (!response?.ok) {
                                this.showToast(response?.error || 'Unable to remove friend.');
                            }
                        });
                        break;
                    case 'chat':
                        this.startChatWithUser(userId);
                        button.disabled = false;
                        break;
                    case 'add':
                        this.emitSocket('friend:send_request', { user_id: userId }, (response) => {
                            button.disabled = false;
                            if (!response?.ok) {
                                this.showToast(response?.error || 'Unable to send request.');
                            } else {
                                this.showToast('Friend request sent.');
                            }
                        });
                        break;
                    default:
                        button.disabled = false;
                        break;
                }
            };

            if (this.incomingList) {
                this.incomingList.addEventListener('click', handleAction);
            }
            if (this.outgoingList) {
                this.outgoingList.addEventListener('click', handleAction);
            }
            if (this.friendsList) {
                this.friendsList.addEventListener('click', handleAction);
            }
            if (this.contactsResults) {
                this.contactsResults.addEventListener('click', handleAction);
            }
        }

        bindComposer() {
            if (this.composerForm) {
                this.composerForm.addEventListener('submit', (event) => {
                    event.preventDefault();
                    this.sendMessage();
                });
            }
            if (this.messageInput) {
                this.messageInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        this.sendMessage();
                    }
                });
                this.messageInput.addEventListener('input', () => {
                    this.autoResizeInput();
                    this.emitTyping();
                });
            }
            if (this.scrollButton && this.messageList) {
                this.messageList.addEventListener('scroll', () => {
                    const nearBottom =
                        this.messageList.scrollHeight - this.messageList.scrollTop - this.messageList.clientHeight <
                        160;
                    this.scrollButton.hidden = nearBottom;
                });
                this.scrollButton.addEventListener('click', () => {
                    this.scrollToBottom(true);
                });
            }
            if (this.closeConversationButton) {
                this.closeConversationButton.addEventListener('click', () => {
                    this.closeConversation();
                });
            }
            if (this.openProfileButton) {
                this.openProfileButton.addEventListener('click', () => {
                    this.switchTab('contacts');
                });
            }
            if (this.attachmentTrigger && this.attachmentInput) {
                this.attachmentTrigger.addEventListener('click', () => {
                    this.attachmentInput.click();
                });
            }
            if (this.attachmentInput) {
                this.attachmentInput.addEventListener('change', async (event) => {
                    const files = Array.from(event.target.files || []);
                    if (!files.length) {
                        return;
                    }
                    await this.addAttachments(files);
                    this.attachmentInput.value = '';
                });
            }
            if (this.attachmentPreview) {
                this.attachmentPreview.addEventListener('click', (event) => {
                    const button = event.target.closest('[data-remove-attachment]');
                    if (!button) {
                        return;
                    }
                    const index = Number(button.getAttribute('data-remove-attachment'));
                    this.removeAttachment(index);
                });
            }
        }

        bindProfileForm() {
            if (!this.profileForm) {
                return;
            }
            this.profileForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.saveProfile();
            });
            if (this.profileBioInput && this.profileBioCount) {
                this.profileBioInput.addEventListener('input', () => {
                    this.profileBioCount.textContent = String(this.profileBioInput.value.length);
                });
            }
            if (this.profileAvatarInput) {
                this.profileAvatarInput.addEventListener('change', async (event) => {
                    const file = event.target.files && event.target.files[0];
                    if (!file) {
                        return;
                    }
                    if (!file.type.startsWith('image/')) {
                        this.showToast('Please choose an image file.');
                        return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                        this.showToast('Avatar too large (max 5MB).');
                        return;
                    }
                    try {
                        const dataUrl = await readFileAsDataUrl(file);
                        this.profileAvatarPayload = {
                            name: file.name,
                            mimetype: file.type,
                            data: dataUrl,
                        };
                        this.updateProfileAvatarPreview(dataUrl);
                    } catch (error) {
                        console.error('Failed to read avatar file.', error);
                        this.showToast('Unable to process avatar.');
                    }
                });
            }
            if (this.profileAvatarRemove) {
                this.profileAvatarRemove.addEventListener('click', () => {
                    this.profileAvatarPayload = { remove: true };
                    this.updateProfileAvatarPreview(null);
                });
            }
        }

        setupSocket() {
            if (this.socket || this.socketLoading) {
                return;
            }
            if (typeof window.io !== 'function') {
                if (document.querySelector('script[data-socket-fallback]')) {
                    console.error('Socket.IO client not found.');
                    this.showToast('Realtime features unavailable (missing Socket.IO client).');
                    return;
                }
                this.socketLoading = true;
                const script = document.createElement('script');
                script.src = SOCKET_IO_CLIENT_SRC;
                script.async = true;
                script.setAttribute('data-socket-fallback', 'true');
                script.onload = () => {
                    this.socketLoading = false;
                    this.setupSocket();
                };
                script.onerror = () => {
                    this.socketLoading = false;
                    console.error('Failed to load Socket.IO client.');
                    this.showToast('Unable to load realtime client. Check your connection.');
                };
                document.head.appendChild(script);
                return;
            }
            this.socket = window.io({
                reconnection: true,
                reconnectionDelay: 500,
                reconnectionDelayMax: 5000,
                withCredentials: true,
            });

            this.socket.on('connect', () => {
                this.updatePresence('Online');
                this.connectionErrorNotified = false;
                this.emitSocket('initialize', {}, (response) => {
                    if (response?.ok && response.state) {
                        this.applyState(response.state);
                    }
                });
            });

            this.socket.on('disconnect', () => {
                this.updatePresence('Offline');
            });

            this.socket.io.on('reconnect_attempt', () => {
                this.updatePresence('Reconnecting…');
            });

            this.socket.on('reconnect', () => {
                this.updatePresence('Online');
                this.connectionErrorNotified = false;
                this.emitSocket('initialize', {}, (response) => {
                    if (response?.ok && response.state) {
                        this.applyState(response.state);
                        if (this.state.ui.activeChatId) {
                            this.openChat(this.state.ui.activeChatId, { force: true });
                        }
                    }
                });
                this.showToast('Reconnected to NovaTalk.');
            });

            this.socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error);
                this.updatePresence('Connection lost');
                if (!this.connectionErrorNotified) {
                    this.showToast('Unable to reach NovaTalk. Retrying…');
                    this.connectionErrorNotified = true;
                }
            });

            this.socket.on('chat:history', (payload) => {
                this.handleChatHistory(payload);
            });

            this.socket.on('new_message', (payload) => {
                this.handleIncomingMessage(payload);
            });

            this.socket.on('contacts:update', (payload) => {
                if (payload?.contacts) {
                    this.state.contacts = payload.contacts;
                    this.state.ui.pendingCount = payload.pendingCount || 0;
                    this.renderContacts();
                }
            });

            this.socket.on('friend:update', (payload) => {
                if (payload?.pending_count !== undefined) {
                    this.state.ui.pendingCount = payload.pending_count;
                    this.updatePendingBadges();
                }
                if (payload?.action === 'request_received') {
                    this.showToast(
                        `${payload.from_user?.display_name || 'A user'} sent you a friend request.`
                    );
                } else if (payload?.action === 'request_accepted') {
                    this.showToast(
                        `${payload.from_user?.display_name || 'A user'} accepted your friend request.`
                    );
                } else if (payload?.action === 'friend_removed') {
                    this.showToast(
                        `${payload.from_user?.display_name || 'A user'} removed you as a friend.`
                    );
                }
            });

            this.socket.on('profile:update', (payload) => {
                if (payload?.user) {
                    this.state.user = payload.user;
                    this.renderSidebarProfile();
                    this.renderProfileForm();
                }
            });

            this.socket.on('chat:typing', (payload) => {
                this.handleTyping(payload);
            });
        }

        emitSocket(event, payload, callback) {
            if (!this.isSocketReady()) {
                return;
            }
            try {
                this.socket.timeout(6000).emit(event, payload, (error, response) => {
                    if (typeof callback === 'function') {
                        if (error) {
                            callback({ ok: false, error: error.message || 'Request timed out.' });
                        } else {
                            callback(response);
                        }
                    }
                });
            } catch (error) {
                console.error(`Socket emit failed for ${event}`, error);
                if (typeof callback === 'function') {
                    callback({ ok: false, error: 'Socket error.' });
                }
            }
        }

        applyState(nextState) {
            if (nextState.user) {
                this.state.user = nextState.user;
            }
            if (Array.isArray(nextState.chats)) {
                this.state.chats = nextState.chats;
            }
            if (nextState.contacts) {
                this.state.contacts = nextState.contacts;
            }
            if (nextState.ui) {
                this.state.ui = {
                    ...this.state.ui,
                    ...nextState.ui,
                };
            }
            this.renderSidebarProfile();
            this.renderChats();
            this.renderContacts();
            this.renderProfileForm();
            this.updatePendingBadges();
        }

        switchTab(tab) {
            this.state.ui.activeTab = tab;
            this.tabButtons.forEach((button) => {
                const matches = button.getAttribute('data-tab-trigger') === tab;
                button.classList.toggle('is-active', matches);
            });
            this.tabPanels.forEach((panel) => {
                const matches = panel.getAttribute('data-tab-panel') === tab;
                panel.classList.toggle('is-visible', matches);
                if (matches) {
                    panel.removeAttribute('hidden');
                } else {
                    panel.setAttribute('hidden', 'true');
                }
            });
        }

        renderSidebarProfile() {
            if (this.profileName) {
                this.profileName.textContent = this.state.user.display_name || 'NovaTalk user';
            }
            if (this.profileUsername) {
                this.profileUsername.textContent = this.state.user.username
                    ? `@${this.state.user.username.replace(/^@/, '')}`
                    : '';
            }
            if (this.profileAvatar) {
                this.setAvatar(this.profileAvatar, {
                    avatar: this.state.user.avatar_url || this.state.user.avatar,
                    display: this.state.user.display_name,
                });
            }
            if (this.profileAvatarLarge) {
                this.setAvatar(this.profileAvatarLarge, {
                    avatar: this.state.user.avatar_url || this.state.user.avatar,
                    display: this.state.user.display_name,
                });
            }
        }

        renderProfileForm() {
            if (!this.profileForm) {
                return;
            }
            if (this.profileDisplayInput) {
                this.profileDisplayInput.value = this.state.user.display_name || '';
            }
            if (this.profileBioInput) {
                this.profileBioInput.value = this.state.user.bio || '';
                if (this.profileBioCount) {
                    this.profileBioCount.textContent = String(this.profileBioInput.value.length);
                }
            }
            if (this.profileEmailInput) {
                this.profileEmailInput.value = this.state.user.email || '';
            }
        }

        renderChats() {
            if (!this.chatList) {
                return;
            }
            this.chatList.innerHTML = '';
            if (this.state.chats.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.innerHTML = `
                    <span class="material-symbols-rounded" aria-hidden="true">forum</span>
                    <p>No chats yet. Start a conversation from Contacts.</p>
                `;
                this.chatList.appendChild(empty);
                if (this.chatsCount) {
                    this.chatsCount.hidden = true;
                }
                return;
            }
            if (this.chatsCount) {
                this.chatsCount.hidden = false;
                this.chatsCount.textContent = String(this.state.chats.length);
            }
            const fragment = document.createDocumentFragment();
            this.state.chats.forEach((chat) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'chat-item';
                button.setAttribute('data-chat-id', String(chat.id));
                if (chat.id === this.state.ui.activeChatId) {
                    button.classList.add('is-active');
                }
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                this.setAvatar(avatar, {
                    avatar: chat.is_group ? chat.avatar : chat.partner?.avatar,
                    display: chat.name || chat.partner?.display_name,
                });
                const meta = document.createElement('div');
                meta.className = 'chat-item__meta';
                const name = document.createElement('div');
                name.className = 'chat-item__name';
                name.textContent = chat.name || 'Conversation';
                const preview = document.createElement('div');
                preview.className = 'chat-item__preview';
                const subtitleParts = [];
                if (chat.last_message?.sender?.id && chat.last_message.sender.id !== this.state.user.id) {
                    subtitleParts.push(`${chat.last_message.sender.display_name}:`);
                } else if (chat.last_message?.sender?.id === this.state.user.id) {
                    subtitleParts.push('You:');
                }
                if (chat.last_message?.body) {
                    subtitleParts.push(truncate(chat.last_message.body, 60));
                } else if (chat.last_message?.attachments?.length) {
                    subtitleParts.push('Sent an attachment');
                } else {
                    subtitleParts.push('No messages yet.');
                }
                preview.textContent = subtitleParts.join(' ');
                meta.appendChild(name);
                meta.appendChild(preview);
                const aside = document.createElement('div');
                aside.className = 'meta-note';
                aside.textContent = chat.updated_at ? formatRelative(chat.updated_at) : '';
                button.appendChild(avatar);
                button.appendChild(meta);
                button.appendChild(aside);
                fragment.appendChild(button);
            });
            this.chatList.appendChild(fragment);
        }

        renderContacts() {
            this.updatePendingBadges();
            this.renderContactList(this.incomingList, this.state.contacts.incoming, 'incoming');
            this.renderContactList(this.outgoingList, this.state.contacts.outgoing, 'outgoing');
            this.renderContactList(this.friendsList, this.state.contacts.friends, 'friends');
        }

        renderContactList(container, entries, variant) {
            if (!container) {
                return;
            }
            container.innerHTML = '';
            if (!entries || entries.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'empty-state small';
                empty.textContent =
                    variant === 'incoming'
                        ? 'No pending requests.'
                        : variant === 'outgoing'
                        ? 'No outgoing requests.'
                        : 'Add a friend to start chatting instantly.';
                container.appendChild(empty);
                return;
            }
            const fragment = document.createDocumentFragment();
            entries.forEach((entry) => {
                const card = document.createElement('div');
                card.className = 'contact-card';
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                this.setAvatar(avatar, {
                    avatar: entry.user?.avatar,
                    display: entry.user?.display_name,
                });
                const meta = document.createElement('div');
                meta.className = 'contact-card__meta';
                const name = document.createElement('strong');
                name.textContent = entry.user?.display_name || 'Unknown user';
                const subtitle = document.createElement('span');
                if (variant === 'incoming') {
                    subtitle.textContent = `Received ${formatRelative(entry.created_at)}`;
                } else if (variant === 'outgoing') {
                    subtitle.textContent = `Sent ${formatRelative(entry.created_at)}`;
                } else {
                    subtitle.textContent = `Friends since ${formatRelative(entry.since)}`;
                }
                meta.appendChild(name);
                meta.appendChild(subtitle);
                const actions = document.createElement('div');
                actions.className = 'contact-card__actions';
                if (variant === 'incoming') {
                    actions.appendChild(this.createContactButton('Accept', 'accept', {
                        request_id: entry.id,
                    }));
                    actions.appendChild(this.createContactButton('Decline', 'decline', {
                        request_id: entry.id,
                    }, true));
                } else if (variant === 'outgoing') {
                    actions.appendChild(this.createContactButton('Cancel', 'cancel', {
                        request_id: entry.id,
                    }, true));
                } else {
                    actions.appendChild(this.createContactButton('Open chat', 'chat', {
                        user_id: entry.user?.id,
                    }));
                    actions.appendChild(this.createContactButton('Remove', 'remove', {
                        user_id: entry.user?.id,
                    }, true));
                }
                card.appendChild(avatar);
                card.appendChild(meta);
                card.appendChild(actions);
                fragment.appendChild(card);
            });
            container.appendChild(fragment);
        }

        renderSearchResults(results) {
            if (!this.contactsResults) {
                return;
            }
            this.contactsResults.hidden = false;
            this.contactsResults.innerHTML = '';
            if (!results.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-state small';
                empty.textContent = 'No users found. Try a different search.';
                this.contactsResults.appendChild(empty);
                return;
            }
            const fragment = document.createDocumentFragment();
            results.forEach((user) => {
                const card = document.createElement('div');
                card.className = 'result-card';
                const avatar = document.createElement('div');
                avatar.className = 'avatar';
                this.setAvatar(avatar, { avatar: user.avatar, display: user.display_name });
                const meta = document.createElement('div');
                meta.className = 'result-card__meta';
                const name = document.createElement('strong');
                name.textContent = user.display_name || 'NovaTalk user';
                const username = document.createElement('span');
                username.textContent = user.username ? `@${user.username.replace(/^@/, '')}` : '';
                meta.appendChild(name);
                meta.appendChild(username);
                const actions = document.createElement('div');
                actions.className = 'result-card__actions';
                actions.appendChild(
                    this.createContactButton('Add friend', 'add', { user_id: user.id }, false)
                );
                actions.appendChild(
                    this.createContactButton('Open chat', 'chat', { user_id: user.id }, true)
                );
                card.appendChild(avatar);
                card.appendChild(meta);
                card.appendChild(actions);
                fragment.appendChild(card);
            });
            this.contactsResults.appendChild(fragment);
        }

        createContactButton(label, action, data, tonal) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = tonal ? 'md-text-button md-ripple' : 'md-filled-button md-ripple';
            button.textContent = label;
            button.setAttribute('data-contact-action', action);
            if (data?.request_id) {
                button.setAttribute('data-request-id', String(data.request_id));
            }
            if (data?.user_id) {
                button.setAttribute('data-user-id', String(data.user_id));
            }
            return button;
        }

        updatePendingBadges() {
            const pending = Number(this.state.ui.pendingCount || 0);
            const apply = (badge) => {
                if (!badge) {
                    return;
                }
                if (pending > 0) {
                    badge.hidden = false;
                    badge.textContent = String(pending);
                } else {
                    badge.hidden = true;
                }
            };
            apply(this.pendingBadge);
            apply(this.pendingBadgeInline);
        }

        setAvatar(target, { avatar, display }) {
            if (!target) {
                return;
            }
            target.innerHTML = '';
            if (avatar) {
                const img = document.createElement('img');
                img.src = avatar;
                img.alt = display || 'User avatar';
                target.appendChild(img);
                return;
            }
            const text = (display || '?').trim();
            target.textContent = text ? text.charAt(0).toUpperCase() : '?';
        }

        getMessagePreview(message) {
            if (!message) {
                return '';
            }
            if (message.is_deleted) {
                return 'Message deleted';
            }
            const body = typeof message.body === 'string' ? message.body.trim() : '';
            if (body) {
                return body.length > 140 ? `${body.slice(0, 137)}…` : body;
            }
            if (Array.isArray(message.attachments) && message.attachments.length) {
                return '📷 Photo';
            }
            return 'New message';
        }

        openChat(chatId, options = {}) {
            if (!chatId) {
                return;
            }
            const chat = this.state.chats.find((item) => item.id === chatId);
            if (!chat) {
                this.showToast('Chat not found.');
                return;
            }
            if (!this.isSocketReady()) {
                this.showToast('Still connecting. Try again in a moment.');
                return;
            }
            this.state.ui.activeChatId = chatId;
            this.renderChats();
            this.conversationEmpty.hidden = true;
            this.conversationBody.hidden = false;
            this.chatShell.classList.add('is-mobile-chat-open');
            this.updateConversationHeader(chat);
            const messages = this.messageStore.get(chatId);
            if (messages && !options.force) {
                this.renderMessages(chatId, messages);
            } else {
                this.showConversationLoader();
                this.emitSocket('chat:open', { chat_id: chatId }, (response) => {
                    if (!response?.ok && response?.error) {
                        this.showToast(response.error);
                    }
                });
            }
        }

        closeConversation() {
            this.state.ui.activeChatId = null;
            this.conversationBody.hidden = true;
            this.conversationEmpty.hidden = false;
            this.chatShell.classList.remove('is-mobile-chat-open');
            if (this.messageList) {
                this.messageList.innerHTML = '';
            }
        }

        showConversationLoader() {
            if (this.messageList) {
                this.messageList.innerHTML = `
                    <div class="empty-state small">
                        <p>Loading conversation…</p>
                    </div>
                `;
            }
        }

        updateConversationHeader(chat) {
            if (this.conversationTitle) {
                this.conversationTitle.textContent = chat.name || 'Conversation';
            }
            if (this.conversationSubtitle) {
                const parts = [];
                if (chat.is_group) {
                    parts.push(`${chat.members?.length || 0} participants`);
                } else if (chat.partner) {
                    parts.push(chat.partner.display_name || '');
                    if (chat.partner.username) {
                        parts.push(`@${chat.partner.username.replace(/^@/, '')}`);
                    }
                }
                if (chat.last_message?.created_at) {
                    parts.push(`Updated ${formatRelative(chat.last_message.created_at)}`);
                }
                this.conversationSubtitle.textContent = parts.filter(Boolean).join(' · ');
            }
            if (this.conversationAvatar) {
                this.setAvatar(this.conversationAvatar, {
                    avatar: chat.is_group ? chat.avatar : chat.partner?.avatar,
                    display: chat.name || chat.partner?.display_name,
                });
            }
            if (this.openProfileButton) {
                this.openProfileButton.hidden = !chat.partner;
            }
        }

        handleChatHistory(payload) {
            if (!payload?.ok) {
                if (payload?.error) {
                    this.showToast(payload.error);
                }
                return;
            }
            if (!payload.chat_id || !Array.isArray(payload.messages)) {
                return;
            }
            this.messageStore.set(payload.chat_id, payload.messages);
            const chatIndex = this.state.chats.findIndex((item) => item.id === payload.chat_id);
            if (chatIndex >= 0 && payload.chat) {
                this.state.chats[chatIndex] = payload.chat;
                this.renderChats();
            }
            if (this.state.ui.activeChatId === payload.chat_id) {
                this.renderMessages(payload.chat_id, payload.messages);
                this.updateConversationHeader(payload.chat);
            }
        }

        renderMessages(chatId, messages) {
            if (!this.messageList) {
                return;
            }
            this.messageList.innerHTML = '';
            const groups = groupMessagesByDay(messages);
            const fragment = document.createDocumentFragment();
            groups.forEach((group) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'message-day';
                const label = document.createElement('div');
                label.className = 'message-day__label';
                label.textContent = group.label;
                wrapper.appendChild(label);
                group.items.forEach((message) => {
                    const isOutgoing = message.sender?.id === this.state.user.id;
                    const messageEl = document.createElement('div');
                    messageEl.className = 'message';
                    if (isOutgoing) {
                        messageEl.classList.add('message--outgoing');
                    }
                    const header = document.createElement('div');
                    header.className = 'message__header';
                    const author = document.createElement('span');
                    author.className = 'message__author';
                    author.textContent = message.sender?.display_name || 'Unknown';
                const time = document.createElement('time');
                time.className = 'message__time';
                time.dateTime = message.created_at;
                time.textContent = formatTime(message.created_at);
                header.appendChild(author);
                header.appendChild(time);
                const bubble = document.createElement('div');
                bubble.className = 'message__bubble';
                const text = document.createElement('p');
                text.className = 'message__text';
                if (message.is_deleted) {
                    text.classList.add('message__text--deleted');
                    text.textContent = 'This message has been deleted.';
                } else {
                    text.textContent = message.body || '';
                    if (message.edited) {
                        const editedTag = document.createElement('span');
                        editedTag.className = 'message__edited-tag';
                        editedTag.textContent = ' (edited)';
                        text.appendChild(editedTag);
                    }
                }
                bubble.appendChild(text);
                messageEl.appendChild(header);
                messageEl.appendChild(bubble);
                if (!message.is_deleted && message.attachments && message.attachments.length) {
                    const attachments = document.createElement('div');
                    attachments.className = 'message__attachments';
                    message.attachments.forEach((attachment) => {
                        const link = document.createElement('a');
                        link.className = 'message__attachment';
                            link.href = attachment.url || attachment.download_url || '#';
                            link.addEventListener('click', (event) => event.preventDefault());
                            const img = document.createElement('img');
                            img.src = attachment.url || attachment.preview_url || attachment.download_url;
                            img.alt = attachment.filename || 'Attachment';
                            link.appendChild(img);
                            attachments.appendChild(link);
                        });
                        messageEl.appendChild(attachments);
                    }
                    wrapper.appendChild(messageEl);
                });
                fragment.appendChild(wrapper);
            });
            this.messageList.appendChild(fragment);
            this.scrollToBottom(true);
            if (this.viewer) {
                this.viewer.update();
            }
        }

        notifyNewMessage(message) {
            if (!message || message.sender?.id === this.state.user.id) {
                return;
            }
            if (typeof window.NovaTalk?.playNotificationTone === 'function') {
                try {
                    window.NovaTalk.playNotificationTone();
                } catch (error) {
                    // ignore playback issues
                }
            } else {
                this.playNotificationSound();
            }
            if (!('Notification' in window)) {
                return;
            }
            if (Notification.permission === 'default') {
                try {
                    window.NovaTalk?.requestNotificationPermission?.();
                } catch (error) {
                    // ignore
                }
            }
            if (Notification.permission !== 'granted') {
                return;
            }
            const title = message.sender?.display_name || 'New message';
            const body = this.getMessagePreview(message);
            try {
                const notification = new Notification(title, {
                    body,
                    tag: `chat-${message.chat_id}`,
                    renotify: true,
                    data: { chatId: message.chat_id },
                });
                notification.addEventListener('click', () => {
                    window.focus();
                    if (message.chat_id) {
                        this.openChat(message.chat_id, { force: true });
                    }
                    try {
                        notification.close();
                    } catch (error) {
                        // ignore close issues
                    }
                });
            } catch (error) {
                // ignore notification errors silently
            }
        }

        handleIncomingMessage(message) {
            if (!message?.chat_id) {
                return;
            }
            const existing = this.messageStore.get(message.chat_id) || [];
            existing.push(message);
            this.messageStore.set(message.chat_id, existing);
            const chatIndex = this.state.chats.findIndex((chat) => chat.id === message.chat_id);
            if (chatIndex >= 0) {
                const chat = this.state.chats[chatIndex];
                chat.last_message = message;
                chat.updated_at = message.created_at;
                this.state.chats.splice(chatIndex, 1);
                this.state.chats.unshift(chat);
            }
            this.renderChats();
            if (this.state.ui.activeChatId === message.chat_id) {
                this.renderMessages(message.chat_id, existing);
            } else if (message.sender?.id !== this.state.user.id) {
                this.notifyNewMessage(message);
                this.showToast(`${message.sender?.display_name || 'Someone'} sent you a message.`);
            }
        }

        emitTyping() {
            if (!this.isSocketReady() || !this.state.ui.activeChatId) {
                return;
            }
            if (this.typingTimeout) {
                clearTimeout(this.typingTimeout);
            } else {
                this.socket.emit('chat:typing', { chat_id: this.state.ui.activeChatId });
            }
            this.typingTimeout = setTimeout(() => {
                if (this.isSocketReady() && this.state.ui.activeChatId) {
                    this.socket.emit('chat:stop_typing', { chat_id: this.state.ui.activeChatId });
                }
                this.typingTimeout = null;
            }, 1800);
        }

        handleTyping(payload) {
            if (!payload || payload.chat_id !== this.state.ui.activeChatId || !payload.user) {
                return;
            }
            const key = payload.user.id;
            clearTimeout(this.typingTimers.get(key));
            if (payload.is_typing) {
                this.typingIndicator.hidden = false;
                if (this.typingText) {
                    this.typingText.textContent = `${payload.user.display_name || 'Someone'} is typing…`;
                }
                const timer = setTimeout(() => {
                    this.typingIndicator.hidden = true;
                }, 2500);
                this.typingTimers.set(key, timer);
            } else {
                this.typingIndicator.hidden = true;
            }
        }

        autoResizeInput() {
            if (!this.messageInput) {
                return;
            }
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = `${Math.min(this.messageInput.scrollHeight, 200)}px`;
        }

        scrollToBottom(force) {
            if (!this.messageList) {
                return;
            }
            if (force) {
                this.messageList.scrollTop = this.messageList.scrollHeight;
                this.scrollButton.hidden = true;
                return;
            }
            const nearBottom =
                this.messageList.scrollHeight - this.messageList.scrollTop - this.messageList.clientHeight < 160;
            if (nearBottom) {
                this.messageList.scrollTop = this.messageList.scrollHeight;
                this.scrollButton.hidden = true;
            } else {
                this.scrollButton.hidden = false;
            }
        }

        async addAttachments(files) {
            const limit = 6;
            const available = Math.max(0, limit - this.attachmentQueue.length);
            const selection = files.slice(0, available);
            if (selection.length < files.length) {
                this.showToast(`Only ${limit} attachments allowed per message.`);
            }
            for (const file of selection) {
                if (!file.type.startsWith('image/')) {
                    this.showToast('Only image attachments are supported right now.');
                    continue;
                }
                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    this.attachmentQueue.push({
                        name: file.name,
                        mimetype: file.type,
                        dataUrl,
                    });
                } catch (error) {
                    console.error('Attachment read failed.', error);
                    this.showToast(`Failed to load ${file.name}.`);
                }
            }
            this.renderAttachmentPreview();
        }

        removeAttachment(index) {
            if (index < 0 || index >= this.attachmentQueue.length) {
                return;
            }
            this.attachmentQueue.splice(index, 1);
            this.renderAttachmentPreview();
        }

        renderAttachmentPreview() {
            if (!this.attachmentPreview) {
                return;
            }
            this.attachmentPreview.innerHTML = '';
            if (!this.attachmentQueue.length) {
                this.attachmentPreview.hidden = true;
                return;
            }
            const fragment = document.createDocumentFragment();
            this.attachmentQueue.forEach((attachment, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'composer-attachment';
                const img = document.createElement('img');
                img.src = attachment.dataUrl;
                img.alt = attachment.name || 'Attachment preview';
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.setAttribute('data-remove-attachment', String(index));
                remove.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span>';
                wrapper.appendChild(img);
                wrapper.appendChild(remove);
                fragment.appendChild(wrapper);
            });
            this.attachmentPreview.appendChild(fragment);
            this.attachmentPreview.hidden = false;
        }

        async sendMessage() {
            if (!this.isSocketReady()) {
                this.showToast('You are offline. Please wait for reconnection.');
                return;
            }
            if (!this.state.ui.activeChatId) {
                this.showToast('Select a conversation first.');
                return;
            }
            const rawText = (this.messageInput?.value || '').trim();
            if (!rawText && this.attachmentQueue.length === 0) {
                this.showToast('Message cannot be empty.');
                return;
            }
            if (this.isSending) {
                return;
            }
            this.isSending = true;
            this.sendButton?.setAttribute('data-loading', 'true');
            const attachments = this.attachmentQueue.map((item) => ({
                name: item.name,
                mimetype: item.mimetype,
                data: item.dataUrl,
            }));
            this.emitSocket(
                'send_message',
                {
                    chat_id: this.state.ui.activeChatId,
                    body: rawText,
                    attachments,
                },
                (response) => {
                    this.isSending = false;
                    this.sendButton?.removeAttribute('data-loading');
                    if (!response?.ok) {
                        this.showToast(response?.error || 'Failed to send message.');
                        return;
                    }
                    if (this.messageInput) {
                        this.messageInput.value = '';
                        this.autoResizeInput();
                    }
                    this.attachmentQueue = [];
                    this.renderAttachmentPreview();
                }
            );
        }

        startChatWithUser(userId) {
            if (!this.isSocketReady() || !userId) {
                return;
            }
            this.emitSocket('chat:create', { type: 'direct', user_id: userId }, (response) => {
                if (!response?.ok) {
                    this.showToast(response?.error || 'Unable to start chat.');
                    return;
                }
                if (response.chat) {
                    const existingIndex = this.state.chats.findIndex((chat) => chat.id === response.chat.id);
                    if (existingIndex >= 0) {
                        this.state.chats.splice(existingIndex, 1);
                    }
                    this.state.chats.unshift(response.chat);
                    this.renderChats();
                    this.switchTab('chats');
                    this.openChat(response.chat.id);
                }
            });
        }

        saveProfile() {
            if (!this.isSocketReady()) {
                this.showToast('You are offline. Unable to save profile.');
                return;
            }
            const payload = {
                display_name: this.profileDisplayInput?.value || '',
                bio: this.profileBioInput?.value || '',
            };
            if (this.profileAvatarPayload) {
                payload.avatar = this.profileAvatarPayload;
            }
            this.emitSocket('me:update', payload, (response) => {
                if (!response?.ok) {
                    this.showToast(response?.error || 'Failed to update profile.');
                    return;
                }
                if (response.user) {
                    this.state.user = response.user;
                    this.renderSidebarProfile();
                    this.renderProfileForm();
                    this.profileAvatarPayload = null;
                    this.showToast('Profile updated.');
                }
            });
        }

        updateProfileAvatarPreview(dataUrl) {
            if (!this.profileAvatarLarge) {
                return;
            }
            this.setAvatar(this.profileAvatarLarge, {
                avatar: dataUrl,
                display: this.profileDisplayInput?.value || this.state.user.display_name,
            });
        }

        updatePresence(text) {
            if (this.presenceText) {
                this.presenceText.textContent = text;
            }
            if (this.presenceIndicator) {
                const online = text.toLowerCase().includes('online');
                this.presenceIndicator.style.background = online ? '#22c55e' : '#ef4444';
            }
        }

        showToast(message) {
            if (!this.toastHost) {
                return;
            }
            const toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = message;
            this.toastHost.appendChild(toast);
            setTimeout(() => {
                toast.classList.add('transition-layer');
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, 10px)';
                setTimeout(() => {
                    toast.remove();
                }, 260);
            }, 3600);
        }

        preloadNotificationAudio() {
            const audio = this.loadNotificationAudio();
            if (!audio) {
                return;
            }
            try {
                audio.load();
            } catch (error) {
                // ignore load errors silently
            }
        }

        loadNotificationAudio() {
            if (typeof Audio === 'undefined') {
                return null;
            }
            if (!this.notificationAudio) {
                const audio = new Audio('/static/media/ding.wav');
                audio.preload = 'auto';
                audio.setAttribute('data-sound', 'notification');
                this.notificationAudio = audio;
            }
            return this.notificationAudio;
        }

        resumeAudioContext() {
            if (!window.AudioContext && !window.webkitAudioContext) {
                return;
            }
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state !== 'suspended') {
                return;
            }
            const resume = () => {
                this.audioCtx.resume().catch(() => {});
                document.removeEventListener('click', resume);
            };
            document.addEventListener('click', resume, { once: true });
        }

        playSynthFallback() {
            if (!window.AudioContext && !window.webkitAudioContext) {
                return;
            }
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                return;
            }
            const ctx = this.audioCtx;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.0001, now);
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
            const cleanup = () => {
                osc.disconnect();
                gain.disconnect();
            };
            osc.addEventListener('ended', cleanup, { once: true });
            osc.start(now);
            osc.stop(now + 0.32);
        }

        playNotificationSound() {
            const audio = this.loadNotificationAudio();
            if (audio) {
                try {
                    audio.currentTime = 0;
                } catch (error) {
                    // ignore seek issues
                }
                let attempt;
                try {
                    attempt = audio.play();
                } catch (error) {
                    this.playSynthFallback();
                    return;
                }
                if (attempt && typeof attempt.catch === 'function') {
                    attempt.catch(() => this.playSynthFallback());
                }
                return;
            }
            this.playSynthFallback();
        }

        isSocketReady() {
            return !!(this.socket && this.socket.connected);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const root = document.querySelector('[data-app]');
        if (!root) {
            return;
        }
        const app = new NovaTalkApp(root, initialState);
        app.init();
        window.NovaTalkApp = app;
    });
})();