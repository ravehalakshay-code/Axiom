/**
 * AXIOM — Streaming AI Chatbot with NVIDIA Nemotron 3 Ultra + Markdown
 */

const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const clearBtn = document.getElementById('clearBtn');

let conversationHistory = [];
let isSending = false;

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
  setTimeout(() => {
    addMessage("Hello, I'm AXIOM. How can I help you?", 'assistant');
  }, 200);
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
   STREAMING HANDLER
============================================ */

async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || isSending) return;

  isSending = true;
  messageInput.value = '';
  messageInput.style.height = 'auto';

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
    const response = await fetch('/chat', {
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

document.addEventListener('DOMContentLoaded', () => {
  messageInput.focus();
  addMessage("Hello, I'm AXIOM. How can I help you?", 'assistant');
});
