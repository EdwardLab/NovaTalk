(function () {
    const root = document.querySelector('[data-chat-app]');
    if (!root) {
        return;
    }

    const stateElement = document.getElementById('nova-initial-state');
    let bootState = {};
    try {
        bootState = JSON.parse(stateElement?.textContent || '{}');
    } catch (error) {
        console.error('Failed to parse initial state payload.', error);
    }

    const DEFAULT_DATETIME_FORMAT = 'MM/DD/YYYY HH:mm';
    const SUPPORTED_DATETIME_FORMATS = [
        'MM/DD/YYYY HH:mm',
        'DD/MM/YYYY HH:mm',
        'YYYY-MM-DD HH:mm',
    ];
    const MIN_TIMEZONE_OFFSET = -12 * 60;
    const MAX_TIMEZONE_OFFSET = 14 * 60;
    const TIMEZONE_STEP = 30;
    const TIMEZONE_OPTIONS = [];

    const formatOffsetLabel = (minutes) => {
        const sign = minutes >= 0 ? '+' : '-';
        const absolute = Math.abs(minutes);
        const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
        const mins = String(absolute % 60).padStart(2, '0');
        const suffix = `${sign}${hours}:${mins}`;
        return minutes === 0 ? 'UTC (GMT+00:00)' : `GMT${suffix}`;
    };

    for (let minutes = MIN_TIMEZONE_OFFSET; minutes <= MAX_TIMEZONE_OFFSET; minutes += TIMEZONE_STEP) {
        TIMEZONE_OPTIONS.push({ value: minutes, label: formatOffsetLabel(minutes) });
    }

    const normalizeSettings = (settings) => {
        const rawTimezone = settings?.timezone || {};
        const mode = rawTimezone.mode === 'custom' ? 'custom' : 'system';
        let offset = Number(rawTimezone.offset);
        if (!Number.isFinite(offset)) {
            offset = 0;
        }
        offset = Math.round(offset);
        offset = Math.round(offset / TIMEZONE_STEP) * TIMEZONE_STEP;
        offset = Math.max(MIN_TIMEZONE_OFFSET, Math.min(MAX_TIMEZONE_OFFSET, offset));
        const format =
            typeof settings?.datetime_format === 'string' &&
            SUPPORTED_DATETIME_FORMATS.includes(settings.datetime_format)
                ? settings.datetime_format
                : DEFAULT_DATETIME_FORMAT;
        return {
            timezone: { mode, offset },
            datetime_format: format,
        };
    };

    const normalizedUser = {
        ...(bootState.user || {}),
        settings: normalizeSettings(bootState.user?.settings),
    };

    const state = {
        user: normalizedUser,
        chats: Array.isArray(bootState.chats) ? bootState.chats : [],
        contacts: bootState.contacts || { friends: [], incoming: [], outgoing: [] },
        ui: {
            activeChatId: bootState.ui?.activeChatId || null,
            activeTab: bootState.ui?.activeTab || 'chats',
            pendingCount: bootState.ui?.pendingCount || 0,
            pendingGroupInvites: bootState.ui?.pendingGroupInvites || 0,
            editingMessage: null,
        },
    };

    let activeDateSettings = normalizedUser.settings;

    const syncActiveSettings = () => {
        activeDateSettings = normalizeSettings(state.user?.settings);
        if (state.user) {
            state.user.settings = activeDateSettings;
        }
        return activeDateSettings;
    };

    const assignUser = (payload) => {
        state.user = {
            ...(payload || {}),
            settings: normalizeSettings(payload?.settings),
        };
        syncActiveSettings();
    };

    assignUser(state.user);

    if (!state.contacts.group_invites) {
        state.contacts.group_invites = { incoming: [], outgoing: [] };
    }

    if (typeof window.NovaTalk?.requestNotificationPermission === 'function') {
        window.NovaTalk.requestNotificationPermission();
    }

    const elements = {
        toastHost: root.querySelector('[data-toast-host]'),
        tabTriggers: Array.from(root.querySelectorAll('[data-tab-trigger]')),
        tabPanels: Array.from(root.querySelectorAll('[data-tab-panel]')),
        chatList: root.querySelector('[data-chat-list]'),
        chatsCount: root.querySelector('[data-chats-count]'),
        pendingBadge: root.querySelector('[data-pending-count]'),
        pendingBadgeInline: root.querySelector('[data-pending-count-inline]'),
        newChatButton: root.querySelector('[data-new-chat]'),
        sidebar: root.querySelector('[data-sidebar]'),
        messageFeed: root.querySelector('[data-message-feed]'),
        conversationPlaceholder: root.querySelector('[data-conversation-placeholder]'),
        conversationHeader: root.querySelector('[data-conversation-header]'),
        conversationTitle: root.querySelector('[data-conversation-title]'),
        conversationSubtitle: root.querySelector('[data-conversation-subtitle]'),
        conversationAvatar: root.querySelector('[data-conversation-avatar]'),
        closeConversation: root.querySelector('[data-close-conversation]'),
        composerForm: root.querySelector('[data-message-form]'),
        composerInput: root.querySelector('[data-message-input]'),
        sendButton: root.querySelector('[data-send-button]'),
        attachmentTrigger: root.querySelector('[data-attach-trigger]'),
        attachmentInput: root.querySelector('[data-attachment-input]'),
        attachmentPreview: root.querySelector('[data-attachment-preview]'),
        contactsSearchForm: root.querySelector('[data-contacts-search]'),
        contactsSearchInput: root.querySelector('[data-contacts-search-input]'),
        contactsResults: root.querySelector('[data-contacts-results]'),
        incomingList: root.querySelector('[data-incoming-list]'),
        outgoingList: root.querySelector('[data-outgoing-list]'),
        friendsList: root.querySelector('[data-friends-list]'),
        groupIncomingList: root.querySelector('[data-group-invite-incoming]'),
        groupOutgoingList: root.querySelector('[data-group-invite-outgoing]'),
        groupCreateForm: root.querySelector('[data-group-create-form]'),
        groupCreateName: root.querySelector('[data-group-create-name]'),
        groupCreateInvitees: root.querySelector('[data-group-create-invitees]'),
        profileAvatarSmall: root.querySelector('[data-profile-avatar]'),
        profileAvatarLarge: root.querySelector('[data-profile-avatar-large]'),
        profileName: root.querySelector('[data-profile-name]'),
        profileUsername: root.querySelector('[data-profile-username]'),
        profilePresence: root.querySelector('[data-presence-text]'),
        profilePresenceDot: root.querySelector('[data-presence-indicator]'),
        logoutButton: root.querySelector('[data-logout]'),
        profileForm: root.querySelector('[data-profile-form]'),
        profileDisplayName: root.querySelector('[data-profile-display-name]'),
        profileBio: root.querySelector('[data-profile-bio]'),
        profileBioCount: root.querySelector('[data-profile-bio-count]'),
        profileEmail: root.querySelector('[data-profile-email]'),
        profileSave: root.querySelector('[data-profile-save]'),
        profileDatetimeFormat: root.querySelector('[data-profile-datetime-format]'),
        profileTimezoneModes: Array.from(root.querySelectorAll('[data-profile-timezone-mode]')),
        profileTimezoneOffset: root.querySelector('[data-profile-timezone-offset]'),
        groupInviteButton: root.querySelector('[data-group-invite]'),
    };

    const populateTimezoneOptions = () => {
        const select = elements.profileTimezoneOffset;
        if (!select) {
            return;
        }
        select.innerHTML = '';
        TIMEZONE_OPTIONS.forEach((option) => {
            const node = document.createElement('option');
            node.value = String(option.value);
            node.textContent = option.label;
            select.appendChild(node);
        });
    };

    populateTimezoneOptions();

    const messageStore = new Map();
    const pendingAttachments = [];
    let viewer = null;
    let socket = null;

    const getMessageFeed = () => {
        const feed = root.querySelector('[data-message-feed]');
        if (feed && feed !== elements.messageFeed) {
            elements.messageFeed = feed;
        }
        return feed;
    };

    const handleMediaLoad = () => {
        scrollToBottom(true);
    };

    const observeMessageMedia = (container) => {
        if (!container) {
            return;
        }
        const mediaNodes = Array.from(container.querySelectorAll('img'));
        mediaNodes.forEach((node) => {
            if (node.dataset.scrollObserverAttached === 'true') {
                return;
            }
            node.dataset.scrollObserverAttached = 'true';
            if (node.complete) {
                requestAnimationFrame(() => scrollToBottom(true));
                return;
            }
            node.addEventListener('load', handleMediaLoad, { once: true });
            node.addEventListener('error', handleMediaLoad, { once: true });
        });
    };

    const appendUtcSuffix = (value) => {
        if (typeof value !== 'string') {
            return value;
        }
        if (value.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(value)) {
            return value;
        }
        return `${value}Z`;
    };

    const parseISODate = (value) => {
        if (!value) {
            return null;
        }
        const source = value instanceof Date ? value.toISOString() : appendUtcSuffix(String(value));
        const date = new Date(source);
        return Number.isNaN(date.getTime()) ? null : date;
    };

    const getDisplayDateParts = (date) => {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return null;
        }
        const settings = activeDateSettings || normalizeSettings();
        if (settings.timezone?.mode === 'custom') {
            const offset = Number(settings.timezone?.offset) || 0;
            const adjusted = new Date(date.getTime() + offset * 60000);
            return {
                year: adjusted.getUTCFullYear(),
                month: adjusted.getUTCMonth() + 1,
                day: adjusted.getUTCDate(),
                hours: adjusted.getUTCHours(),
                minutes: adjusted.getUTCMinutes(),
            };
        }
        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
            hours: date.getHours(),
            minutes: date.getMinutes(),
        };
    };

    const padNumber = (value, length = 2) => String(Math.trunc(value)).padStart(length, '0');

    const formatWithPattern = (parts, pattern) => {
        if (!parts) {
            return '';
        }
        const tokens = {
            YYYY: padNumber(parts.year, 4),
            MM: padNumber(parts.month, 2),
            DD: padNumber(parts.day, 2),
            HH: padNumber(parts.hours, 2),
            mm: padNumber(parts.minutes, 2),
        };
        return pattern.replace(/YYYY|MM|DD|HH|mm/g, (token) => tokens[token] || token);
    };

    const getDatePattern = () => {
        const format = activeDateSettings?.datetime_format || DEFAULT_DATETIME_FORMAT;
        return format.split(' ')[0] || DEFAULT_DATETIME_FORMAT.split(' ')[0];
    };

    const getTimePattern = () => {
        const format = activeDateSettings?.datetime_format || DEFAULT_DATETIME_FORMAT;
        const segments = format.split(' ');
        return segments[1] || 'HH:mm';
    };

    const formatTimestamp = (value) => {
        const date = value instanceof Date ? value : parseISODate(value);
        if (!date) {
            return '';
        }
        const parts = getDisplayDateParts(date);
        return formatWithPattern(parts, activeDateSettings?.datetime_format || DEFAULT_DATETIME_FORMAT);
    };

    const formatDateOnly = (value) => {
        const date = value instanceof Date ? value : parseISODate(value);
        if (!date) {
            return '';
        }
        const parts = getDisplayDateParts(date);
        return formatWithPattern(parts, getDatePattern());
    };

    const formatTimeOfDay = (value) => {
        const date = value instanceof Date ? value : parseISODate(value);
        if (!date) {
            return '';
        }
        const parts = getDisplayDateParts(date);
        return formatWithPattern(parts, getTimePattern());
    };

    const formatTime = (value) => formatTimeOfDay(value);

    const formatRelativeDate = (value) => {
        const date = value instanceof Date ? value : parseISODate(value);
        if (!date) {
            return '';
        }
        const diff = Date.now() - date.getTime();
        if (diff < 60 * 1000) {
            return 'Just now';
        }
        if (diff < 60 * 60 * 1000) {
            const minutes = Math.max(1, Math.round(diff / (60 * 1000)));
            return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
        }
        if (diff < 24 * 60 * 60 * 1000) {
            return formatTimeOfDay(date);
        }
        return formatDateOnly(date);
    };

    const ensureArray = (value) => (Array.isArray(value) ? value : []);

    const getChatById = (chatId) => {
        if (!chatId) {
            return undefined;
        }
        return ensureArray(state.chats).find((chat) => String(chat.id) === String(chatId));
    };

    const canManageMessage = (message) => {
        if (!message) {
            return false;
        }
        const senderId = Number(message.sender?.id || message.sender_id);
        return senderId === Number(state.user.id);
    };

    const isPersistedMessage = (message) => {
        if (!message || message.id === undefined || message.id === null) {
            return false;
        }
        return /^\d+$/.test(String(message.id));
    };

    const decorateMessage = (message) => {
        if (!message) {
            return message;
        }
        const next = { ...message };
        const senderId = Number(next.sender?.id || next.sender_id);
        if (senderId === Number(state.user.id)) {
            next.status = next.status || 'delivered';
            next.statusLabel = next.statusLabel || 'Delivered';
        }
        return next;
    };

    const getMessagePreview = (message) => {
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
        if (ensureArray(message.attachments).length) {
            return '📷 Photo';
        }
        return 'New message';
    };

    const setAvatar = (target, payload) => {
        if (!target) {
            return;
        }
        const display = payload?.display || '';
        const avatar = payload?.avatar;
        target.innerHTML = '';
        target.classList.remove('is-initials');
        if (avatar) {
            const img = document.createElement('img');
            img.src = avatar;
            img.alt = display || 'Avatar';
            target.appendChild(img);
            return;
        }
        const initials = (display || 'U')
            .split(' ')
            .map((chunk) => chunk.trim()[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase();
        target.classList.add('is-initials');
        target.textContent = initials || 'U';
    };

    const showToast = (message, variant = 'info') => {
        if (!elements.toastHost || !message) {
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast toast--${variant}`;
        toast.setAttribute('role', 'status');

        const text = document.createElement('span');
        text.className = 'toast__message';
        text.textContent = message;
        toast.appendChild(text);

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'toast__close';
        dismiss.setAttribute('aria-label', 'Dismiss notification');

        const icon = document.createElement('span');
        icon.className = 'material-symbols-rounded';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'close';
        dismiss.appendChild(icon);

        toast.appendChild(dismiss);
        elements.toastHost.appendChild(toast);

        let isClosing = false;
        const removeToast = () => {
            if (isClosing) {
                return;
            }
            isClosing = true;
            toast.classList.remove('is-visible');
            setTimeout(() => toast.remove(), 260);
        };

        const timer = window.setTimeout(removeToast, 3800);

        dismiss.addEventListener('click', () => {
            window.clearTimeout(timer);
            removeToast();
        });

        requestAnimationFrame(() => {
            toast.classList.add('is-visible');
        });
    };

    const syncMobileDrawer = () => {
        const isMobile = window.matchMedia('(max-width: 960px)').matches;
        if (!isMobile) {
            document.body.classList.remove('mobile-primary-open');
            return;
        }
        if (state.ui.activeTab && state.ui.activeTab !== 'chats') {
            document.body.classList.add('mobile-primary-open');
            return;
        }
        if (state.ui.activeChatId) {
            document.body.classList.remove('mobile-primary-open');
        } else {
            document.body.classList.add('mobile-primary-open');
        }
    };

    const updatePresence = (text, status) => {
        if (elements.profilePresence) {
            elements.profilePresence.textContent = text;
        }
        if (elements.profilePresenceDot) {
            elements.profilePresenceDot.dataset.status = status || 'offline';
        }
    };

    const switchTab = (tabName) => {
        state.ui.activeTab = tabName;
        elements.tabTriggers.forEach((trigger) => {
            if (trigger.dataset.tabTrigger === tabName) {
                trigger.classList.add('is-active');
            } else {
                trigger.classList.remove('is-active');
            }
        });
        elements.tabPanels.forEach((panel) => {
            const isActive = panel.dataset.tabPanel === tabName;
            panel.hidden = !isActive;
            panel.classList.toggle('is-visible', isActive);
        });
        const isContactsView = tabName !== 'chats';
        root.classList.toggle('is-contacts', isContactsView);
        syncMobileDrawer();
    };

    const renderProfile = () => {
        syncActiveSettings();
        if (elements.profileName) {
            elements.profileName.textContent = state.user.display_name || 'Guest';
        }
        if (elements.profileUsername) {
            elements.profileUsername.textContent = state.user.username || '';
        }
        if (elements.profileEmail) {
            elements.profileEmail.value = state.user.email || '';
        }
        setAvatar(elements.profileAvatarSmall, {
            avatar: state.user.avatar_url || state.user.avatar,
            display: state.user.display_name,
        });
        setAvatar(elements.profileAvatarLarge, {
            avatar: state.user.avatar_url || state.user.avatar,
            display: state.user.display_name,
        });
    };

    const renderProfileForm = () => {
        const settings = syncActiveSettings();
        if (elements.profileDisplayName) {
            elements.profileDisplayName.value = state.user.display_name || '';
        }
        if (elements.profileBio) {
            elements.profileBio.value = state.user.bio || '';
            if (elements.profileBioCount) {
                elements.profileBioCount.textContent = String(elements.profileBio.value.length);
            }
        }
        if (elements.profileEmail) {
            elements.profileEmail.value = state.user.email || '';
        }
        if (elements.profileDatetimeFormat) {
            elements.profileDatetimeFormat.value = settings.datetime_format;
        }
        if (elements.profileTimezoneModes && elements.profileTimezoneModes.length) {
            elements.profileTimezoneModes.forEach((input) => {
                input.checked = input.value === settings.timezone.mode;
            });
        }
        if (elements.profileTimezoneOffset) {
            const hasOption = Array.from(elements.profileTimezoneOffset.options || []).some(
                (option) => Number(option.value) === Number(settings.timezone.offset)
            );
            if (!hasOption) {
                const option = document.createElement('option');
                option.value = String(settings.timezone.offset);
                option.textContent = formatOffsetLabel(settings.timezone.offset);
                elements.profileTimezoneOffset.appendChild(option);
            }
            elements.profileTimezoneOffset.value = String(settings.timezone.offset);
            elements.profileTimezoneOffset.disabled = settings.timezone.mode !== 'custom';
        }
    };

    const renderPendingBadges = () => {
        const friendPending = state.ui.pendingCount || 0;
        const groupPending = state.ui.pendingGroupInvites || 0;
        const pending = friendPending + groupPending;
        const toggle = (target) => {
            if (!target) {
                return;
            }
            if (pending > 0) {
                target.textContent = String(pending);
                target.hidden = false;
            } else {
                target.hidden = true;
            }
        };
        toggle(elements.pendingBadge);
        toggle(elements.pendingBadgeInline);
    };

    const renderChats = () => {
        const container = elements.chatList;
        if (!container) {
            return;
        }
        container.innerHTML = '';
        const chats = ensureArray(state.chats);
        if (chats.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <span class="material-symbols-rounded" aria-hidden="true">forum</span>
                <p>No chats yet. Start a conversation from Contacts.</p>
            `;
            container.appendChild(empty);
        } else {
            const list = document.createElement('ul');
            list.className = 'chat-roster__list';
            chats.forEach((chat) => {
                const item = document.createElement('li');
                item.className = 'chat-roster__item';
                item.dataset.chatId = chat.id;
                item.tabIndex = 0;
                const avatar = document.createElement('div');
                avatar.className = 'chat-roster__avatar';
                setAvatar(avatar, {
                    avatar: chat.is_group ? chat.avatar : chat.partner?.avatar,
                    display: chat.name || chat.partner?.display_name,
                });
                const body = document.createElement('div');
                body.className = 'chat-roster__body';
                const title = document.createElement('h4');
                title.className = 'chat-roster__title';
                title.textContent = chat.name || chat.partner?.display_name || 'Conversation';
                const preview = document.createElement('p');
                preview.className = 'chat-roster__preview';
                let previewText = chat.last_message?.body || '';
                if (!previewText && ensureArray(chat.last_message?.attachments).length) {
                    previewText = '📷 Photo';
                }
                preview.textContent = previewText || 'No messages yet';
                const meta = document.createElement('span');
                meta.className = 'chat-roster__meta';
                meta.textContent = formatRelativeDate(chat.last_message?.created_at || chat.updated_at);
                body.appendChild(title);
                body.appendChild(preview);
                body.appendChild(meta);
                if (String(chat.id) === String(state.ui.activeChatId)) {
                    item.classList.add('is-active');
                }
                const actions = document.createElement('div');
                actions.className = 'chat-roster__actions';
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'md-icon-button md-ripple chat-roster__delete';
                deleteButton.dataset.chatAction = 'delete';
                deleteButton.dataset.chatId = chat.id;
                const deleteLabelText = chat.is_group ? 'Leave group' : 'Delete conversation';
                deleteButton.setAttribute('aria-label', deleteLabelText);
                deleteButton.title = deleteLabelText;
                const deleteIcon = document.createElement('span');
                deleteIcon.className = 'material-symbols-rounded';
                deleteIcon.setAttribute('aria-hidden', 'true');
                deleteIcon.textContent = 'delete';
                const deleteLabel = document.createElement('span');
                deleteLabel.className = 'sr-only';
                deleteLabel.textContent = deleteLabelText;
                deleteButton.appendChild(deleteIcon);
                deleteButton.appendChild(deleteLabel);
                actions.appendChild(deleteButton);
                item.appendChild(avatar);
                item.appendChild(body);
                item.appendChild(actions);
                list.appendChild(item);
            });
            container.appendChild(list);
        }
        if (elements.chatsCount) {
            elements.chatsCount.textContent = String(chats.length);
            elements.chatsCount.hidden = chats.length === 0;
        }
    };

    const removeChatLocally = (chatId) => {
        if (chatId === null || chatId === undefined) {
            return false;
        }
        const idString = String(chatId);
        const chats = ensureArray(state.chats);
        const filtered = chats.filter((chat) => String(chat.id) !== idString);
        if (filtered.length === chats.length) {
            return false;
        }
        state.chats = filtered;
        const numericId = Number(chatId);
        if (!Number.isNaN(numericId)) {
            messageStore.delete(numericId);
        }
        const wasActive = String(state.ui.activeChatId) === idString;
        if (wasActive) {
            closeConversation();
        } else {
            renderChats();
        }
        return true;
    };

    const requestChatDeletion = (chatId, trigger) => {
        const chat = getChatById(chatId);
        if (!chat) {
            showToast('Conversation not found.', 'error');
            return;
        }
        const isGroup = Boolean(chat.is_group);
        const partnerName = chat.partner?.display_name || chat.partner?.username || 'this contact';
        const chatName = chat.name || partnerName || 'this conversation';
        const promptMessage = isGroup
            ? `Leave the group "${chatName}"?\n\nYou will need a new invite to rejoin.`
            : `Delete your conversation with ${chatName}?\n\nThis removes it from your recent conversations.`;
        const confirmed = window.confirm(promptMessage);
        if (!confirmed) {
            return;
        }
        if (trigger) {
            trigger.disabled = true;
        }
        emitSocket('chat:delete', { chat_id: chatId }, (response) => {
            if (trigger) {
                trigger.disabled = false;
            }
            if (!response?.ok) {
                showToast(response?.error || 'Unable to delete conversation.', 'error');
                return;
            }
            removeChatLocally(chatId);
            showToast(isGroup ? 'Left group conversation.' : 'Conversation deleted.', 'info');
        });
    };

    const renderContactList = (list, target, emptyText) => {
        if (!target) {
            return;
        }
        target.innerHTML = '';
        if (!list.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state small';
            empty.innerHTML = `<p>${emptyText}</p>`;
            target.appendChild(empty);
            return;
        }
        list.forEach((entry) => {
            const card = document.createElement('article');
            card.className = 'contact-card';
            const avatar = document.createElement('div');
            avatar.className = 'contact-card__avatar';
            setAvatar(avatar, { avatar: entry.user?.avatar, display: entry.user?.display_name });
            const body = document.createElement('div');
            body.className = 'contact-card__body';
            const title = document.createElement('h5');
            title.textContent = entry.user?.display_name || 'User';
            const subtitle = document.createElement('p');
            subtitle.textContent = entry.user?.username || '';
            body.appendChild(title);
            body.appendChild(subtitle);
            const actions = document.createElement('div');
            actions.className = 'contact-card__actions';
            if (entry.status === 'pending' && entry.user) {
                const accept = document.createElement('button');
                accept.type = 'button';
                accept.className = 'md-filled-button md-ripple';
                accept.dataset.contactAction = 'accept';
                accept.dataset.requestId = entry.id;
                accept.textContent = 'Accept';
                actions.appendChild(accept);
                const decline = document.createElement('button');
                decline.type = 'button';
                decline.className = 'md-text-button md-ripple';
                decline.dataset.contactAction = 'decline';
                decline.dataset.requestId = entry.id;
                decline.textContent = 'Decline';
                actions.appendChild(decline);
            } else if (entry.direction === 'outgoing') {
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'md-text-button md-ripple';
                cancel.dataset.contactAction = 'cancel';
                cancel.dataset.requestId = entry.id;
                cancel.textContent = 'Cancel request';
                actions.appendChild(cancel);
            } else if (entry.user) {
                const message = document.createElement('button');
                message.type = 'button';
                message.className = 'md-filled-button md-ripple';
                message.dataset.contactAction = 'chat';
                message.dataset.userId = entry.user.id;
                message.textContent = 'Message';
                actions.appendChild(message);
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'md-text-button md-ripple';
                remove.dataset.contactAction = 'remove';
                remove.dataset.userId = entry.user.id;
                remove.textContent = 'Remove';
                actions.appendChild(remove);
            }
            card.appendChild(avatar);
            card.appendChild(body);
            card.appendChild(actions);
            target.appendChild(card);
        });
    };

    const renderGroupInviteList = (list, target, type) => {
        if (!target) {
            return;
        }
        target.innerHTML = '';
        const invites = ensureArray(list);
        if (!invites.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state small';
            empty.innerHTML = `<p>${
                type === 'incoming' ? 'No group invites.' : 'No pending group invites.'
            }</p>`;
            target.appendChild(empty);
            return;
        }
        invites.forEach((entry) => {
            const card = document.createElement('article');
            card.className = 'contact-card';
            const body = document.createElement('div');
            body.className = 'contact-card__body';
            const title = document.createElement('h5');
            const groupName = entry.group_name || entry.chat_name || 'Group chat';
            title.textContent = groupName;
            const subtitle = document.createElement('p');
            const parts = [];
            if (type === 'incoming' && entry.inviter) {
                parts.push(`Invited by ${entry.inviter.display_name || entry.inviter.username || 'a friend'}`);
            }
            if (type === 'outgoing' && entry.invitee) {
                parts.push(`For ${entry.invitee.display_name || entry.invitee.username || 'a user'}`);
            }
            if (entry.created_at) {
                parts.push(`Sent ${formatRelativeDate(entry.created_at)}`);
            }
            subtitle.textContent = parts.join(' · ');
            body.appendChild(title);
            body.appendChild(subtitle);
            const actions = document.createElement('div');
            actions.className = 'contact-card__actions';
            if (type === 'incoming') {
                const accept = document.createElement('button');
                accept.type = 'button';
                accept.className = 'md-filled-button md-ripple';
                accept.dataset.groupInviteAction = 'accept';
                accept.dataset.groupInviteId = entry.id;
                accept.textContent = 'Join group';
                const decline = document.createElement('button');
                decline.type = 'button';
                decline.className = 'md-text-button md-ripple';
                decline.dataset.groupInviteAction = 'decline';
                decline.dataset.groupInviteId = entry.id;
                decline.textContent = 'Decline';
                actions.appendChild(accept);
                actions.appendChild(decline);
            } else {
                const note = document.createElement('span');
                note.className = 'contact-card__note';
                note.textContent = 'Pending approval';
                actions.appendChild(note);
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.className = 'md-text-button md-ripple';
                cancel.dataset.groupInviteAction = 'cancel';
                cancel.dataset.groupInviteId = entry.id;
                cancel.textContent = 'Cancel invite';
                actions.appendChild(cancel);
            }
            card.appendChild(body);
            card.appendChild(actions);
            target.appendChild(card);
        });
    };

    const renderGroupInvites = () => {
        const incoming = ensureArray(state.contacts?.group_invites?.incoming);
        const outgoing = ensureArray(state.contacts?.group_invites?.outgoing);
        renderGroupInviteList(incoming, elements.groupIncomingList, 'incoming');
        renderGroupInviteList(outgoing, elements.groupOutgoingList, 'outgoing');
    };

    const renderContacts = () => {
        const incoming = ensureArray(state.contacts?.incoming).map((item) => ({ ...item, direction: 'incoming' }));
        const outgoing = ensureArray(state.contacts?.outgoing).map((item) => ({ ...item, direction: 'outgoing' }));
        const friends = ensureArray(state.contacts?.friends).map((item) => ({ ...item, direction: 'friend' }));
        renderContactList(incoming, elements.incomingList, 'No pending requests.');
        renderContactList(outgoing, elements.outgoingList, "You haven't sent any requests.");
        renderContactList(friends, elements.friendsList, 'Add a friend to start chatting instantly.');
        renderGroupInvites();
        renderPendingBadges();
    };

    const renderSearchResults = (results) => {
        if (!elements.contactsResults) {
            return;
        }
        elements.contactsResults.innerHTML = '';
        const list = ensureArray(results);
        if (!list.length) {
            elements.contactsResults.hidden = false;
            elements.contactsResults.innerHTML = '<p class="empty-state small">No users found.</p>';
            return;
        }
        elements.contactsResults.hidden = false;
        list.forEach((user) => {
            const card = document.createElement('article');
            card.className = 'contact-result';
            const avatar = document.createElement('div');
            avatar.className = 'contact-result__avatar';
            setAvatar(avatar, { avatar: user.avatar, display: user.display_name });
            const body = document.createElement('div');
            body.className = 'contact-result__body';
            const title = document.createElement('h5');
            title.textContent = user.display_name || 'User';
            const subtitle = document.createElement('p');
            subtitle.textContent = user.username || '';
            body.appendChild(title);
            body.appendChild(subtitle);
            const action = document.createElement('button');
            action.type = 'button';
            action.className = 'md-filled-button md-ripple';
            action.dataset.contactAction = 'add';
            action.dataset.userId = user.id;
            action.textContent = 'Add friend';
            card.appendChild(avatar);
            card.appendChild(body);
            card.appendChild(action);
            elements.contactsResults.appendChild(card);
        });
    };

    const getMessagesForChat = (chatId) => {
        const existing = messageStore.get(chatId);
        if (existing) {
            return existing;
        }
        const messages = [];
        messageStore.set(chatId, messages);
        return messages;
    };

    const dayKey = (value) => {
        const date = value instanceof Date ? value : parseISODate(value);
        if (!date) {
            return '';
        }
        const parts = getDisplayDateParts(date);
        if (!parts) {
            return '';
        }
        return `${padNumber(parts.year, 4)}-${padNumber(parts.month, 2)}-${padNumber(parts.day, 2)}`;
    };

    const closeAllMessageMenus = () => {
        const menus = root.querySelectorAll('.message__menu');
        menus.forEach((menu) => {
            menu.classList.remove('is-open');
            const trigger = menu.previousElementSibling;
            if (trigger?.dataset.messageMenuTrigger === 'true') {
                trigger.setAttribute('aria-expanded', 'false');
            }
        });
    };

    const toggleMessageMenu = (trigger) => {
        if (!trigger) {
            return;
        }
        const menu = trigger.nextElementSibling;
        if (!(menu instanceof HTMLElement)) {
            return;
        }
        const willOpen = !menu.classList.contains('is-open');
        closeAllMessageMenus();
        if (willOpen) {
            menu.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        }
    };

    const buildMessageElement = (message) => {
        const isOutgoing = Number(message.sender?.id || message.sender_id) === Number(state.user.id);
        const isDeleted = Boolean(message.is_deleted);
        const isEditing = Boolean(state.ui.editingMessage) &&
            String(state.ui.editingMessage.id) === String(message.id);
        const persisted = isPersistedMessage(message);
        const canEdit = !isDeleted && persisted && canManageMessage(message);
        const canDelete = persisted && canManageMessage(message);
        const wrapper = document.createElement('article');
        wrapper.className = 'message';
        wrapper.dataset.messageId = message.id;
        wrapper.dataset.chatId = message.chat_id;
        if (isOutgoing) {
            wrapper.classList.add('message--outgoing');
        }
        if (isDeleted) {
            wrapper.classList.add('message--deleted');
        }
        if (message.status === 'error') {
            wrapper.classList.add('message--error');
        }
        const bubble = document.createElement('div');
        bubble.className = 'message__bubble';
        if (message.status === 'error') {
            bubble.classList.add('is-error');
        }

        if (isEditing) {
            const draft =
                state.ui.editingMessage?.draft !== undefined
                    ? state.ui.editingMessage.draft
                    : message.body || '';
            const textarea = document.createElement('textarea');
            textarea.className = 'message__edit-input';
            textarea.dataset.messageEditInput = 'true';
            textarea.value = draft;
            textarea.rows = Math.min(6, Math.max(3, draft.split('\n').length + 1));
            bubble.appendChild(textarea);
            setTimeout(() => {
                if (!textarea.isConnected) {
                    return;
                }
                textarea.focus();
                const length = textarea.value.length;
                try {
                    textarea.setSelectionRange(length, length);
                } catch (error) {
                    // ignore selection issues
                }
            }, 0);
        } else {
            const text = document.createElement('p');
            text.className = 'message__text';
            if (isDeleted) {
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
        }

        if (!isDeleted && ensureArray(message.attachments).length) {
            const attachments = document.createElement('div');
            attachments.className = 'message__attachments';
            message.attachments.forEach((attachment) => {
                const link = document.createElement('a');
                link.href = attachment.url || attachment.preview_url || attachment.download_url || '#';
                link.addEventListener('click', (event) => event.preventDefault());
                const img = document.createElement('img');
                img.src = attachment.url || attachment.preview_url || attachment.download_url || attachment.dataUrl;
                img.alt = attachment.filename || 'Attachment';
                img.className = 'message__attachment-image';
                link.appendChild(img);
                attachments.appendChild(link);
            });
            bubble.appendChild(attachments);
        }

        if (!isEditing) {
            const showMenu = canEdit || (canDelete && !isDeleted);
            if (showMenu) {
                bubble.classList.add('message__bubble--has-menu');
                const menuWrapper = document.createElement('div');
                menuWrapper.className = 'message__menu-wrapper';

                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'message__menu-trigger';
                trigger.dataset.messageMenuTrigger = 'true';
                trigger.setAttribute('aria-haspopup', 'true');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.setAttribute('aria-label', 'Message actions');
                const triggerIcon = document.createElement('span');
                triggerIcon.className = 'material-symbols-rounded';
                triggerIcon.textContent = 'more_vert';
                trigger.appendChild(triggerIcon);
                menuWrapper.appendChild(trigger);

                const menu = document.createElement('div');
                menu.className = 'message__menu';
                menu.dataset.messageMenu = 'true';
                menu.setAttribute('role', 'menu');

                if (canEdit) {
                    const editItem = document.createElement('button');
                    editItem.type = 'button';
                    editItem.className = 'message__menu-item';
                    editItem.dataset.messageAction = 'edit';
                    editItem.dataset.messageId = message.id;
                    editItem.dataset.chatId = message.chat_id;
                    editItem.setAttribute('role', 'menuitem');
                    const editIcon = document.createElement('span');
                    editIcon.className = 'material-symbols-rounded';
                    editIcon.textContent = 'edit';
                    const editLabel = document.createElement('span');
                    editLabel.textContent = 'Edit';
                    editItem.appendChild(editIcon);
                    editItem.appendChild(editLabel);
                    menu.appendChild(editItem);
                }

                if (canDelete && !isDeleted) {
                    const deleteItem = document.createElement('button');
                    deleteItem.type = 'button';
                    deleteItem.className = 'message__menu-item';
                    deleteItem.dataset.messageAction = 'delete';
                    deleteItem.dataset.messageId = message.id;
                    deleteItem.dataset.chatId = message.chat_id;
                    deleteItem.setAttribute('role', 'menuitem');
                    const deleteIcon = document.createElement('span');
                    deleteIcon.className = 'material-symbols-rounded';
                    deleteIcon.textContent = 'delete';
                    const deleteLabel = document.createElement('span');
                    deleteLabel.textContent = 'Delete';
                    deleteItem.appendChild(deleteIcon);
                    deleteItem.appendChild(deleteLabel);
                    menu.appendChild(deleteItem);
                }

                if (menu.childElementCount > 0) {
                    menuWrapper.appendChild(menu);
                    bubble.appendChild(menuWrapper);
                }
            }
        }

        const meta = document.createElement('div');
        meta.className = 'message__meta';
        const timestamp = document.createElement('time');
        timestamp.className = 'message__timestamp';
        timestamp.dateTime = message.created_at || '';
        timestamp.textContent = formatTimestamp(message.created_at);
        meta.appendChild(timestamp);
        if (isOutgoing) {
            const status = document.createElement('span');
            status.className = 'message__status';
            status.dataset.messageStatus = message.status || 'pending';
            status.textContent = message.statusLabel || 'Sending…';
            meta.appendChild(status);
        }

        wrapper.appendChild(bubble);
        wrapper.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'message__actions';
        if (isEditing) {
            const save = document.createElement('button');
            save.type = 'button';
            save.className = 'message__action';
            save.dataset.messageAction = 'save-edit';
            save.dataset.messageId = message.id;
            save.dataset.chatId = message.chat_id;
            save.textContent = 'Save';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'message__action message__action--tonal';
            cancel.dataset.messageAction = 'cancel-edit';
            cancel.dataset.messageId = message.id;
            cancel.dataset.chatId = message.chat_id;
            cancel.textContent = 'Cancel';
            actions.appendChild(save);
            actions.appendChild(cancel);
        }
        if (actions.childElementCount > 0) {
            wrapper.appendChild(actions);
        }

        return wrapper;
    };

    const refreshViewer = () => {
        if (!window.Viewer || !elements.messageFeed) {
            return;
        }
        if (viewer) {
            viewer.destroy();
            viewer = null;
        }
        if (!elements.messageFeed.querySelector('img')) {
            return;
        }
        viewer = new window.Viewer(elements.messageFeed, {
            toolbar: false,
            navbar: false,
            title: false,
            transition: false,
        });
    };

    // === Ultra Stable renderMessages(): Always scrolls to bottom ===
    const renderMessages = (chatId, messages) => {
        const messageFeed = getMessageFeed();
        if (!messageFeed) {
            console.warn('⚠️ No message feed found, cannot render messages');
            return;
        }

        const sorted = ensureArray(messages)
            .slice()
            .sort((a, b) => {
                const aDate = parseISODate(a?.created_at);
                const bDate = parseISODate(b?.created_at);
                return (aDate ? aDate.getTime() : 0) - (bDate ? bDate.getTime() : 0);
            });
        messageFeed.innerHTML = '';
        let lastDay = null;

        // --- Render each message ---
        sorted.forEach((message) => {
            const messageDay = dayKey(message.created_at);
            if (lastDay !== messageDay) {
                lastDay = messageDay;
                const divider = document.createElement('div');
                divider.className = 'message-divider';
                divider.textContent = formatDateOnly(message.created_at) || 'Unknown date';
                messageFeed.appendChild(divider);
            }
            const node = buildMessageElement(message);
            messageFeed.appendChild(node);
        });

        messageFeed.hidden = sorted.length === 0;
        if (elements.conversationPlaceholder) {
            elements.conversationPlaceholder.hidden = sorted.length > 0;
        }

        refreshViewer();

        const forceScroll = () => {
            requestAnimationFrame(() => {
                messageFeed.scrollTop = messageFeed.scrollHeight;
                messageFeed.scrollTo({ top: messageFeed.scrollHeight, behavior: 'smooth' });
            });
        };

        if (!messageFeed._observerBound) {
            const observer = new MutationObserver(() => {
                forceScroll();
            });
            observer.observe(messageFeed, { childList: true, subtree: true });
            messageFeed._observerBound = true;
            console.log('👁️ Bound MutationObserver for messageFeed');
        }

        setTimeout(forceScroll, 150);
        
        messageFeed.querySelectorAll('img').forEach((img) => {
            if (!img.dataset.scrollListener) {
                img.dataset.scrollListener = 'true';
                img.addEventListener('load', forceScroll, { once: true });
                img.addEventListener('error', forceScroll, { once: true });
            }
        });

        console.log('✅ renderMessages done, scroll synced');
    };


    const getEditingContext = () => state.ui.editingMessage;

    const beginEditMessage = (chatId, messageId) => {
        const messages = getMessagesForChat(chatId);
        const target = messages.find((item) => String(item.id) === String(messageId));
        if (!target || target.is_deleted || !isPersistedMessage(target)) {
            return;
        }
        state.ui.editingMessage = {
            id: target.id,
            chatId,
            draft: target.body || '',
        };
        if (String(chatId) === String(state.ui.activeChatId)) {
            renderMessages(chatId, messages);
        }
    };

    const cancelEditingMessage = () => {
        const context = getEditingContext();
        if (!context) {
            return;
        }
        const { chatId } = context;
        state.ui.editingMessage = null;
        if (chatId && String(chatId) === String(state.ui.activeChatId)) {
            renderMessages(chatId, getMessagesForChat(chatId));
        }
    };

    const updateEditingDraft = (messageId, value) => {
        if (!state.ui.editingMessage) {
            return;
        }
        if (String(state.ui.editingMessage.id) !== String(messageId)) {
            return;
        }
        state.ui.editingMessage.draft = value;
    };

    const applyMessageUpdate = (incoming) => {
        if (!incoming?.chat_id) {
            return;
        }
        const message = decorateMessage(incoming);
        const messages = getMessagesForChat(message.chat_id);
        const index = messages.findIndex((item) => String(item.id) === String(message.id));
        if (index >= 0) {
            messages[index] = { ...messages[index], ...message };
        } else {
            messages.push(message);
        }
        if (state.ui.editingMessage && String(state.ui.editingMessage.id) === String(message.id)) {
            state.ui.editingMessage = null;
        }
        if (String(message.chat_id) === String(state.ui.activeChatId)) {
            renderMessages(message.chat_id, messages);
        }
        const chatIndex = state.chats.findIndex((chat) => String(chat.id) === String(message.chat_id));
        if (chatIndex >= 0) {
            const chat = state.chats[chatIndex];
            if (chat.last_message && String(chat.last_message.id) === String(message.id)) {
                chat.last_message = { ...chat.last_message, ...message };
                renderChats();
            }
        }
    };

    const submitEditMessage = (chatId, messageId) => {
        if (!socket) {
            showToast('You are offline. Please wait for reconnection.', 'error');
            return;
        }
        const feed = getMessageFeed();
        const node = feed?.querySelector(`[data-message-id="${messageId}"]`);
        const textarea = node?.querySelector('[data-message-edit-input]');
        const nextBody = (textarea?.value || '').trim();
        const messages = getMessagesForChat(chatId);
        const message = messages.find((item) => String(item.id) === String(messageId));
        if (!message || !isPersistedMessage(message)) {
            return;
        }
        if (!nextBody) {
            showToast('Message cannot be empty.', 'error');
            return;
        }
        if ((message.body || '').trim() === nextBody) {
            cancelEditingMessage();
            return;
        }
    socket.timeout(6000).emit(
        'message:edit',
        { message_id: Number(messageId), chat_id: chatId, body: nextBody },
        (response) => {
            // Flask-SocketIO 有时不会回调 -> 加 fallback
            if (!response || typeof response.ok === 'undefined') {
                console.warn('⚠️ No ACK received, waiting for message:updated event fallback');
                return;
            }

            if (!response.ok) {
                showToast(response.error || 'Failed to edit message.', 'error');
                return;
            }

            applyMessageUpdate(response.message);
        }
    );

    };

    const requestDeleteMessage = (chatId, messageId) => {
        if (!socket) {
            showToast('You are offline. Please wait for reconnection.', 'error');
            return;
        }

        const messages = getMessagesForChat(chatId);
        const message = messages.find((item) => String(item.id) === String(messageId));
        if (!message || !isPersistedMessage(message)) {
            return;
        }

        if (!window.confirm('Delete this message? This cannot be undone.')) {
            return;
        }

        socket.timeout(6000).emit(
            'message:delete',
            { message_id: Number(messageId), chat_id: chatId },
            (response) => {
                if (!response || typeof response.ok === 'undefined') {
                    console.warn('⚠️ No ACK received for delete, waiting for message:deleted fallback');
                    return;
                }

                if (!response.ok) {
                    showToast(response.error || 'Failed to delete message.', 'error');
                    return;
                }

                applyMessageUpdate(response.message);
            }
        );
    };




    const appendMessage = (message) => {
        const normalized = decorateMessage(message);
        const messages = getMessagesForChat(normalized.chat_id);
        let existingIndex = messages.findIndex((item) => String(item.id) === String(normalized.id));
        if (existingIndex < 0 && normalized.client_ref) {
            existingIndex = messages.findIndex((item) => item.client_ref === normalized.client_ref);
        }
        if (existingIndex >= 0) {
            const current = messages[existingIndex];
            normalized.client_ref = normalized.client_ref || current.client_ref;
            messages[existingIndex] = { ...current, ...normalized };
        } else {
            messages.push(normalized);
        }
        if (String(normalized.chat_id) === String(state.ui.activeChatId)) {
            renderMessages(normalized.chat_id, messages);
        }
    };

    const setMessageStatus = (chatId, messageId, status, label) => {
        const messages = getMessagesForChat(chatId);
        const index = messages.findIndex((item) => item.id === messageId);
        if (index < 0) {
            return;
        }
        messages[index].status = status;
        messages[index].statusLabel = label;
        if (String(chatId) === String(state.ui.activeChatId)) {
            renderMessages(chatId, messages);
        }
    };


    const scrollToBottom = (smooth = false) => {
        const feed = document.querySelector('[data-message-feed]');
        const container = document.querySelector('[data-conversation-body]');
        if (!feed || !container) return;

        feed.hidden = false;

        requestAnimationFrame(() => {
            const scrollTarget = container.scrollHeight - container.clientHeight;
            try {
                container.scrollTo({
                    top: scrollTarget > 0 ? scrollTarget : container.scrollHeight,
                    behavior: smooth ? 'smooth' : 'auto',
                });
            } catch (err) {
                container.scrollTop = container.scrollHeight;
            }
            console.debug("✅ scrollToBottom applied to conversation-body");
        });
    };


    const markMessageDelivered = (tempId, payload) => {
        if (!payload) {
            return;
        }
        const normalized = decorateMessage(payload);
        normalized.client_ref = normalized.client_ref || tempId;
        normalized.status = 'delivered';
        normalized.statusLabel = 'Delivered';
        const messages = getMessagesForChat(normalized.chat_id);
        const optimisticIndex = messages.findIndex(
            (item) => item.id === tempId || (item.client_ref && item.client_ref === tempId)
        );
        if (optimisticIndex >= 0) {
            messages[optimisticIndex] = { ...messages[optimisticIndex], ...normalized };
        } else {
            const existingIndex = messages.findIndex((item) => String(item.id) === String(normalized.id));
            if (existingIndex >= 0) {
                messages[existingIndex] = { ...messages[existingIndex], ...normalized };
            } else {
                messages.push(normalized);
            }
        }
        if (String(normalized.chat_id) === String(state.ui.activeChatId)) {
            renderMessages(normalized.chat_id, messages);
        }
    };

    const renderAttachmentPreview = () => {
        const container = elements.attachmentPreview;
        if (!container) {
            return;
        }
        container.innerHTML = '';
        if (!pendingAttachments.length) {
            container.hidden = true;
            return;
        }
        const list = document.createElement('div');
        list.className = 'composer__attachment-list';
        pendingAttachments.forEach((attachment, index) => {
            const item = document.createElement('div');
            item.className = 'composer__attachment-item';
            const img = document.createElement('img');
            img.src = attachment.previewUrl;
            img.alt = attachment.name;
            item.appendChild(img);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'md-icon-button md-ripple';
            remove.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">close</span>';
            remove.title = 'Remove attachment';
            remove.dataset.removeAttachment = String(index);
            item.appendChild(remove);
            list.appendChild(item);
        });
        container.appendChild(list);
        container.hidden = false;
    };

    const clearComposer = () => {
        if (elements.composerInput) {
            elements.composerInput.value = '';
            elements.composerInput.style.height = '';
        }
        pendingAttachments.splice(0, pendingAttachments.length);
        renderAttachmentPreview();
    };

    const openChat = (chatId) => {
        if (!chatId) {
            return;
        }
        if (String(state.ui.activeChatId) === String(chatId)) {
            return;
        }
        state.ui.activeChatId = chatId;
        state.ui.editingMessage = null;
        renderChats();
        clearComposer();
        syncMobileDrawer();
        const chat = state.chats.find((item) => String(item.id) === String(chatId));
        if (elements.conversationHeader) {
            elements.conversationHeader.hidden = false;
        }
        if (elements.conversationTitle) {
            elements.conversationTitle.textContent = chat?.name || chat?.partner?.display_name || 'Conversation';
        }
        if (elements.conversationSubtitle) {
            const parts = [];
            if (chat?.is_group) {
                const memberCount = ensureArray(chat?.members).length;
                parts.push(`${memberCount} participant${memberCount === 1 ? '' : 's'}`);
            } else if (chat?.partner?.username) {
                parts.push(chat.partner.username);
            }
            if (chat?.last_message?.created_at) {
                parts.push(`Updated ${formatRelativeDate(chat.last_message.created_at)}`);
            }
            elements.conversationSubtitle.textContent = parts.join(' · ');
        }
        setAvatar(elements.conversationAvatar, {
            avatar: chat?.is_group ? chat?.avatar : chat?.partner?.avatar,
            display: chat?.name || chat?.partner?.display_name,
        });
        if (elements.groupInviteButton) {
            const isGroupAdmin = ensureArray(chat?.members).some(
                (member) =>
                    Boolean(chat?.is_group) &&
                    Number(member?.user?.id || member?.user_id) === Number(state.user.id) &&
                    Boolean(member?.is_admin)
            );
            elements.groupInviteButton.hidden = !isGroupAdmin;
        }
        const existingMessages = messageStore.get(chatId);
        if (existingMessages) {
            renderMessages(chatId, existingMessages);
        } else {
            if (elements.messageFeed) {
                elements.messageFeed.innerHTML = '';
                elements.messageFeed.hidden = true;
            }
            if (elements.conversationPlaceholder) {
                elements.conversationPlaceholder.hidden = false;
            }
        }
        if (!socket) {
            return;
        }
        console.log('socket emit: chat:open', { chat_id: chatId });
        socket.timeout(6000).emit('chat:open', { chat_id: chatId }, (response) => {
            if (!response?.ok && response?.error) {
                showToast(response.error, 'error');
            }
        scrollToBottom();
        setTimeout(scrollToBottom, 200);
        });
    };

    const notifyNewMessage = (message) => {
        if (!message || Number(message.sender?.id) === Number(state.user.id)) {
            return;
        }
        try {
            if (typeof window.NovaTalk?.playNotificationTone === 'function') {
                window.NovaTalk.playNotificationTone();
            }
        } catch (error) {
            // ignore playback issues silently
        }
        if (!('Notification' in window)) {
            return;
        }
        if (Notification.permission === 'default') {
            try {
                window.NovaTalk?.requestNotificationPermission?.();
            } catch (error) {
                // ignore permission failures
            }
        }
        if (Notification.permission !== 'granted') {
            return;
        }
        const title = message.sender?.display_name || 'New message';
        const body = getMessagePreview(message);
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
                    openChat(message.chat_id);
                }
                try {
                    notification.close();
                } catch (error) {
                    // ignore close errors
                }
            });
        } catch (error) {
            // Notifications may fail silently in some environments
        }
    };

    const closeConversation = () => {
        state.ui.activeChatId = null;
        state.ui.editingMessage = null;
        renderChats();
        if (elements.conversationHeader) {
            elements.conversationHeader.hidden = true;
        }
        const messageFeed = getMessageFeed();
        if (messageFeed) {
            messageFeed.innerHTML = '';
            messageFeed.hidden = true;
        }
        if (elements.conversationPlaceholder) {
            elements.conversationPlaceholder.hidden = false;
        }
        if (elements.groupInviteButton) {
            elements.groupInviteButton.hidden = true;
        }
        clearComposer();
        syncMobileDrawer();
    };

    const handleSendMessage = () => {
        if (!socket) {
            showToast('You are offline. Please wait for reconnection.', 'error');
            return;
        }
        const chatId = state.ui.activeChatId;
        if (!chatId) {
            showToast('Select a conversation first.', 'error');
            return;
        }
        const text = (elements.composerInput?.value || '').trim();
        if (!text && pendingAttachments.length === 0) {
            showToast('Message cannot be empty.', 'error');
            return;
        }
        const now = new Date().toISOString();
        const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const optimisticAttachments = pendingAttachments.map((item) => ({
            preview_url: item.previewUrl,
            filename: item.name,
        }));
        const optimisticMessage = {
            id: tempId,
            chat_id: chatId,
            body: text,
            created_at: now,
            sender: { id: state.user.id, display_name: state.user.display_name },
            attachments: optimisticAttachments,
            edited: false,
            is_deleted: false,
            status: 'pending',
            statusLabel: 'Sending…',
            client_ref: tempId,
        };
        const messages = getMessagesForChat(chatId);
        messages.push(optimisticMessage);
        renderMessages(chatId, messages);
        scrollToBottom(true);
        const payload = {
            chat_id: chatId,
            body: text,
            attachments: pendingAttachments.map((item) => ({
                name: item.name,
                mimetype: item.mimetype,
                data: item.dataUrl,
            })),
            client_ref: tempId,
        };
        elements.sendButton?.setAttribute('data-loading', 'true');
        emitSocket('send_message', payload, (response) => {
            elements.sendButton?.removeAttribute('data-loading');
            if (!response?.ok) {
                setMessageStatus(chatId, tempId, 'error', 'Failed');
                showToast(response?.error || 'Failed to send message.', 'error');
                return;
            }
            if (response.message) {
                markMessageDelivered(tempId, response.message);
            } else {
                setMessageStatus(chatId, tempId, 'delivered', 'Delivered');
            }
            clearComposer();
        });
    };

    const handleAttachmentSelection = async (files) => {
        const queue = Array.from(files || []);
        if (!queue.length) {
            return;
        }
        for (const file of queue) {
            if (!file.type.startsWith('image/')) {
                showToast('Only image attachments are supported right now.', 'error');
                continue;
            }
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('Unable to read file.'));
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            pendingAttachments.push({
                name: file.name,
                mimetype: file.type,
                dataUrl,
                previewUrl: dataUrl,
            });
        }
        renderAttachmentPreview();
    };

    const emitSocket = (eventName, payload, callback) => {
        if (!socket) {
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'Socket offline.' });
            }
            return;
        }
        try {
            socket.timeout(8000).emit(eventName, payload, (error, response) => {
                if (typeof callback === 'function') {
                    if (error) {
                        callback({ ok: false, error: error.message || 'Request timed out.' });
                    } else {
                        callback(response);
                    }
                }
            });
        } catch (error) {
            console.error(`Socket emit failed for ${eventName}`, error);
            if (typeof callback === 'function') {
                callback({ ok: false, error: 'Socket error.' });
            }
        }
    };

    const applyState = (incomingState) => {
        if (!incomingState) {
            return;
        }
        if (incomingState.user) {
            assignUser(incomingState.user);
        }
        if (Array.isArray(incomingState.chats)) {
            state.chats = incomingState.chats;
        }
        if (incomingState.contacts) {
            state.contacts = incomingState.contacts;
            if (!state.contacts.group_invites) {
                state.contacts.group_invites = { incoming: [], outgoing: [] };
            }
        }
        if (incomingState.ui?.pendingCount !== undefined) {
            state.ui.pendingCount = incomingState.ui.pendingCount;
        }
        if (incomingState.ui?.pendingGroupInvites !== undefined) {
            state.ui.pendingGroupInvites = incomingState.ui.pendingGroupInvites;
        }
        state.ui.editingMessage = null;
        renderProfile();
        renderProfileForm();
        renderChats();
        renderContacts();
        syncMobileDrawer();
    };

    const handleChatHistory = (payload) => {
        console.log('socket event: chat:history', payload);
        if (!payload) {
            return;
        }
        if (!payload.ok) {
            if (payload.error) {
                showToast(payload.error, 'error');
            }
            return;
        }
        if (!payload.chat_id) {
            return;
        }
        const decorated = ensureArray(payload.messages).map((message) => decorateMessage(message));
        messageStore.set(payload.chat_id, decorated);
        if (payload.chat) {
            const index = state.chats.findIndex((chat) => chat.id === payload.chat.id);
            if (index >= 0) {
                state.chats[index] = payload.chat;
            } else {
                state.chats.unshift(payload.chat);
            }
            renderChats();
        }
        if (String(payload.chat_id) === String(state.ui.activeChatId)) {
            state.ui.editingMessage = null;
            renderMessages(payload.chat_id, decorated);
        }
    };

    const handleIncomingMessage = (payload) => {
        console.log('socket event: new_message', payload);
        if (!payload?.chat_id) {
            return;
        }
        const incoming = decorateMessage(payload);
        if (Number(incoming.sender?.id || incoming.sender_id) !== Number(state.user.id)) {
            incoming.status = 'received';
        }
        appendMessage(incoming);
        if (String(incoming.chat_id) === String(state.ui.activeChatId)) {
            scrollToBottom(true);
        }
        const chatIndex = state.chats.findIndex((chat) => String(chat.id) === String(incoming.chat_id));
        if (chatIndex >= 0) {
            const chat = state.chats[chatIndex];
            chat.last_message = incoming;
            chat.updated_at = incoming.created_at;
            state.chats.splice(chatIndex, 1);
            state.chats.unshift(chat);
        }
        renderChats();
        notifyNewMessage(incoming);
    };

    const handleMessageUpdated = (payload) => {
        console.log('socket event: message:updated', payload);
        applyMessageUpdate(payload);
    };

    const handleMessageDeleted = (payload) => {
        console.log('socket event: message:deleted', payload);
        applyMessageUpdate(payload);
    };

    const handleContactsUpdate = (payload) => {
        console.log('socket event: contacts:update', payload);
        if (!payload) {
            return;
        }
        if (payload.contacts) {
            state.contacts = payload.contacts;
            if (!state.contacts.group_invites) {
                state.contacts.group_invites = { incoming: [], outgoing: [] };
            }
        }
        if (payload.pendingCount !== undefined) {
            state.ui.pendingCount = payload.pendingCount;
        }
        if (payload.pendingGroupInvites !== undefined) {
            state.ui.pendingGroupInvites = payload.pendingGroupInvites;
        }
        renderContacts();
    };

    const handleChatMemberUpdate = (payload) => {
        console.log('socket event: chat:member_update', payload);
        if (!payload?.chat_id) {
            return;
        }
        const chatIndex = state.chats.findIndex((chat) => chat.id === payload.chat_id);
        if (chatIndex < 0) {
            return;
        }
        if (Array.isArray(payload.members)) {
            state.chats[chatIndex].members = payload.members;
        }
        if (payload.chat) {
            state.chats[chatIndex] = { ...state.chats[chatIndex], ...payload.chat };
        }
        renderChats();
        if (String(state.ui.activeChatId) === String(payload.chat_id)) {
            const activeChat = state.chats[chatIndex];
            if (elements.conversationSubtitle) {
                const memberCount = ensureArray(activeChat?.members).length;
                const parts = [`${memberCount} participant${memberCount === 1 ? '' : 's'}`];
                if (activeChat?.last_message?.created_at) {
                    parts.push(`Updated ${formatRelativeDate(activeChat.last_message.created_at)}`);
                }
                elements.conversationSubtitle.textContent = parts.join(' · ');
            }
            if (elements.groupInviteButton) {
                const isGroupAdmin = ensureArray(activeChat?.members).some(
                    (member) =>
                        Boolean(activeChat?.is_group) &&
                        Number(member?.user?.id || member?.user_id) === Number(state.user.id) &&
                        Boolean(member?.is_admin)
                );
                elements.groupInviteButton.hidden = !isGroupAdmin;
            }
        }
    };

    const handleChatDeleted = (payload) => {
        console.log('socket event: chat:deleted', payload);
        if (!payload?.chat_id) {
            return;
        }
        const chatId = Number(payload.chat_id);
        if (Number.isNaN(chatId)) {
            return;
        }
        removeChatLocally(chatId);
    };

    const handleFriendUpdate = (payload) => {
        console.log('socket event: friend:update', payload);
        if (payload?.pending_count !== undefined) {
            state.ui.pendingCount = payload.pending_count;
            renderPendingBadges();
        }
        if (payload?.action === 'request_received') {
            showToast(`${payload.from_user?.display_name || 'A user'} sent you a friend request.`, 'info');
        } else if (payload?.action === 'request_accepted') {
            showToast(`${payload.from_user?.display_name || 'A user'} accepted your request.`, 'success');
        } else if (payload?.action === 'request_declined') {
            showToast(`${payload.from_user?.display_name || 'A user'} declined your request.`, 'error');
        } else if (payload?.action === 'friend_removed') {
            showToast(`${payload.from_user?.display_name || 'A user'} removed you as a friend.`, 'error');
        } else if (payload?.message) {
            showToast(payload.message);
        }
    };

    const handleProfileUpdate = (payload) => {
        console.log('socket event: profile:update', payload);
        if (payload?.user) {
            assignUser(payload.user);
            renderProfile();
            renderProfileForm();
            if (payload.user.avatar) {
                try {
                    window.NovaTalk.updateAvatarNodes?.(payload.user.avatar);
                } catch (error) {
                    // ignore avatar sync issues
                }
            }
        }
    };

    const setupSocket = () => {
        if (socket) {
            return;
        }
        if (typeof window.io !== 'function') {
            console.error('Socket.IO client unavailable.');
            showToast('Realtime client missing. Please refresh.', 'error');
            return;
        }
        socket = window.io({
            transports: ['websocket', 'polling'],
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
        });

        socket.on('connect', () => {
            console.log('socket event: connect');
            console.log('✅ Connected to server');
            updatePresence('Online', 'online');
            showToast('Connected to NovaTalk.', 'success');
            socket.emit('initialize', {}, (response) => {
                if (response?.ok && response.state) {
                    applyState(response.state);
                    if (response.state.ui?.activeChatId) {
                        openChat(response.state.ui.activeChatId);
                    }
                }
            });
        });

        socket.on('disconnect', (reason) => {
            console.log('socket event: disconnect', reason);
            updatePresence('Offline', 'offline');
            showToast('Connection lost. Attempting to reconnect…', 'error');
        });

        socket.io.on('reconnect_attempt', () => {
            console.log('socket manager: reconnect_attempt');
            updatePresence('Reconnecting…', 'away');
        });

        socket.on('reconnect', () => {
            console.log('socket event: reconnect');
            updatePresence('Online', 'online');
            showToast('Reconnected to NovaTalk.', 'success');
            socket.emit('initialize', {}, (response) => {
                if (response?.ok && response.state) {
                    applyState(response.state);
                    if (state.ui.activeChatId) {
                        openChat(state.ui.activeChatId);
                    }
                }
            });
        });

        socket.on('connect_error', (error) => {
            console.error('socket event: connect_error', error);
            updatePresence('Connection error', 'offline');
        });

        socket.off('chat:history');
        socket.off('new_message');
        socket.off('contacts:update');
        socket.off('friend:update');
        socket.off('profile:update');
        socket.off('chat:typing');
        socket.off('chat:member_update');
        socket.off('message:updated');
        socket.off('message:deleted');
        socket.off('chat:deleted');

        socket.on('chat:history', handleChatHistory);
        socket.on('new_message', handleIncomingMessage);
        socket.on('contacts:update', handleContactsUpdate);
        socket.on('friend:update', handleFriendUpdate);
        socket.on('profile:update', handleProfileUpdate);
        socket.on('chat:member_update', handleChatMemberUpdate);
        socket.on('message:updated', handleMessageUpdated);
        socket.on('message:deleted', handleMessageDeleted);
        socket.on('chat:deleted', handleChatDeleted);
        socket.on('chat:typing', (payload) => {
            console.log('socket event: chat:typing', payload);
        });
    };

    const bindEvents = () => {
        elements.tabTriggers.forEach((trigger) => {
            trigger.addEventListener('click', () => {
                const tab = trigger.dataset.tabTrigger;
                switchTab(tab);
            });
        });
        if (elements.chatList) {
            elements.chatList.addEventListener('click', (event) => {
                const actionButton = event.target.closest('[data-chat-action]');
                if (actionButton) {
                    event.preventDefault();
                    event.stopPropagation();
                    const action = actionButton.dataset.chatAction;
                    const targetId = Number(
                        actionButton.dataset.chatId || actionButton.closest('[data-chat-id]')?.dataset.chatId
                    );
                    if (!Number.isNaN(targetId) && action === 'delete') {
                        requestChatDeletion(targetId, actionButton);
                    }
                    return;
                }
                const item = event.target.closest('[data-chat-id]');
                if (!item) {
                    return;
                }
                const chatId = Number(item.dataset.chatId);
                if (Number.isNaN(chatId)) {
                    return;
                }
                switchTab('chats');
                openChat(chatId);
            });
        }
        if (elements.chatList) {
            elements.chatList.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    if (event.target.closest('[data-chat-action]')) {
                        return;
                    }
                    const item = event.target.closest('[data-chat-id]');
                    if (!item) {
                        return;
                    }
                    event.preventDefault();
                    openChat(Number(item.dataset.chatId));
                }
            });
        }
        if (elements.closeConversation) {
            elements.closeConversation.addEventListener('click', () => {
                closeConversation();
            });
        }
        if (elements.newChatButton) {
            elements.newChatButton.addEventListener('click', () => {
                switchTab('contacts');
                elements.contactsSearchInput?.focus();
            });
        }
        if (elements.logoutButton) {
            elements.logoutButton.addEventListener('click', () => {
                const url = elements.logoutButton.getAttribute('data-logout-url');
                if (url) {
                    window.location.href = url;
                }
            });
        }
        if (elements.contactsSearchForm) {
            elements.contactsSearchForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const query = (elements.contactsSearchInput?.value || '').trim();
                if (!query) {
                    showToast('Enter a name or username to search.', 'error');
                    return;
                }
                elements.contactsSearchForm.classList.add('is-loading');
                emitSocket('contacts:search', { query }, (response) => {
                    elements.contactsSearchForm.classList.remove('is-loading');
                    if (!response?.ok) {
                        showToast(response?.error || 'Search failed.', 'error');
                        return;
                    }
                    renderSearchResults(response.results || []);
                });
            });
        }
        root.addEventListener('click', (event) => {
            const menuTrigger = event.target.closest('[data-message-menu-trigger]');
            if (menuTrigger) {
                event.preventDefault();
                toggleMessageMenu(menuTrigger);
                return;
            }

            if (!event.target.closest('.message__menu-wrapper')) {
                closeAllMessageMenus();
            }

            const messageButton = event.target.closest('[data-message-action]');
            if (messageButton) {
                event.preventDefault();
                closeAllMessageMenus();
                const action = messageButton.dataset.messageAction;
                const messageId = messageButton.dataset.messageId;
                const chatId = Number(messageButton.dataset.chatId);
                switch (action) {
                    case 'edit':
                        beginEditMessage(chatId, messageId);
                        break;
                    case 'save-edit':
                        submitEditMessage(chatId, messageId);
                        break;
                    case 'cancel-edit':
                        cancelEditingMessage();
                        break;
                    case 'delete':
                        requestDeleteMessage(chatId, messageId);
                        break;
                    default:
                        break;
                }
                return;
            }
            const button = event.target.closest('[data-contact-action]');
            if (!button) {
                return;
            }
            const action = button.dataset.contactAction;
            const requestId = Number(button.dataset.requestId);
            const userId = Number(button.dataset.userId);
            button.disabled = true;
            const done = () => {
                button.disabled = false;
            };
            switch (action) {
                case 'accept':
                    emitSocket('friend:respond', { request_id: requestId, action: 'accept' }, (response) => {
                        done();
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to accept request.', 'error');
                        }
                    });
                    break;
                case 'decline':
                    emitSocket('friend:respond', { request_id: requestId, action: 'decline' }, (response) => {
                        done();
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to decline request.', 'error');
                        }
                    });
                    break;
                case 'cancel':
                    emitSocket('friend:cancel', { request_id: requestId }, (response) => {
                        done();
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to cancel request.', 'error');
                        }
                    });
                    break;
                case 'remove': {
                    if (!userId) {
                        done();
                        return;
                    }
                    const friends = ensureArray(state.contacts?.friends);
                    const friendEntry = friends.find(
                        (entry) => Number(entry?.user?.id) === Number(userId)
                    );
                    const friendName =
                        friendEntry?.user?.display_name || friendEntry?.user?.username || 'this friend';
                    const confirmed = window.confirm(`Remove ${friendName} from your friends?`);
                    if (!confirmed) {
                        done();
                        return;
                    }
                    emitSocket('friend:remove', { friend_id: userId }, (response) => {
                        done();
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to remove friend.', 'error');
                            return;
                        }
                        state.contacts.friends = friends.filter(
                            (entry) => Number(entry?.user?.id) !== Number(userId)
                        );
                        renderContacts();
                        showToast(`${friendName} removed from friends.`, 'info');
                    });
                    break;
                }
                case 'chat':
                    emitSocket('chat:create', { type: 'direct', user_id: userId }, (response) => {
                        done();
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to start chat.', 'error');
                            return;
                        }
                        if (response.chat) {
                            const existingIndex = state.chats.findIndex((chat) => chat.id === response.chat.id);
                            if (existingIndex >= 0) {
                                state.chats.splice(existingIndex, 1);
                            }
                            state.chats.unshift(response.chat);
                            renderChats();
                            switchTab('chats');
                            openChat(response.chat.id);
                        }
                    });
                    break;
                case 'add':
                    emitSocket('friend:send_request', { user_id: userId }, (response) => {
                        done();
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to send request.', 'error');
                        } else {
                            showToast('Friend request sent.', 'success');
                        }
                    });
                    break;
                default:
                    done();
                    break;
            }
        });
        root.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeAllMessageMenus();
            }
        });
        document.addEventListener('click', (event) => {
            if (!root.contains(event.target)) {
                closeAllMessageMenus();
            }
        });
        root.addEventListener('input', (event) => {
            const target = event.target;
            if (!target.matches('[data-message-edit-input]')) {
                return;
            }
            const wrapper = target.closest('[data-message-id]');
            if (!wrapper) {
                return;
            }
            updateEditingDraft(wrapper.dataset.messageId, target.value);
        });
        root.addEventListener('click', (event) => {
            const button = event.target.closest('[data-group-invite-action]');
            if (!button) {
                return;
            }
            const action = button.dataset.groupInviteAction;
            const inviteId = Number(button.dataset.groupInviteId);
            if (!inviteId || Number.isNaN(inviteId) || !action) {
                return;
            }
            button.disabled = true;
            if (action === 'cancel') {
                emitSocket('group:cancel', { invite_id: inviteId }, (response) => {
                    button.disabled = false;
                    if (!response?.ok) {
                        showToast(response?.error || 'Unable to cancel invite.', 'error');
                        return;
                    }
                    state.contacts.group_invites.outgoing = ensureArray(
                        state.contacts.group_invites.outgoing
                    ).filter((invite) => invite.id !== inviteId);
                    renderContacts();
                    showToast('Group invite cancelled.', 'info');
                });
                return;
            }
            emitSocket('group:respond', { invite_id: inviteId, action }, (response) => {
                button.disabled = false;
                if (!response?.ok) {
                    showToast(response?.error || 'Unable to process invite.', 'error');
                    return;
                }
                state.contacts.group_invites.incoming = ensureArray(state.contacts.group_invites.incoming).filter(
                    (invite) => invite.id !== inviteId
                );
                if (state.ui.pendingGroupInvites > 0) {
                    state.ui.pendingGroupInvites -= 1;
                }
                renderContacts();
                if (response.status === 'accepted' && response.chat) {
                    const existingIndex = state.chats.findIndex((chat) => chat.id === response.chat.id);
                    if (existingIndex >= 0) {
                        state.chats.splice(existingIndex, 1);
                    }
                    state.chats.unshift(response.chat);
                    renderChats();
                    switchTab('chats');
                    openChat(response.chat.id);
                    showToast('Joined group chat.', 'success');
                } else if (response.status === 'declined') {
                    showToast('Declined group invite.', 'info');
                }
            });
        });
        if (elements.composerForm) {
            elements.composerForm.addEventListener('submit', (event) => {
                event.preventDefault();
                handleSendMessage();
                scrollToBottom(true);
                setTimeout(scrollToBottom, 200);

            });
        }
        if (elements.composerInput) {
            elements.composerInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                    scrollToBottom(true);
                    setTimeout(scrollToBottom, 200);
                }
            });
            elements.composerInput.addEventListener('input', () => {
                elements.composerInput.style.height = 'auto';
                elements.composerInput.style.height = `${elements.composerInput.scrollHeight}px`;
            });
        }
        if (elements.attachmentTrigger && elements.attachmentInput) {
            elements.attachmentTrigger.addEventListener('click', () => {
                elements.attachmentInput.click();
            });
            elements.attachmentInput.addEventListener('change', async (event) => {
                const files = event.target.files;
                try {
                    await handleAttachmentSelection(files);
                } catch (error) {
                    console.error('Attachment processing failed.', error);
                    showToast('Unable to process attachment.', 'error');
                }
                elements.attachmentInput.value = '';
            });
        }
        if (elements.attachmentPreview) {
            elements.attachmentPreview.addEventListener('click', (event) => {
                const button = event.target.closest('[data-remove-attachment]');
                if (!button) {
                    return;
                }
                const index = Number(button.dataset.removeAttachment);
                if (!Number.isNaN(index)) {
                    pendingAttachments.splice(index, 1);
                    renderAttachmentPreview();
                }
            });
        }
        if (elements.groupCreateForm) {
            elements.groupCreateForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const name = (elements.groupCreateName?.value || '').trim();
                if (!name) {
                    showToast('Group name is required.', 'error');
                    return;
                }
                const inviteRaw = elements.groupCreateInvitees?.value || '';
                const invitees = inviteRaw
                    .split(',')
                    .map((item) => item.trim().replace(/^@/, ''))
                    .filter(Boolean);
                elements.groupCreateForm.classList.add('is-loading');
                emitSocket(
                    'chat:create',
                    { type: 'group', name, invitees },
                    (response) => {
                        elements.groupCreateForm.classList.remove('is-loading');
                        if (!response?.ok) {
                            showToast(response?.error || 'Unable to create group.', 'error');
                            return;
                        }
                        if (elements.groupCreateName) {
                            elements.groupCreateName.value = '';
                        }
                        if (elements.groupCreateInvitees) {
                            elements.groupCreateInvitees.value = '';
                        }
                        if (response.chat) {
                            const existingIndex = state.chats.findIndex((chat) => chat.id === response.chat.id);
                            if (existingIndex >= 0) {
                                state.chats.splice(existingIndex, 1);
                            }
                            state.chats.unshift(response.chat);
                            renderChats();
                            switchTab('chats');
                            openChat(response.chat.id);
                        }
                        if (Array.isArray(response.invites)) {
                            const existingOutgoing = ensureArray(state.contacts.group_invites.outgoing);
                            const existingIds = new Set(existingOutgoing.map((invite) => invite.id));
                            const fresh = response.invites.filter((invite) => !existingIds.has(invite.id));
                            state.contacts.group_invites.outgoing = [...fresh, ...existingOutgoing];
                            renderContacts();
                        } else {
                            renderContacts();
                        }
                        showToast('Group created.', 'success');
                    }
                );
            });
        }
        if (elements.groupInviteButton) {
            elements.groupInviteButton.addEventListener('click', () => {
                if (!state.ui.activeChatId) {
                    showToast('Open a group chat first.', 'error');
                    return;
                }
                const activeChat = state.chats.find((chat) => chat.id === state.ui.activeChatId);
                if (!activeChat?.is_group) {
                    showToast('Invitations are only available in group chats.', 'error');
                    return;
                }
                const input = window.prompt('Enter usernames to invite (comma separated)');
                if (input === null) {
                    return;
                }
                const invitees = input
                    .split(',')
                    .map((item) => item.trim().replace(/^@/, ''))
                    .filter(Boolean);
                if (!invitees.length) {
                    showToast('No usernames provided.', 'error');
                    return;
                }
                elements.groupInviteButton.setAttribute('data-loading', 'true');
                emitSocket('group:invite', { chat_id: activeChat.id, invitees }, (response) => {
                    elements.groupInviteButton.removeAttribute('data-loading');
                    if (!response?.ok) {
                        showToast(response?.error || 'Unable to send invites.', 'error');
                        return;
                    }
                    if (Array.isArray(response.invites)) {
                        const existingOutgoing = ensureArray(state.contacts.group_invites.outgoing);
                        const existingIds = new Set(existingOutgoing.map((invite) => invite.id));
                        const fresh = response.invites.filter((invite) => !existingIds.has(invite.id));
                        state.contacts.group_invites.outgoing = [...fresh, ...existingOutgoing];
                        renderContacts();
                    }
                    showToast('Invitations sent.', 'success');
                });
            });
        }
        if (elements.profileForm) {
            elements.profileForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const payload = {
                    display_name: elements.profileDisplayName?.value || '',
                    bio: elements.profileBio?.value || '',
                    datetime_format:
                        elements.profileDatetimeFormat?.value &&
                        SUPPORTED_DATETIME_FORMATS.includes(elements.profileDatetimeFormat.value)
                            ? elements.profileDatetimeFormat.value
                            : DEFAULT_DATETIME_FORMAT,
                    timezone_mode:
                        elements.profileTimezoneModes?.find((input) => input.checked)?.value || 'system',
                    timezone_offset: Number(elements.profileTimezoneOffset?.value || 0),
                };
                emitSocket('me:update', payload, (response) => {
                    if (!response?.ok) {
                        showToast(response?.error || 'Failed to update profile.', 'error');
                        return;
                    }
                    if (response.user) {
                        assignUser(response.user);
                        renderProfile();
                        renderProfileForm();
                        showToast('Profile updated.', 'success');
                    }
                });
            });
        }
        if (elements.profileTimezoneModes && elements.profileTimezoneModes.length && elements.profileTimezoneOffset) {
            elements.profileTimezoneModes.forEach((input) => {
                input.addEventListener('change', () => {
                    const selected = elements.profileTimezoneModes.find((node) => node.checked);
                    elements.profileTimezoneOffset.disabled = (selected?.value || 'system') !== 'custom';
                });
            });
        }
        if (elements.profileBio && elements.profileBioCount) {
            elements.profileBio.addEventListener('input', () => {
                elements.profileBioCount.textContent = String(elements.profileBio.value.length);
            });
        }
    };

    switchTab(state.ui.activeTab || 'chats');
    renderProfile();
    renderProfileForm();
    renderChats();
    renderContacts();
    if (state.ui.activeChatId) {
        openChat(state.ui.activeChatId);
    }
    syncMobileDrawer();
    const mobileQuery = window.matchMedia('(max-width: 960px)');
    mobileQuery.addEventListener('change', syncMobileDrawer);
    bindEvents();
    setupSocket();
})();