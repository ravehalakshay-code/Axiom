# AXIOM — AI Chatbot 🤖

AXIOM is an AI-powered chatbot built using **HTML, CSS, JavaScript, Python, and FastAPI**. It provides a clean, modern chat interface that allows users to interact with an AI model and receive responses to their questions.

The project combines a responsive frontend with a Python backend to demonstrate how a web-based AI chatbot works.

## ✨ Features

- 💬 **Interactive Chat Interface** — Send messages and receive AI-generated responses.
- 🤖 **AI Integration** — Connects the frontend to an AI model through the FastAPI backend.
- 🎨 **Modern Dark UI** — Clean interface with a dark theme and AXIOM branding.
- 📱 **Responsive Design** — Designed to work across desktop, tablet, and mobile screens.
- ⚡ **FastAPI Backend** — Handles chat requests and communicates with the AI model.
- 🔄 **Loading Indicators** — Provides feedback while a response is being generated.
- 🆕 **New Chat** — Start a fresh conversation.
- 🧹 **Clear Chat** — Clear the current conversation from the interface.
- 📝 **Long-Response Support** — Displays detailed answers with scrollable chat content, subject to model and API limits.
- 🛡️ **Error Handling** — Handles invalid input and API errors.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 | Chat interface structure |
| CSS3 | Styling, layout, and responsive design |
| JavaScript | Frontend interactions and API requests |
| Python | Backend logic |
| FastAPI | Backend API framework |
| Uvicorn | ASGI development server |
| NVIDIA Nemotron | AI model integration |

## 📁 Project Structure

```text
AXIOM/
├── main.py       # FastAPI backend and AI integration
├── index.html    # Chat interface structure
├── index.css     # Styling and responsive layout
└── app.js        # Frontend logic and API communication
```

## ⚙️ Prerequisites

Before running AXIOM, ensure you have:

- Python 3.10 or later
- pip
- A modern web browser
- An API key and access to the configured AI model, if required by your integration

## 🚀 Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/ravehalakshay-code/AXIOM.git
```

Navigate into the project directory:

```bash
cd AXIOM
```

> If your repository uses a different name, replace `AXIOM` with your repository's directory name.

### 2. Create a Virtual Environment

**Windows:**

```powershell
python -m venv .venv
.venv\Scripts\activate
```

**Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

If you're using the Fish shell on Linux:

```fish
source .venv/bin/activate.fish
```

### 3. Install Dependencies

```bash
python -m pip install fastapi uvicorn pydantic
```

Install any additional packages required by your specific AI provider integration.

### 4. Configure AI Model Access

If your backend requires an API key, configure it using an environment variable or another secure configuration method supported by your implementation.

For example, in Linux:

```bash
export NVIDIA_API_KEY="your_api_key_here"
```

In Windows PowerShell:

```powershell
$env:NVIDIA_API_KEY="your_api_key_here"
```

Replace the example variable name with the exact environment variable expected by your backend.

**Security:** Never commit API keys, passwords, or other secrets to GitHub.

### 5. Start the Backend

Run the following command from the directory containing `main.py`:

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The backend should be available at:

```text
http://127.0.0.1:8000
```

If your application exposes FastAPI's automatic API documentation, you can also visit:

```text
http://127.0.0.1:8000/docs
```

### 6. Open AXIOM

Open the application's configured frontend URL in your browser. If your FastAPI application serves `index.html` at the root route, visit:

```text
http://127.0.0.1:8000
```

If the frontend is not served by FastAPI, open it through the frontend setup configured in your project. Avoid opening `index.html` directly with `file://` if the application relies on API requests that require a web server.

## 🔄 How It Works

1. The user enters a message in the AXIOM chat interface.
2. JavaScript sends the message to the FastAPI backend.
3. The backend processes the request and communicates with the configured AI model.
4. The AI model generates a response.
5. The backend returns the response to the frontend.
6. JavaScript displays the response in the conversation.

```text
User
  │
  ▼
HTML + CSS + JavaScript
  │
  ▼
FastAPI Backend (Python)
  │
  ▼
Configured AI Model
  │
  ▼
FastAPI Response
  │
  ▼
AXIOM Chat Interface
```

## 🧪 Testing

Test the application with:

- Basic questions and general knowledge queries.
- Programming questions, including Python examples.
- Long responses and multiline messages.
- Empty input and invalid requests.
- API failures or missing credentials.
- New Chat and Clear Chat functionality.
- Desktop, tablet, and mobile screen sizes.

## 🔐 Security Considerations

- Keep API keys and credentials out of source control.
- Store secrets in environment variables or an appropriate secret manager.
- Validate incoming requests on the backend.
- Handle API errors without exposing sensitive information.
- Configure CORS appropriately if the frontend and backend use different origins.
- For production deployments, use an appropriate server configuration rather than relying on development mode.

## 🚧 Current Limitations

- Response availability and length depend on the configured AI model and API.
- Internet access may be required to communicate with a hosted AI service.
- API usage may be subject to provider rate limits, quotas, and costs.
- Production deployment may require additional authentication, monitoring, and security controls.

## 🔮 Future Improvements

- Conversation history and persistent chat storage.
- User authentication and personalized conversations.
- Markdown rendering and syntax-highlighted code blocks.
- Streaming AI responses.
- Multiple AI model support.
- Chat export functionality.
- Improved accessibility and keyboard navigation.
- Production deployment and monitoring.

## 🎯 Learning Objectives

This project demonstrates practical experience with:

- Building interactive web interfaces.
- Connecting a JavaScript frontend to a Python backend.
- Creating REST API endpoints using FastAPI.
- Integrating an AI model into a web application.
- Handling asynchronous requests and errors.
- Organizing a small full-stack project.
- Designing responsive user interfaces.

## 👨‍💻 Author

**Akshay Kumar**

GitHub: [@ravehalakshay-code](https://github.com/ravehalakshay-code)

## 📄 License

This project is available for learning and personal development. Add a `LICENSE` file to the repository if you want to specify formal terms for reuse and distribution.

---

⭐ If you find this project interesting, consider starring the repository!
