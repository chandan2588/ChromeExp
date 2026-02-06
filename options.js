// Default Settings
const defaultSettings = {
  provider: 'ollama',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3',
  groqKey: '',
  groqModel: 'llama3-8b-8192',
  geminiKey: '',
  geminiModel: 'gemini-1.5-flash-latest'
};

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();

  // Bind Form Submit
  const form = document.getElementById('settings-form');
  if (form) {
    form.addEventListener('submit', saveOptions);
  }

  // Bind Radio Changes
  const providerRadios = document.querySelectorAll('input[name="provider"]');
  providerRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      toggleConfigVisibility(e.target.value);
    });
  });
  // Bind Gemini Check Button
  const geminiBtn = document.getElementById('check-gemini-btn');
  if (geminiBtn) geminiBtn.addEventListener('click', checkGeminiModels);

  // Bind Ollama Check Button
  const ollamaBtn = document.getElementById('check-ollama-btn');
  if (ollamaBtn) ollamaBtn.addEventListener('click', checkOllamaModels);

  // Bind Groq Check Button
  const groqBtn = document.getElementById('check-groq-btn');
  if (groqBtn) groqBtn.addEventListener('click', checkGroqModels);

  // Bind OpenAI Check Button
  const openaiBtn = document.getElementById('check-openai-btn');
  if (openaiBtn) openaiBtn.addEventListener('click', checkOpenAIModels);
});

// --- Model Checkers ---

async function checkOllamaModels() {
  const url = document.getElementById('ollamaUrl').value.replace(/\/$/, '');
  const statusSpan = document.getElementById('ollama-status');
  updateStatus(statusSpan, 'Fetching models...');

  try {
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) throw new Error('Failed to connect to Ollama.');

    const data = await response.json();
    const models = data.models.map(m => m.name);

    updateDatalist('ollama_models', models);
    updateStatus(statusSpan, `Found ${models.length} models!`, 'success');
    document.getElementById('ollamaModel').focus();
  } catch (err) {
    updateStatus(statusSpan, `Error: ${err.message}`, 'error');
  }
}

async function checkGroqModels() {
  const apiKey = document.getElementById('groqKey').value.trim();
  const statusSpan = document.getElementById('groq-status');

  if (!apiKey) return updateStatus(statusSpan, 'Enter API Key first.', 'error');
  updateStatus(statusSpan, 'Fetching models...');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error('Failed to fetch from Groq.');

    const data = await response.json();
    const models = data.data.map(m => m.id);

    updateDatalist('groq_models', models);
    updateStatus(statusSpan, `Found ${models.length} models!`, 'success');
    document.getElementById('groqModel').focus();
  } catch (err) {
    updateStatus(statusSpan, `Error: ${err.message}`, 'error');
  }
}

async function checkOpenAIModels() {
  const apiKey = document.getElementById('openaiKey').value.trim();
  const statusSpan = document.getElementById('openai-status');

  if (!apiKey) return updateStatus(statusSpan, 'Enter API Key first.', 'error');
  updateStatus(statusSpan, 'Fetching models...');

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!response.ok) throw new Error('Failed to fetch from OpenAI.');

    const data = await response.json();
    const models = data.data
      .filter(m => m.id.includes('gpt')) // Filter mostly for GPT models
      .map(m => m.id)
      .sort();

    updateDatalist('openai_models', models);
    updateStatus(statusSpan, `Found ${models.length} GPT models!`, 'success');
    document.getElementById('openaiModel').focus();
  } catch (err) {
    updateStatus(statusSpan, `Error: ${err.message}`, 'error');
  }
}

async function checkGeminiModels() {
  const apiKey = document.getElementById('geminiKey').value.trim();
  const statusSpan = document.getElementById('gemini-status');

  if (!apiKey) return updateStatus(statusSpan, 'Enter API Key first.', 'error');
  updateStatus(statusSpan, 'Fetching models...');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) throw new Error('Failed to fetch from Gemini.');

    const data = await response.json();
    if (data.models) {
      const models = data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));

      updateDatalist('gemini_models', models);
      updateStatus(statusSpan, `Found ${models.length} models!`, 'success');
      document.getElementById('geminiModel').focus();
    } else {
      updateStatus(statusSpan, 'No models found.', 'error');
    }
  } catch (err) {
    updateStatus(statusSpan, `Error: ${err.message}`, 'error');
  }
}

// Helper Utilities
function updateStatus(element, text, type = 'normal') {
  element.innerHTML = text;
  if (type === 'error') element.style.color = 'var(--error-color)';
  else if (type === 'success') {
    element.innerHTML = `${text} <span style="color:var(--success-color)">List updated.</span>`;
    element.style.color = 'var(--text-primary)';
  }
  else element.style.color = 'var(--text-secondary)';
}

function updateDatalist(id, items) {
  const list = document.getElementById(id);
  list.innerHTML = '';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item;
    list.appendChild(opt);
  });
}

function toggleConfigVisibility(activeProvider) {
  const configSections = document.querySelectorAll('.config-section');
  configSections.forEach(section => {
    section.style.display = 'none';
  });

  const activeSection = document.getElementById(`conf-${activeProvider}`);
  if (activeSection) {
    activeSection.style.display = 'block';
  }
}

function restoreOptions() {
  chrome.storage.sync.get(defaultSettings, (items) => {
    // Set Provider Radio
    const radio = document.querySelector(`input[name="provider"][value="${items.provider}"]`);
    if (radio) {
      radio.checked = true;
      toggleConfigVisibility(items.provider);
    }

    // Helper to safely set value
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('openaiKey', items.openaiKey);
    setVal('openaiModel', items.openaiModel);
    setVal('ollamaUrl', items.ollamaUrl);
    setVal('ollamaModel', items.ollamaModel);
    setVal('groqKey', items.groqKey);
    setVal('groqModel', items.groqModel);
    setVal('geminiKey', items.geminiKey);
    setVal('geminiModel', items.geminiModel);
  });
}

function saveOptions(e) {
  e.preventDefault();

  const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

  const selectedRadio = document.querySelector('input[name="provider"]:checked');
  const selectedProvider = selectedRadio ? selectedRadio.value : 'ollama';

  const settings = {
    provider: selectedProvider,
    openaiKey: getVal('openaiKey'),
    openaiModel: getVal('openaiModel'),
    ollamaUrl: getVal('ollamaUrl'),
    ollamaModel: getVal('ollamaModel'),
    groqKey: getVal('groqKey'),
    groqModel: getVal('groqModel'),
    geminiKey: getVal('geminiKey'),
    geminiModel: getVal('geminiModel')
  };

  chrome.storage.sync.set(settings, () => {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = 'Settings Saved Successfully!';
    statusDiv.className = 'status-msg status-success';
    statusDiv.style.display = 'block';

    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 2000);
  });
}
