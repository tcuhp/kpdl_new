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
    document.getElementById('sw-upload').classList.toggle('active', !isCamera);
    document.getElementById('sw-camera').classList.toggle('active', isCamera);
    document.getElementById('upload-panel').style.display = isCamera ? 'none' : 'block';
    document.getElementById('camera-panel').style.display = isCamera ? 'block' : 'none';
    if (!isCamera && cameraStream) { stopCamera(); }
    resetAnalyzeBtn();
}

// ── Upload ───────────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag');
    if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; handleFileSelect(); }
});
fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect() {
    const file = fileInput.files[0];
    if (!file) return;
    capturedBlob = null;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        document.getElementById('preview-img').src = e.target.result;
        document.getElementById('preview-img').style.display = 'block';
        document.getElementById('preview-name').textContent = file.name;
        document.getElementById('preview-name').style.display = 'block';
        document.getElementById('upload-placeholder').style.display = 'none';
        dropZone.classList.add('has-image');
        resetResult();
        document.getElementById('btn-analyze').disabled = false;
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
        video.srcObject = cameraStream;
        document.getElementById('camera-start-btn').style.display = 'none';
        document.getElementById('camera-live').style.display = 'block';
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
        capturedBlob = blob;
        selectedFile = null;
        const url = URL.createObjectURL(blob);
        document.getElementById('captured-img').src = url;
        document.getElementById('captured-preview').style.display = 'block';
        document.getElementById('camera-live').style.display = 'none';
        stopCamera();
        resetResult();
        document.getElementById('btn-analyze').disabled = false;
    }, 'image/jpeg', 0.92);
}

function retakePhoto() {
    capturedBlob = null;
    document.getElementById('captured-preview').style.display = 'none';
    document.getElementById('btn-analyze').disabled = true;
    startCamera();
}

// ── Analysis ─────────────────────────────────────────────────────────
async function runAnalysis() {
    const file = capturedBlob || selectedFile;
    if (!file) return;
    setLoading('btn-analyze', 'spinner', 'btn-icon', 'btn-text', true, 'Đang phân tích...');
    document.getElementById('error-box').style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('file', file, capturedBlob ? 'capture.jpg' : selectedFile.name);
        const resp = await fetch('/predict', { method: 'POST', body: formData });
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
    document.getElementById('result-dot').style.background = result.color;
    const lbl = document.getElementById('result-label');
    lbl.textContent = result.label; lbl.style.color = result.color;
    const cv = document.getElementById('conf-val');
    cv.textContent = roundToThree(result.confidence) + '%'; cv.style.color = result.color;
    const fill = document.getElementById('bar-fill');
    fill.style.background = result.color; fill.style.width = '0%';
    document.getElementById('result-desc').innerHTML = result.description;
    document.getElementById('result-desc').style.borderLeftColor = result.color;

    const shortNames = { 'Potato___Early_blight': 'Đốm Vòng', 'Potato___Late_blight': 'Mốc Sương', 'Potato___healthy': 'Khỏe Mạnh' };
    const pColors = { 'Potato___Early_blight': '#e65100', 'Potato___Late_blight': '#b71c1c', 'Potato___healthy': '#2e7d32' };
    document.getElementById('all-probs').innerHTML = Object.entries(result.all_probs).map(([cls, val]) =>
        `<div class="prob-row">
      <span class="prob-name">${shortNames[cls] || cls}</span>
      <div class="prob-track"><div class="prob-fill" style="background:${pColors[cls]};width:0%" data-val="${val}"></div></div>
      <span class="prob-val">${roundToThree(val)}%</span>
    </div>`).join('');

    card.style.display = 'block';
    setTimeout(() => {
        fill.style.width = result.confidence + '%';
        document.querySelectorAll('.prob-fill').forEach(f => f.style.width = f.dataset.val + '%');
    }, 60);
    showTreatment(result.treatment);
}

function showTreatment(t) {
    if (!t || !t.severity) return;
    const panel = document.getElementById('treatment-panel');
    const badge = document.getElementById('sev-badge');
    badge.textContent = t.severity; badge.style.color = t.severity_color; badge.style.borderColor = t.severity_color; badge.style.backgroundColor = t.severity_color + '1a';
    const makeList = items => items.length
        ? `<ul class="t-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
        : '<p style="font-size:13px;color:var(--text-2)">Không cần thiết.</p>';
    document.getElementById('treatment-body').innerHTML = `
    <div class="t-section"><div class="t-section-title">⏱ Thời điểm xử lý</div><div class="timing-box">${t.timing}</div></div>
    <div class="t-section"><div class="t-section-title">🛡 Phòng ngừa</div>${makeList(t.prevention)}</div>
    ${t.chemical.length ? `<div class="t-section"><div class="t-section-title">🧪 Thuốc hóa học</div>${makeList(t.chemical)}</div>` : ''}
    <div class="t-section"><div class="t-section-title">🌿 Sinh học</div>${makeList(t.biological)}</div>`;
    panel.style.display = 'block';
}

function toggleTreatment() {
    document.getElementById('treatment-body').classList.toggle('open');
    document.getElementById('chevron').classList.toggle('open');
}

function resetResult() {
    document.getElementById('result-card').style.display = 'none';
    document.getElementById('treatment-panel').style.display = 'none';
    document.getElementById('error-box').style.display = 'none';
}

function resetAnalyzeBtn() {
    document.getElementById('btn-analyze').disabled = true;
    document.getElementById('btn-text').textContent = 'Phân tích bệnh';
}

// ── Multi Compare ────────────────────────────────────────────────────
document.getElementById('multi-input').addEventListener('change', function () {
    multiFiles = Array.from(this.files);
    const grid = document.getElementById('multi-preview-grid');
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
    document.getElementById('btn-compare').style.display = multiFiles.length >= 2 ? 'flex' : 'none';
    document.getElementById('compare-grid').innerHTML = '';
});

async function runCompare() {
    if (multiFiles.length < 2) return;
    setLoading('btn-compare', 'compare-spinner', 'compare-icon', 'compare-text', true, 'Đang phân tích...');
    document.getElementById('compare-error').style.display = 'none';
    document.getElementById('compare-grid').innerHTML = '';
    try {
        const fd = new FormData();
        multiFiles.forEach(f => fd.append('files[]', f));
        const resp = await fetch('/predict', { method: 'POST', body: fd });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.error) { showError('compare-error', data.error); return; }
        const grid = document.getElementById('compare-grid');
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
            grid.appendChild(div);
        });
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
    if (diagnosisContext) {
        banner.style.display = 'flex';
        banner.classList.add('has-ctx');
    }
}

function sendQuick(btn) {
    document.getElementById('chat-input').value = btn.textContent;
    sendChat();
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = ''; input.style.height = 'auto';

    addChatMsg('user', msg);
    chatHistory.push({ role: 'user', text: msg });

    // Hide quick questions after first use
    document.getElementById('quick-questions').style.display = 'none';

    const typingId = addTyping();
    document.getElementById('btn-send').disabled = true;

    try {
        const resp = await fetch('/chat', {
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
        document.getElementById('btn-send').disabled = false;
    }
}

function addChatMsg(role, text) {
    const msgs = document.getElementById('chat-messages');
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
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ── Helpers ──────────────────────────────────────────────────────────
function setLoading(btnId, spinnerId, iconId, textId, loading, text) {
    document.getElementById(btnId).disabled = loading;
    document.getElementById(spinnerId).style.display = loading ? 'block' : 'none';
    document.getElementById(iconId).style.display = loading ? 'none' : 'block';
    document.getElementById(textId).textContent = text;
}

function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = '❌ ' + msg;
    el.style.display = 'block';
}

function roundToThree(num) {
    return +(Math.round(num + "e+3") + "e-3");
}