document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('open-options').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('retry-btn').addEventListener('click', () => {
        startSummarization();
    });

    document.getElementById('copy-btn').addEventListener('click', () => {
        const content = document.getElementById('content').innerText;
        navigator.clipboard.writeText(content).then(() => {
            const btn = document.getElementById('copy-btn');
            const originalText = btn.innerText;
            btn.innerText = 'Copied!';
            setTimeout(() => btn.innerText = originalText, 2000);
        });
    });

    startSummarization();
});

async function startSummarization() {
    const contentDiv = document.getElementById('content');
    const actionsBar = document.getElementById('actions-bar');

    // Reset UI
    actionsBar.style.display = 'none';
    contentDiv.innerHTML = `
        <div class="loading-container">
            <div class="spinner"></div>
            <span>Generating summary...</span>
        </div>
    `;

    try {
        const settings = await getSettings();
        if (!validateSettings(settings)) {
            showError('Configuration Required', 'Please configure your API keys in Settings first.');
            return;
        }

        const tab = await getActiveTab();
        if (!tab || !tab.url || !tab.url.startsWith('http')) {
            const cleanUrl = tab?.url || 'unknown';
            showError('Unavailable', `Cannot summarize this page type (${cleanUrl}).`);
            return;
        }

        const pageContent = await extractPageContent(tab.id); // Renamed pageText to pageContent
        if (!pageContent || pageContent.trim().length === 0) {
            showError('No Content', 'No readable text found on this page.');
            return;
        }

        const summary = await summarizeText(pageContent, settings); // Changed to summarizeText as per original, assuming generateSummary is a typo in instruction
        renderSummary(summary);
        actionsBar.style.display = 'flex';

    } catch (err) {
        // Ensure loading spinner is removed and contentDiv is visible for error message
        if (loadingDiv) loadingDiv.style.display = 'none';
        contentDiv.style.display = 'block';

        if (err.message === 'MISSING_KEY') {
            showError('Setup Required', 'Please configure your API Key in settings.');
            // Add Configure Button dynamically
            const errorContainer = document.querySelector('.error-container'); // Assuming .error-container exists within contentDiv
            if (errorContainer) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-primary';
                btn.style.marginTop = '10px';
                btn.textContent = 'Open Settings';
                btn.onclick = () => chrome.runtime.openOptionsPage();
                errorContainer.appendChild(btn);
            }
        } else {
            showError('Summarization Failed', err.message);
        }
        console.error(err);
    }
}

function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({
            provider: 'ollama', // ollama, openai, groq, gemini
            // OpenAI
            openaiKey: '',
            openaiModel: 'gpt-4o-mini',
            // Ollama
            ollamaUrl: 'http://localhost:11434',
            ollamaModel: 'llama3',
            // Groq
            groqKey: '',
            groqModel: 'llama3-8b-8192',
            // Gemini
            geminiKey: '',
            geminiModel: 'gemini-1.5-flash-latest'
        }, (items) => {
            // Trim Keys!
            items.openaiKey = (items.openaiKey || '').trim();
            items.groqKey = (items.groqKey || '').trim();
            items.geminiKey = (items.geminiKey || '').trim();
            items.ollamaUrl = (items.ollamaUrl || '').trim();

            resolve(items);
        });
    });
}

function validateSettings(settings) {
    if (settings.provider === 'openai' && !settings.openaiKey) return false;
    if (settings.provider === 'groq' && !settings.groqKey) return false;
    if (settings.provider === 'gemini' && !settings.geminiKey) return false;
    if (settings.provider === 'ollama' && !settings.ollamaUrl) return false;
    return true;
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function extractPageContent(tabId) {
    const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
            // Improved extraction could go here (e.g. Readability.js)
            // For now, grabbing body text is the MVP
            return document.body.innerText;
        }
    });
    return results[0].result;
}

async function summarizeText(text, settings) {
    const MAX_CHARS = 15000;
    const truncatedText = text.slice(0, MAX_CHARS);
    const prompt = `Summarize the following web page content. Capture the main ideas, key arguments, and any important details. Format the output with a clear Main Topic, followed by bullet points. Use bold for key terms.\n\nContent:\n${truncatedText}`;

    switch (settings.provider) {
        case 'openai':
            return await callOpenAI(prompt, settings);
        case 'groq':
            return await callGroq(prompt, settings);
        case 'gemini':
            return await callGemini(prompt, settings);
        case 'ollama':
            return await callOllama(prompt, settings);
        default:
            throw new Error('Unknown provider selected.');
    }
}

// --- Provider Implementations ---

async function callOpenAI(prompt, settings) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.openaiKey}`
        },
        body: JSON.stringify({
            model: settings.openaiModel,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`OpenAI Error: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

async function callGroq(prompt, settings) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.groqKey}`
        },
        body: JSON.stringify({
            model: settings.groqModel,
            messages: [{ role: 'user', content: prompt }],
            // Groq supports higher limits, but 1024 is safe for summary
            max_tokens: 1024
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Groq Error: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    return data.choices[0].message.content;
}

async function callGemini(prompt, settings) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.geminiModel}:generateContent?key=${settings.geminiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(`Gemini Error: ${err.error?.message || response.statusText}`);
    }
    const data = await response.json();
    // Gemini structure: candidates[0].content.parts[0].text
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No summary generated.";
}

async function callOllama(prompt, settings) {
    const baseUrl = settings.ollamaUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/api/generate`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: prompt,
                stream: false
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ollama Error: ${response.status} - ${text}`);
        }

        const data = await response.json();
        return data.response;
    } catch (e) {
        if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
            throw new Error('Failed to connect to Ollama. Ensure it is running (check CORS).');
        }
        throw e;
    }
}

// --- UI Helpers ---

// --- UI Helpers ---

function renderSummary(text) {
    const contentDiv = document.getElementById('content');

    // Check if empty or error object
    if (!text) {
        showError('Empty Response', 'The provider returned no text.');
        return;
    }

    // Advanced Basic Markdown Parser
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^# (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h4>$1</h4>')
        .replace(/^### (.*$)/gm, '<h5>$1</h5>')
        .replace(/^\s*[\-\*] (.*$)/gm, '<li>$1</li>')
        .replace(/^\s*\d+\. (.*$)/gm, '<li>$1</li>')
        .replace(/\n\n/g, '<p></p>')
        .replace(/\n/g, ' ');

    html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
    contentDiv.innerHTML = html;
}

function showError(title, msg) {
    const contentDiv = document.getElementById('content');
    const actionsBar = document.getElementById('actions-bar');

    if (actionsBar) actionsBar.style.display = 'none';

    // Ensure we show the full error for debugging
    console.error(`[Error] ${title}:`, msg);

    contentDiv.innerHTML = `
        <div class="error-container">
            <div class="error-title" style="color:#ef4444;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                ${title}
            </div>
            <div style="word-break: break-all; font-family: monospace; font-size: 0.85em; margin-top: 5px;">${msg}</div>
        </div>
    `;
}


