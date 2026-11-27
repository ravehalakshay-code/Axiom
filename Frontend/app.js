/**
 * AXIOM — Streaming AI Chatbot with NVIDIA Nemotron 3 Ultra + Markdown
 */

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

let conversationHistory = [];
let isSending = false;
let isWelcomeScreen = true;

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

  const content = document.createElement('p');
  content.textContent = text;

  msg.appendChild(label);
  msg.appendChild(content);

  if (sender === 'assistant') {
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
      alert('Failed to copy response to clipboard.');
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
    const response = await fetch('https://axiom-90ie.onrender.com/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: conversationHistory.slice(-20),
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

    if (accumulatedText.trim()) {
      conversationHistory.push({ role: 'assistant', content: accumulatedText });
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
});

document.addEventListener('DOMContentLoaded', () => {
  messageInput.focus();
  showWelcomeScreen();
});
