/**
 * AXIOM — Streaming AI Chatbot with NVIDIA Nemotron 3 Ultra + Markdown
 */

const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const newChatBtn = document.getElementById('newChatBtn');
const clearBtn = document.getElementById('clearBtn');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const welcomeScreen = document.getElementById('welcomeScreen');
const timeGreeting = document.getElementById('timeGreeting');
const chatArea = document.getElementById('chatArea');

let conversationHistory = [];
let isSending = false;
let isWelcomeScreen = true;
let abortController = null;
let lastUserMessage = null;

/* ============================================
   USER SETTINGS & VISIT STATUS
============================================ */

const DEFAULT_SETTINGS = {
  birthday: null, // Optional: "MM-DD" format, e.g. "06-15"
  diwaliDate: null, // Optional: "MM-DD" format for current year Diwali
};

function getUserSettings() {
  try {
    const stored = localStorage.getItem('axiom_settings');
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // localStorage unavailable or invalid
  }
  return { ...DEFAULT_SETTINGS };
}

function getVisitStatus() {
  try {
    const visited = localStorage.getItem('axiom_visited');
    if (visited === '1') {
      return 'returning';
    }
    localStorage.setItem('axiom_visited', '1');
    return 'first';
  } catch (e) {
    // localStorage unavailable
    return 'unknown';
  }
}

/* ============================================
   DYNAMIC GREETING SYSTEM
============================================ */

function getGreeting(date, userSettings, visitStatus) {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  const hour = date.getHours();
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mmdd = String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');

  // 1. User's birthday, if configured and matching today
  if (userSettings.birthday && userSettings.birthday === mmdd) {
    return 'Happy Birthday!';
  }

  // 2. Special dates: New Year's Day (Jan 1)
  if (mmdd === '01-01') {
    return 'Happy New Year!';
  }

  // 2b. Special dates: Diwali (configurable date)
  if (userSettings.diwaliDate && userSettings.diwaliDate === mmdd) {
    return 'Happy Diwali!';
  }

  // 3. First visit
  if (visitStatus === 'first') {
    return 'Hi, I\'m AXIOM';
  }

  // 4. Returning visit
  if (visitStatus === 'returning') {
    return 'Back at it';
  }

  // 5. Late-night greeting (12:00 AM–4:59 AM)
  if (hour >= 0 && hour < 5) {
    return 'Burning the midnight oil?';
  }

  // 6. Day-of-week greetings
  if (dayOfWeek === 1) {
    return 'Fresh week, let\'s go'; // Monday
  }
  if (dayOfWeek === 5) {
    return 'Happy Friday!'; // Friday
  }
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    return 'Weekend mode on'; // Saturday, Sunday
  }

  // 7. Normal time-based greeting
  if (hour >= 5 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/* ============================================
   WELCOME SCREEN STATE
============================================ */

function showWelcomeScreen() {
  if (welcomeScreen) welcomeScreen.style.display = 'flex';
  if (timeGreeting) {
    const settings = getUserSettings();
    const visitStatus = getVisitStatus();
    timeGreeting.textContent = getGreeting(new Date(), settings, visitStatus);
  }
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
   HELPER FUNCTIONS
============================================ */

function addMessage(text, sender) {
  const msg = document.createElement('div');
  msg.className = `message ${sender}`;

  const label = document.createElement('span');
  label.className = 'message-label';
  label.textContent = sender === 'user' ? 'You' : 'AXIOM';

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;

  msg.appendChild(label);
  msg.appendChild(content);

  if (sender === 'assistant') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn copy-btn';
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

    const regenerateBtn = document.createElement('button');
    regenerateBtn.className = 'msg-action-btn regenerate-btn';
    regenerateBtn.setAttribute('aria-label', 'Regenerate response');
    regenerateBtn.setAttribute('title', 'Regenerate response');
    regenerateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
        <path d="M1 4v6h6M23 20v-6h-6M1 4l4.5 4.5M23 20l-4.5-4.5"/>
      </svg>
    `;
    regenerateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRegenerate(msg, text);
    });

    actions.appendChild(copyBtn);
    actions.appendChild(regenerateBtn);
    msg.appendChild(actions);
  }

  chatWindow.appendChild(msg);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
  return msg;
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
  lastUserMessage = null;
  abortController = null;
}

function startNewChat() {
  clearConversation();
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

/* ============================================
   COPY TO CLIPBOARD
============================================ */

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showCopyConfirmation(btn);
  } catch (err) {
    // Fallback for older browsers or permission denied
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
      console.warn('Clipboard copy failed:', fallbackErr);
      // Silent failure — UI remains usable
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
  abortController = new AbortController();

  // Swap Send -> Stop
  if (sendBtn) sendBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'flex';

  messageInput.value = '';
  messageInput.style.height = 'auto';

  // Hide welcome screen on first user message
  if (isWelcomeScreen) {
    hideWelcomeScreen();
  }

  addMessage(text, 'user');
  conversationHistory.push({ role: 'user', content: text });
  lastUserMessage = text;

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

  function cleanup() {
    if (loadingMsg.parentNode) chatWindow.removeChild(loadingMsg);
    if (sendBtn) sendBtn.style.display = 'flex';
    if (stopBtn) stopBtn.style.display = 'none';
    isSending = false;
    abortController = null;
  }

  try {
    const response = await fetch('https://axiom-90ie.onrender.com/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(-20),
      }),
      signal: abortController.signal,
    });

    if (loadingMsg.parentNode) chatWindow.removeChild(loadingMsg);

    if (!response.ok) {
      chatWindow.removeChild(assistantMsg);
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.message || errorData.detail || 'Something went wrong with the server.';
      showErrorMessage(`Oops! ${errorMsg}`);
      cleanup();
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

    if (accumulatedText.trim()) {
      conversationHistory.push({ role: 'assistant', content: accumulatedText });
    }
  } catch (error) {
    if (abortController && abortController.signal.aborted) {
      // Request was aborted by user — preserve partial text
      if (accumulatedText.trim()) {
        streamContent.innerHTML = renderMarkdown(accumulatedText);
        conversationHistory.push({ role: 'assistant', content: accumulatedText });
      } else {
        if (assistantMsg.parentNode) chatWindow.removeChild(assistantMsg);
      }
      // Do not show error for user-initiated stop
    } else {
      if (loadingMsg.parentNode) chatWindow.removeChild(loadingMsg);
      if (assistantMsg.parentNode) chatWindow.removeChild(assistantMsg);
      showErrorMessage("Oops! There was a network error. Please make sure the server is running.");
    }
  } finally {
    cleanup();
  }
}

function handleStop() {
  if (!abortController) return;
  abortController.abort();
  // UI restoration happens in handleSend's catch/finally
}

function handleRegenerate(targetMsg, previousText) {
  if (isSending) return;
  if (!lastUserMessage) return;

  // Remove the previous assistant response from UI
  if (targetMsg && targetMsg.parentNode) {
    targetMsg.parentNode.removeChild(targetMsg);
  }

  // Remove the previous assistant response from conversation history
  // Find and remove the last assistant entry
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    if (conversationHistory[i].role === 'assistant') {
      conversationHistory.splice(i, 1);
      break;
    }
  }

  // Re-send the last user message
  messageInput.value = lastUserMessage;
  messageInput.style.height = 'auto';
  handleSend();
}

/* ============================================
   EVENT LISTENERS
============================================ */

sendBtn.addEventListener('click', handleSend);
stopBtn.addEventListener('click', handleStop);
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
});

document.addEventListener('DOMContentLoaded', () => {
  messageInput.focus();
  showWelcomeScreen();
});
