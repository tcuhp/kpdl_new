// ── Global state ─────────────────────────────────────────────────────
let selectedFile = null;
let capturedBlob = null;
let multiFiles = [];
let chatHistory = [];
let diagnosisContext = '';
let cameraStream = null;
let facingMode = 'environment';

// ── Page Navigation ──────────────────────────────────────────────────
function switchPage(name) {
    ['analyze', 'library', 'chat'].forEach(n => {
        document.getElementById('page-' + n).classList.toggle('active', n === name);
        document.getElementById('nav-' + n).classList.toggle('active', n === name);
    });
}

// ── Input Switcher (Upload / Camera) ────────────────────────────────
function switchInput(mode) {
    const isCamera = mode === 'camera';
    const swUpload = document.getElementById('sw-upload');
    const swCamera = document.getElementById('sw-camera');
    const uploadPanel = document.getElementById('upload-panel');
    const cameraPanel = document.getElementById('camera-panel');
    if (swUpload) swUpload.classList.toggle('active', !isCamera);
    if (swCamera) swCamera.classList.toggle('active', isCamera);
    if (uploadPanel) uploadPanel.style.display = isCamera ? 'none' : 'block';
    if (cameraPanel) cameraPanel.style.display = isCamera ? 'block' : 'none';
    if (!isCamera && cameraStream) { stopCamera(); }
    resetAnalyzeBtn();
}

// ── Upload ───────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('drag');
        if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; handleFileSelect(); }
    });
}
if (fileInput) fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect() {
    const file = fileInput.files[0];
    if (!file) return;
    capturedBlob = null;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        const previewImg = document.getElementById('preview-img');
        const previewName = document.getElementById('preview-name');
        const uploadPlaceholder = document.getElementById('upload-placeholder');
        if (previewImg) {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
        }
        if (previewName) {
            previewName.textContent = file.name;
            previewName.style.display = 'block';
        }
        if (uploadPlaceholder) uploadPlaceholder.style.display = 'none';
        if (dropZone) dropZone.classList.add('has-image');
        resetResult();
        const btnAnalyze = document.getElementById('btn-analyze');
        if (btnAnalyze) btnAnalyze.disabled = false;
    };
    reader.readAsDataURL(file);
}

// ── Camera ───────────────────────────────────────────────────────────
async function startCamera() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const video = document.getElementById('camera-video');
        const startBtn = document.getElementById('camera-start-btn');
        const live = document.getElementById('camera-live');
        if (video) video.srcObject = cameraStream;
        if (startBtn) startBtn.style.display = 'none';
        if (live) live.style.display = 'block';
    } catch (e) {
        alert('Không thể mở camera: ' + e.message);
    }
}

function stopCamera() {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
}

async function flipCamera() {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    stopCamera();
    await startCamera();
}

function capturePhoto() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('camera-canvas');
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
        capturedBlob = blob;
        selectedFile = null;
        const url = URL.createObjectURL(blob);
        const capturedImg = document.getElementById('captured-img');
        const capturedPreview = document.getElementById('captured-preview');
        const cameraLive = document.getElementById('camera-live');
        const btnAnalyze = document.getElementById('btn-analyze');
        if (capturedImg) capturedImg.src = url;
        if (capturedPreview) capturedPreview.style.display = 'block';
        if (cameraLive) cameraLive.style.display = 'none';
        stopCamera();
        resetResult();
        if (btnAnalyze) btnAnalyze.disabled = false;
    }, 'image/jpeg', 0.92);
}

function retakePhoto() {
    capturedBlob = null;
    const capturedPreview = document.getElementById('captured-preview');
    const btnAnalyze = document.getElementById('btn-analyze');
    if (capturedPreview) capturedPreview.style.display = 'none';
    if (btnAnalyze) btnAnalyze.disabled = true;
    startCamera();
}

// ── Analysis ─────────────────────────────────────────────────────────
async function runAnalysis() {
    const file = capturedBlob || selectedFile;
    if (!file) return;
    setLoading('btn-analyze', 'spinner', 'btn-icon', 'btn-text', true, 'Đang phân tích...');
    const errorBox = document.getElementById('error-box');
    if (errorBox) errorBox.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('file', file, capturedBlob ? 'capture.jpg' : selectedFile.name);
        const resp = await fetch('http://localhost:5000/predict', { method: 'POST', body: formData });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const result = await resp.json();
        if (result.error) { showError('error-box', result.error); return; }
        showResult(result);
        // Save context for AI chat
        diagnosisContext = `Bệnh phát hiện: ${result.label}\nĐộ tin cậy: ${result.confidence}%\nMô tả: ${result.description.replace(/<[^>]+>/g, '')}`;
        updateContextBanner();
    } catch (e) {
        showError('error-box', 'Lỗi phân tích: ' + e.message);
    } finally {
        setLoading('btn-analyze', 'spinner', 'btn-icon', 'btn-text', false, 'Phân tích lại');
    }
}

function showResult(result) {
    const card = document.getElementById('result-card');
    if (!card) return;
    const resultDot = document.getElementById('result-dot');
    const resultLabel = document.getElementById('result-label');
    const confVal = document.getElementById('conf-val');
    const barFill = document.getElementById('bar-fill');
    const resultDesc = document.getElementById('result-desc');
    const allProbs = document.getElementById('all-probs');

    if (resultDot) resultDot.style.background = result.color;
    if (resultLabel) {
        resultLabel.textContent = result.label;
        resultLabel.style.color = result.color;
    }
    if (confVal) {
        confVal.textContent = roundToThree(result.confidence) + '%';
        confVal.style.color = result.color;
    }
    if (barFill) {
        barFill.style.background = result.color;
        barFill.style.width = '0%';
    }
    if (resultDesc) {
        resultDesc.innerHTML = result.description;
        resultDesc.style.borderLeftColor = result.color;
    }

    const shortNames = { 'Potato___Early_blight': 'Đốm Vòng', 'Potato___Late_blight': 'Mốc Sương', 'Potato___healthy': 'Khỏe Mạnh' };
    const pColors = { 'Potato___Early_blight': '#e65100', 'Potato___Late_blight': '#b71c1c', 'Potato___healthy': '#2e7d32' };
    if (allProbs) {
        allProbs.innerHTML = Object.entries(result.all_probs).map(([cls, val]) =>
            `<div class="prob-row">
      <span class="prob-name">${shortNames[cls] || cls}</span>
      <div class="prob-track"><div class="prob-fill" style="background:${pColors[cls]};width:0%" data-val="${val}"></div></div>
      <span class="prob-val">${roundToThree(val)}%</span>
    </div>`).join('');
    }

    card.style.display = 'block';
    setTimeout(() => {
        if (barFill) barFill.style.width = result.confidence + '%';
        document.querySelectorAll('.prob-fill').forEach(f => { if (f) f.style.width = f.dataset.val + '%'; });
    }, 60);
    showTreatment(result.treatment);
}

function showTreatment(t) {
    if (!t || !t.severity) return;
    const panel = document.getElementById('treatment-panel');
    if (!panel) return;
    const badge = document.getElementById('sev-badge');
    const treatmentBody = document.getElementById('treatment-body');

    if (badge) {
        badge.textContent = t.severity;
        badge.style.color = t.severity_color;
        badge.style.borderColor = t.severity_color;
        badge.style.backgroundColor = t.severity_color + '1a';
    }
    const makeList = items => items.length
        ? `<ul class="t-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : '<p style="font-size:13px;color:var(--text-2)">Không cần thiết.</p>';
    if (treatmentBody) {
        treatmentBody.innerHTML = `
    <div class="t-section"><div class="t-section-title">⏱ Thời điểm xử lý</div><div class="timing-box">${t.timing}</div></div>
    <div class="t-section"><div class="t-section-title">🛡 Phòng ngừa</div>${makeList(t.prevention)}</div>
    ${t.chemical.length ? `<div class="t-section"><div class="t-section-title">🧪 Thuốc hóa học</div>${makeList(t.chemical)}</div>` : ''}
    <div class="t-section"><div class="t-section-title">🌿 Sinh học</div>${makeList(t.biological)}</div>`;
    }
    panel.style.display = 'block';
}

function toggleTreatment() {
    const treatmentBody = document.getElementById('treatment-body');
    const chevron = document.getElementById('chevron');
    if (treatmentBody) treatmentBody.classList.toggle('open');
    if (chevron) chevron.classList.toggle('open');
}

function resetResult() {
    const resultCard = document.getElementById('result-card');
    const treatmentPanel = document.getElementById('treatment-panel');
    const errorBox = document.getElementById('error-box');
    if (resultCard) resultCard.style.display = 'none';
    if (treatmentPanel) treatmentPanel.style.display = 'none';
    if (errorBox) errorBox.style.display = 'none';
}

function resetAnalyzeBtn() {
    const btn = document.getElementById('btn-analyze');
    const txt = document.getElementById('btn-text');
    if (btn) btn.disabled = true;
    if (txt) txt.textContent = 'Phân tích bệnh';
}

// ── Multi Compare ────────────────────────────────────────────────────
const multiInput = document.getElementById('multi-input');
if (multiInput) {
    multiInput.addEventListener('change', function () {
        multiFiles = Array.from(this.files);
        const grid = document.getElementById('multi-preview-grid');
        if (!grid) return;
        grid.innerHTML = '';
        multiFiles.forEach(f => {
            const reader = new FileReader();
            reader.onload = e => {
                const div = document.createElement('div'); div.className = 'multi-item';
                div.innerHTML = `<img src="${e.target.result}"><div class="multi-item-name">${f.name}</div>`;
                grid.appendChild(div);
            };
            reader.readAsDataURL(f);
        });
        const btnCompare = document.getElementById('btn-compare');
        if (btnCompare) btnCompare.style.display = multiFiles.length >= 2 ? 'flex' : 'none';
        const compareGrid = document.getElementById('compare-grid');
        if (compareGrid) compareGrid.innerHTML = '';
    });
}

async function runCompare() {
    if (multiFiles.length < 2) return;
    setLoading('btn-compare', 'compare-spinner', 'compare-icon', 'compare-text', true, 'Đang phân tích...');
    const compareError = document.getElementById('compare-error');
    if (compareError) compareError.style.display = 'none';
    const compareGrid = document.getElementById('compare-grid');
    if (compareGrid) compareGrid.innerHTML = '';
    try {
        const fd = new FormData();
        multiFiles.forEach(f => fd.append('files[]', f));
        const resp = await fetch('/predict', { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.error) { showError('compare-error', data.error); return; }
        if (compareGrid) {
            data.batch.forEach((r, i) => {
                const url = URL.createObjectURL(multiFiles[i]);
                const div = document.createElement('div'); div.className = 'compare-card';
                if (r.error) {
                    div.innerHTML = `<div style="padding:0.75rem;font-size:12px;color:#c62828;">❌ ${r.error}</div>`;
                } else {
                    div.innerHTML = `<img src="${url}"><div class="compare-card-body">
          <div class="compare-card-label" style="color:${r.color}">${r.label}</div>
          <div style="font-size:11.5px;color:var(--text-2)">Tin cậy: <b style="color:${r.color}">${roundToThree(r.confidence)}%</b></div>
          <div class="compare-mini-bar" style="background:${r.color};width:${r.confidence}%"></div>
          <div class="compare-filename">${r.filename}</div>
        </div>`;
                }
                compareGrid.appendChild(div);
            });
        }
    } catch (e) {
        showError('compare-error', 'Lỗi: ' + e.message);
    } finally {
        setLoading('btn-compare', 'compare-spinner', 'compare-icon', 'compare-text', false, 'So sánh lại');
    }
}

// ── Disease Library ──────────────────────────────────────────────────
function toggleDisease(id) {
    const body = document.getElementById('disease-' + id);
    body.classList.toggle('open');
}

// ── AI Chat ──────────────────────────────────────────────────────────
function updateContextBanner() {
    const banner = document.getElementById('context-banner');
    if (banner) {
        if (diagnosisContext) {
            banner.style.display = 'flex';
            banner.classList.add('has-ctx');
        }
    }
}

function sendQuick(btn) {
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = btn.textContent;
        sendChat();
    }
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;
    input.value = ''; input.style.height = 'auto';

    addChatMsg('user', msg);
    chatHistory.push({ role: 'user', text: msg });

    // Hide quick questions after first use
    const quickQuestions = document.getElementById('quick-questions');
    if (quickQuestions) quickQuestions.style.display = 'none';

    const typingId = addTyping();
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = true;

    try {
        const resp = await fetch('http://localhost:5000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, history: chatHistory.slice(-10), diagnosis_context: diagnosisContext })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        removeTyping(typingId);
        if (data.error) {
            addChatMsg('bot', '❌ ' + data.error);
        } else {
            addChatMsg('bot', data.reply);
            chatHistory.push({ role: 'bot', text: data.reply });
        }
    } catch (e) {
        removeTyping(typingId);
        addChatMsg('bot', '❌ Lỗi kết nối: ' + e.message);
    } finally {
        if (btnSend) btnSend.disabled = false;
    }
}

function addChatMsg(role, text) {
    const msgs = document.getElementById('chat-messages');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    const icon = role === 'bot' ? '🌿' : '👤';
    // Simple markdown: bold, bullets
    let html = text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/^[•\-] (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
        .replace(/\n/g, '<br>');
    div.innerHTML = `
    <div class="chat-avatar">${icon}</div>
    <div class="chat-bubble">${html}</div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
}

function addTyping() {
    const msgs = document.getElementById('chat-messages');
    if (!msgs) return null;
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'chat-msg bot'; div.id = id;
    div.innerHTML = `<div class="chat-avatar">🌿</div>
    <div class="chat-bubble"><div class="chat-bubble-typing">
      <div class="dot-typing"></div><div class="dot-typing"></div><div class="dot-typing"></div>
    </div></div>`;
    msgs.appendChild(div); msgs.scrollTop = msgs.scrollHeight;
    return id;
}

function removeTyping(id) {
    if (id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
}

// ── Helpers ──────────────────────────────────────────────────────────
function setLoading(btnId, spinnerId, iconId, textId, loading, text) {
    const btn = document.getElementById(btnId);
    const spinner = document.getElementById(spinnerId);
    const icon = document.getElementById(iconId);
    const txt = document.getElementById(textId);
    if (btn) btn.disabled = loading;
    if (spinner) spinner.style.display = loading ? 'block' : 'none';
    if (icon) icon.style.display = loading ? 'none' : 'block';
    if (txt) txt.textContent = text;
}

function showError(id, msg) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = '❌ ' + msg;
        el.style.display = 'block';
    }
}

function roundToThree(num) {
    return +(Math.round(num + "e+3") + "e-3");
}