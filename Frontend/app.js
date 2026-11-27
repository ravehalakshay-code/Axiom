/**
 * AXIOM — Streaming AI Chatbot with NVIDIA Nemotron 3 Ultra + Markdown
 */

const API_BASE = 'https://axiom-90ie.onrender.com';

const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const clearBtn = document.getElementById('clearBtn');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const welcomeScreen = document.getElementById('welcomeScreen');
const timeGreeting = document.getElementById('timeGreeting');
const chatArea = document.getElementById('chatArea');
const sidebarNav = document.getElementById('sidebarNav');

let conversationHistory = [];
let isSending = false;
let isWelcomeScreen = true;
let sessionId = null;
let activeConversationId = null;
let pendingDeleteId = null;
let pendingRenameId = null;

/* ============================================
   CUSTOM MODALS & TOASTS (no alert/confirm/prompt)
============================================ */

let deleteModal = null;
let renameModal = null;
let openDropdownId = null;

function createDeleteModal() {
  if (deleteModal) return deleteModal;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
      <h2 id="delete-modal-title" class="modal-title">Delete conversation?</h2>
      <p class="modal-description">This conversation and all its messages will be permanently deleted. This action cannot be undone.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" id="delete-cancel">Cancel</button>
        <button type="button" class="btn btn-danger" id="delete-confirm">Delete</button>
      </div>
    </div>
  `;

  overlay.querySelector('#delete-cancel').addEventListener('click', closeDeleteModal);
  overlay.querySelector('#delete-confirm').addEventListener('click', () => {
    if (pendingDeleteId) {
      closeDeleteModal();
      handleDeleteConfirm(pendingDeleteId);
      pendingDeleteId = null;
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDeleteModal();
  });

  document.body.appendChild(overlay);
  deleteModal = overlay;
  return deleteModal;
}

function openDeleteModal(conversationId) {
  createDeleteModal();
  pendingDeleteId = conversationId;
  deleteModal.classList.add('active');
  document.addEventListener('keydown', handleDeleteModalKeydown);
}

function closeDeleteModal() {
  if (!deleteModal) return;
  deleteModal.classList.remove('active');
  pendingDeleteId = null;
  document.removeEventListener('keydown', handleDeleteModalKeydown);
}

function handleDeleteModalKeydown(e) {
  if (e.key === 'Escape') closeDeleteModal();
}

function handleDeleteConfirm(conversationId) {
  deleteConversation(conversationId).then((result) => {
    if (!result.success) {
      showErrorToast(result.error || 'Failed to delete conversation. Please try again.');
    }
  });
}

function createRenameModal() {
  if (renameModal) return renameModal;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title">
      <h2 id="rename-modal-title" class="modal-title">Rename conversation</h2>
      <div class="modal-actions">
        <input type="text" id="rename-input" class="rename-input" placeholder="Enter title" maxlength="100" />
      </div>
      <div class="modal-actions rename-actions">
        <button type="button" class="btn btn-secondary" id="rename-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="rename-save">Save</button>
      </div>
    </div>
  `;

  const input = overlay.querySelector('#rename-input');
  const saveBtn = overlay.querySelector('#rename-save');
  const cancelBtn = overlay.querySelector('#rename-cancel');

  const doRename = async () => {
    const newTitle = input.value.trim();
    if (!pendingRenameId) {
      closeRenameModal();
      return;
    }
    if (!newTitle) {
      showErrorToast('Title cannot be empty.');
      input.focus();
      return;
    }
    const success = await renameConversation(pendingRenameId, newTitle);
    if (!success) {
      showErrorToast('Failed to rename conversation. Please try again.');
      return;
    }
    closeRenameModal();
    pendingRenameId = null;
  };

  saveBtn.addEventListener('click', doRename);
  cancelBtn.addEventListener('click', closeRenameModal);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRename();
    if (e.key === 'Escape') closeRenameModal();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeRenameModal();
  });

  document.body.appendChild(overlay);
  renameModal = overlay;
  return { overlay, input, saveBtn, cancelBtn };
}

function openRenameModal(conversationId, currentTitle) {
  const modal = createRenameModal();
  const input = modal.overlay.querySelector('#rename-input');
  pendingRenameId = conversationId;
  input.value = currentTitle;
  input.select();
  modal.overlay.classList.add('active');
}

function closeRenameModal() {
  if (!renameModal) return;
  renameModal.overlay.classList.remove('active');
  renameModal.input.value = '';
}

function showErrorToast(message) {
  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function closeAllDropdowns() {
  document.querySelectorAll('.conv-dropdown').forEach((d) => d.classList.remove('active'));
  document.querySelectorAll('.conv-menu-btn').forEach((btn) => {
    btn.style.display = '';
  });
  openDropdownId = null;
}

function toggleDropdown(conversationId, btn) {
  if (openDropdownId === conversationId) {
    closeAllDropdowns();
    return;
  }
  closeAllDropdowns();

  const dropdown = document.getElementById(`conv-dropdown-${conversationId}`);
  if (!dropdown) return;

  // Use fixed positioning to escape #sidebarNav's overflow-y: auto clipping
  const rect = btn.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${Math.floor(rect.right)}px`;
  dropdown.style.top = `${Math.floor(rect.bottom)}px`;
  dropdown.style.zIndex = '1000';

  dropdown.classList.add('active');
  openDropdownId = conversationId;
  btn.style.display = 'flex';
}

/* ============================================
   SESSION MANAGEMENT
============================================ */

function getOrCreateSessionId() {
  let sid = localStorage.getItem('axiom_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('axiom_session_id', sid);
  }
  return sid;
}

/* ============================================
   TIME-BASED GREETING
============================================ */

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) return 'Burning the midnight oil?';
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/* ============================================
   WELCOME SCREEN STATE
============================================ */

function showWelcomeScreen() {
  if (welcomeScreen) welcomeScreen.style.display = 'flex';
  if (timeGreeting) timeGreeting.textContent = getTimeBasedGreeting();
  if (chatArea) chatArea.classList.add('welcome-mode');
  if (chatWindow) chatWindow.classList.remove('active');
  isWelcomeScreen = true;
}

function hideWelcomeScreen() {
  if (welcomeScreen) welcomeScreen.style.display = 'none';
  if (chatArea) chatArea.classList.remove('welcome-mode');
  if (chatWindow) chatWindow.classList.add('active');
  isWelcomeScreen = false;
}

/* ============================================
   CONVERSATION CRUD (frontend)
============================================ */

async function fetchConversations() {
  try {
    const response = await fetch(`${API_BASE}/conversations?session_id=${encodeURIComponent(sessionId)}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    loggerWarn('Failed to fetch conversations:', err);
    return [];
  }
}

async function loadConversation(conversationId) {
  try {
    const response = await fetch(
      `${API_BASE}/conversations/${conversationId}?session_id=${encodeURIComponent(sessionId)}`
    );
    if (!response.ok) {
      loggerWarn('Failed to load conversation:', response.status);
      return null;
    }
    const data = await response.json();

    clearConversation();

    // Render previous messages
    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages) {
        addMessage(msg.content, msg.role);
      }
    }

    activeConversationId = conversationId;
    localStorage.setItem('axiom_active_conversation_id', conversationId);

    hideWelcomeScreen();
    updateSidebarActiveState(conversationId);
    return data;
  } catch (err) {
    loggerWarn('Error loading conversation:', err);
    return null;
  }
}

async function createConversation(firstMessage = null) {
  try {
    const response = await fetch(`${API_BASE}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        title: 'New Conversation',
        first_message: firstMessage,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    activeConversationId = data.id;
    localStorage.setItem('axiom_active_conversation_id', data.id);
    await renderConversationList();
    updateSidebarActiveState(data.id);
    return data;
  } catch (err) {
    loggerWarn('Failed to create conversation:', err);
    return null;
  }
}

async function renameConversation(conversationId, newTitle) {
  try {
    const response = await fetch(
      `${API_BASE}/conversations/${conversationId}?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      }
    );
    if (!response.ok) {
      loggerWarn('Rename failed:', response.status);
      return false;
    }
    await renderConversationList();
    return true;
  } catch (err) {
    loggerWarn('Failed to rename conversation:', err);
    return false;
  }
}

async function deleteConversation(conversationId) {
  try {
    const response = await fetch(
      `${API_BASE}/conversations/${conversationId}?session_id=${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      let errorMsg = 'Failed to delete conversation.';
      try {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorData.message || errorMsg;
      } catch (e) {
        // Use default message
      }
      return { success: false, error: errorMsg };
    }

    const wasActive = activeConversationId === conversationId;

    if (wasActive) {
      activeConversationId = null;
      localStorage.removeItem('axiom_active_conversation_id');
    }

    await renderConversationList();

    // If the deleted conversation was active, open another or show welcome screen
    if (wasActive) {
      const conversations = await fetchConversations();
      if (conversations.length > 0) {
        await loadConversation(conversations[0].id);
      } else {
        clearConversation();
        showWelcomeScreen();
      }
    }

    return { success: true };
  } catch (err) {
    loggerWarn('Failed to delete conversation:', err);
    return { success: false, error: err.message || 'Failed to delete conversation.' };
  }
}

async function renderConversationList() {
  if (!sidebarNav) return;
  const conversations = await fetchConversations();

  // Find existing conversation list element or create one
  let convList = sidebarNav.querySelector('.conversation-list');
  if (!convList) {
    convList = document.createElement('div');
    convList.className = 'conversation-list';
    // Insert after the Clear button, before end of nav
    const clearBtn = sidebarNav.querySelector('#clearBtn');
    if (clearBtn && clearBtn.parentNode) {
      clearBtn.parentNode.insertAdjacentElement('afterend', convList);
    } else {
      sidebarNav.appendChild(convList);
    }
  }

  convList.innerHTML = '';

  if (conversations.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'conversation-empty';
    empty.textContent = 'No previous conversations';
    empty.style.fontSize = '12px';
    empty.style.color = 'var(--text-muted)';
    empty.style.padding = '10px 14px';
    convList.appendChild(empty);
    return;
  }

  const header = document.createElement('div');
  header.className = 'conversation-list-header';
  header.textContent = 'Conversations';
  header.style.fontSize = '11px';
  header.style.fontWeight = '600';
  header.style.letterSpacing = '0.5px';
  header.style.textTransform = 'uppercase';
  header.style.color = 'var(--text-muted)';
  header.style.padding = '10px 14px';
  convList.appendChild(header);

  for (const conv of conversations) {
    const item = document.createElement('div');
    item.className = `conversation-item${activeConversationId === conv.id ? ' active' : ''}`;
    item.dataset.id = conv.id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'conversation-title';
    titleSpan.textContent = conv.title;
    titleSpan.style.flex = '1';
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.style.whiteSpace = 'nowrap';

    // Three-dot menu button (hidden until hover)
    const menuBtn = document.createElement('button');
    menuBtn.className = 'conv-menu-btn';
    menuBtn.setAttribute('aria-label', 'More options');
    menuBtn.setAttribute('title', 'More options');
    menuBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
        <circle cx="12" cy="12" r="1"/>
        <circle cx="12" cy="5" r="1"/>
        <circle cx="12" cy="19" r="1"/>
      </svg>
    `;
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown(conv.id, menuBtn);
    });

    // Touch device support: show menu button on touch
    item.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      menuBtn.style.display = 'flex';
    });

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'conv-dropdown';
    dropdown.id = `conv-dropdown-${conv.id}`;

    const renameItem = document.createElement('div');
    renameItem.className = 'conv-dropdown-item';
    renameItem.setAttribute('role', 'menuitem');
    renameItem.textContent = 'Rename';
    renameItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      openRenameModal(conv.id, conv.title);
    });

    const deleteItem = document.createElement('div');
    deleteItem.className = 'conv-dropdown-item';
    deleteItem.setAttribute('role', 'menuitem');
    deleteItem.textContent = 'Delete';
    deleteItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns();
      openDeleteModal(conv.id);
    });

    dropdown.appendChild(renameItem);
    dropdown.appendChild(deleteItem);

    item.appendChild(titleSpan);
    item.appendChild(menuBtn);
    item.appendChild(dropdown);

    // Click on title area to open conversation (not on menu/dropdown)
    item.addEventListener('click', (e) => {
      if (e.target === menuBtn || e.target.closest('.conv-dropdown') ||
          e.target.closest('.conv-menu-btn')) return;
      loadConversation(conv.id);
    });

    convList.appendChild(item);
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.conv-dropdown') && !e.target.closest('.conv-menu-btn')) {
    closeAllDropdowns();
  }
});

// Close dropdowns when scrolling (fixed-position dropdowns don't move with scroll)
document.addEventListener('scroll', closeAllDropdowns, true);

function updateSidebarActiveState(conversationId) {
  const items = document.querySelectorAll('.conversation-item');
  items.forEach((item) => {
    if (item.dataset.id === conversationId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

/* ============================================
   MARKDOWN RENDERING (safe, progressive)
============================================ */

function sanitizeMarkdown(html) {
  if (!window.DOMPurify) return html;
  return window.DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'h1','h2','h3','h4','h5','h6','p','br','strong','em','b','i',
      'code','pre','blockquote','ul','ol','li','a','table','thead',
      'tbody','tr','th','td','hr'
    ],
    ALLOWED_ATTR: ['href','class','target','rel']
  });
}

function renderMarkdown(text) {
  if (!window.marked) return text;
  const dirty = window.marked.parse(text || '');
  return sanitizeMarkdown(dirty);
}

/* ============================================
   ASSISTANT MESSAGE RENDERING (single path)
============================================ */

/**
 * Renders a complete assistant message element with Markdown + Copy button.
 * Used for both newly generated responses and restored SQLite messages.
 */
function renderAssistantMessage(content, messageElement) {
  const streamContent = messageElement.querySelector('.stream-content');
  if (streamContent) {
    streamContent.innerHTML = renderMarkdown(content);
  } else {
    // Fallback for message elements created without .stream-content
    const contentDiv = messageElement.querySelector('.message-content') ||
      messageElement.querySelector('p');
    if (contentDiv) {
      contentDiv.innerHTML = renderMarkdown(content);
    }
  }
  addCopyButton(messageElement, content);
}

/* ============================================
   HELPER FUNCTIONS
============================================ */

function addMessage(text, sender) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;

  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = sender === 'user' ? 'You' : 'AXIOM';

  if (sender === 'assistant') {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'stream-content';
    contentDiv.innerHTML = renderMarkdown(text);

    msg.appendChild(label);
    msg.appendChild(contentDiv);
    addCopyButton(msg, text);
  } else {
    const content = document.createElement('p');
    content.textContent = text;

    msg.appendChild(label);
    msg.appendChild(content);
  }

  chatWindow.appendChild(msg);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
}

function createLoadingIndicator() {
  const msg = document.createElement('div');
  msg.className = 'message assistant';
  msg.innerHTML = '<span class="message-label">AXIOM</span><p>Thinking...</p>';
  msg.style.opacity = '0.7';
  return msg;
}

function createStreamingAssistantMessage() {
  const msg = document.createElement('div');
  msg.className = 'message assistant';
  msg.innerHTML = '<span class="message-label">AXIOM</span><div class="stream-content"></div>';
  return msg;
}

function getStreamContentElement(msg) {
  return msg.querySelector('.stream-content');
}

function clearConversation() {
  chatWindow.innerHTML = '';
  conversationHistory = [];
}

function startNewChat() {
  clearConversation();
  activeConversationId = null;
  localStorage.removeItem('axiom_active_conversation_id');
  showWelcomeScreen();
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  const newHeight = Math.min(messageInput.scrollHeight, 180);
  messageInput.style.height = newHeight + 'px';
}

function showErrorMessage(errorMsg) {
  addMessage(errorMsg, 'assistant');
}

function loggerWarn(...args) {
  if (console && console.warn) {
    console.warn('[AXIOM]', ...args);
  }
}

/* ============================================
   COPY BUTTON HELPER
============================================ */

function addCopyButton(msg, text) {
  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-copy-btn';
  copyBtn.setAttribute('aria-label', 'Copy response');
  copyBtn.setAttribute('title', 'Copy response');
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  `;
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyToClipboard(text, copyBtn);
  });
  msg.appendChild(copyBtn);
}

/* ============================================
   COPY TO CLIPBOARD
============================================ */

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showCopyConfirmation(btn);
  } catch (err) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showCopyConfirmation(btn);
    } catch (fallbackErr) {
      showErrorToast('Failed to copy response to clipboard.');
    }
  }
}

function showCopyConfirmation(btn) {
  const originalHtml = btn.innerHTML;
  const originalTitle = btn.title;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  `;
  btn.title = 'Copied!';
  btn.style.color = 'var(--accent)';
  setTimeout(() => {
    btn.innerHTML = originalHtml;
    btn.title = originalTitle;
    btn.style.color = '';
  }, 1500);
}

/* ============================================
   STREAMING HANDLER
============================================ */

async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || isSending) return;

  isSending = true;
  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Hide welcome screen on first user message
  if (isWelcomeScreen) {
    hideWelcomeScreen();
  }

  addMessage(text, 'user');
  conversationHistory.push({ role: 'user', content: text });

  const loadingMsg = createLoadingIndicator();
  chatWindow.appendChild(loadingMsg);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });

  const assistantMsg = createStreamingAssistantMessage();
  chatWindow.appendChild(assistantMsg);
  const streamContent = getStreamContentElement(assistantMsg);

  let accumulatedText = '';
  let renderTimeout = null;

  function scheduleRender() {
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      streamContent.innerHTML = renderMarkdown(accumulatedText);
      chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
      renderTimeout = null;
    }, 120);
  }

  try {
    // Ensure we have an active conversation for persistence
    if (!activeConversationId) {
      const created = await createConversation(text);
      if (!created) {
        showErrorMessage("Oops! Could not create conversation.");
        isSending = false;
        if (loadingMsg.parentNode) chatWindow.removeChild(loadingMsg);
        if (assistantMsg.parentNode) chatWindow.removeChild(assistantMsg);
        return;
      }
    }

    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(-20),
        session_id: sessionId,
        conversation_id: activeConversationId,
      }),
    });

    if (loadingMsg.parentNode) chatWindow.removeChild(loadingMsg);

    if (!response.ok) {
      chatWindow.removeChild(assistantMsg);
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.message || errorData.detail || 'Something went wrong with the server.';
      showErrorMessage(`Oops! ${errorMsg}`);
      isSending = false;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            streamDone = true;
          } else {
            try {
              const chunkObj = JSON.parse(dataStr);
              if (chunkObj.chunk && typeof chunkObj.chunk === 'string') {
                accumulatedText += chunkObj.chunk;
                scheduleRender();
              }
              if (chunkObj.error) {
                streamDone = true;
                chatWindow.removeChild(assistantMsg);
                showErrorMessage(`Oops! ${chunkObj.error}`);
              }
            } catch (e) {
              // Ignore malformed chunks
            }
          }
        }
      }
    }

    // Final render with full markdown - no truncation
    streamContent.innerHTML = renderMarkdown(accumulatedText);
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });

    // Add Copy button to the completed assistant response
    addCopyButton(assistantMsg, accumulatedText);

    if (accumulatedText.trim()) {
      conversationHistory.push({ role: 'assistant', content: accumulatedText });
    }

    // Update conversation title after first exchange if it's still default
    if (conversationHistory.length === 2) {
      // Title already set from first message on backend
    }
  } catch (error) {
    if (loadingMsg.parentNode) chatWindow.removeChild(loadingMsg);
    if (assistantMsg.parentNode) chatWindow.removeChild(assistantMsg);
    showErrorMessage("Oops! There was a network error. Please make sure the server is running.");
  } finally {
    isSending = false;
  }
}

function handleInputKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
}

/* ============================================
   EVENT LISTENERS
============================================ */

sendBtn.addEventListener('click', handleSend);
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSend();
});
messageInput.addEventListener('keydown', handleInputKeydown);
messageInput.addEventListener('input', autoResizeTextarea);
newChatBtn.addEventListener('click', startNewChat);
clearBtn.addEventListener('click', () => {
  clearConversation();
  messageInput.value = '';
  messageInput.focus();
});
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  closeAllDropdowns();
});

document.addEventListener('DOMContentLoaded', async () => {
  messageInput.focus();

  // Initialize session (preserve anonymous session ID across refreshes)
  sessionId = getOrCreateSessionId();

  // Always start with welcome screen on refresh — do not auto-open previous conversation
  activeConversationId = null;
  localStorage.removeItem('axiom_active_conversation_id');
  showWelcomeScreen();

  // Render conversation list in sidebar (but don't auto-open any conversation)
  await renderConversationList();
});
