import tensorflow as tf
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from PIL import Image
import numpy as np
import os
import google.generativeai as genai

# ── Cấu hình ────────────────────────────────────────────────────────
IMAGE_SIZE = 256
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "potato_disease_model.keras")
CLASS_NAMES = ['Potato___Early_blight', 'Potato___Late_blight', 'Potato___healthy']

# ── Gemini SDK ───────────────────────────────────────────────────────
GEMINI_API_KEY = "AIzaSyB7yvT1m9MtlaS5-EF6e1eEfyAVjpsP0RI"
genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL_NAME = "gemini-2.5-flash"

GEMINI_SYSTEM_PROMPT = """Bạn là một chuyên gia nông nghiệp và bệnh học thực vật, chuyên về cây khoai tây và các loại cây trồng nông nghiệp.

Bạn hỗ trợ nông dân và người dùng với:
- Chẩn đoán và giải thích các bệnh trên lá khoai tây (Early Blight, Late Blight)
- Hướng dẫn phòng ngừa và điều trị bệnh cây
- Tư vấn chăm sóc, tưới tiêu, bón phân cho cây trồng
- Giải thích kết quả phân tích AI
- Các vấn đề thực vật học nói chung

Phong cách trả lời:
- Ngắn gọn, thực tế, dễ hiểu cho nông dân
- Dùng tiếng Việt
- Khi cần thiết, dùng gạch đầu dòng để liệt kê
- Nếu câu hỏi ngoài phạm vi nông nghiệp/thực vật, lịch sự từ chối và gợi ý câu hỏi phù hợp hơn"""

DISPLAY_LABELS = {
    'Potato___Early_blight': '🥔 Bệnh Đốm Vòng (Early Blight)',
    'Potato___Late_blight':  '🥔 Bệnh Mốc Sương (Late Blight)',
    'Potato___healthy':      '🥔 Lá Khỏe Mạnh (Healthy)',
}

DESCRIPTIONS = {
    'Potato___Early_blight': (
        "<b>Bệnh Đốm Vòng (Early Blight)</b> do nấm <i>Alternaria solani</i> gây ra. "
        "Triệu chứng: Xuất hiện các đốm nâu đen hình tròn đồng tâm trên lá, "
        "thường bắt đầu từ lá già. Bệnh nặng có thể làm rụng lá và giảm năng suất."
    ),
    'Potato___Late_blight': (
        "<b>Bệnh Mốc Sương (Late Blight)</b> do nấm <i>Phytophthora infestans</i> gây ra. "
        "Triệu chứng: Các vết bệnh lớn, màu nâu tối đến đen, lan nhanh trên lá và thân. "
        "Đây là bệnh rất nguy hiểm, có thể gây thiệt hại nghiêm trọng cho vụ mùa."
    ),
    'Potato___healthy': (
        "<b>Lá Khỏe Mạnh (Healthy)</b> – Lá khoai tây không có dấu hiệu bệnh. "
        "Lá xanh tươi, phát triển bình thường. Tiếp tục chăm sóc tốt để duy trì sức khỏe cây trồng!"
    ),
}

TREATMENTS = {
    'Potato___Early_blight': {
        'severity': 'Trung bình',
        'severity_color': '#e65100',
        'prevention': [
            'Luân canh cây trồng, không trồng khoai tây liên tiếp trên cùng mảnh đất',
            'Thu dọn tàn dư cây bệnh sau thu hoạch',
            'Trồng các giống khoai tây kháng bệnh',
            'Tưới nước vào buổi sáng để lá khô trước tối',
        ],
        'chemical': [
            'Mancozeb 80WP (0.25%) – phun định kỳ 7–10 ngày/lần',
            'Chlorothalonil – hiệu quả phòng ngừa cao',
            'Iprodione – phun khi bệnh mới xuất hiện',
        ],
        'biological': [
            'Bacillus subtilis – chế phẩm sinh học phòng nấm',
            'Trichoderma viride – xử lý đất trước khi trồng',
        ],
        'timing': 'Phun phòng trước khi bệnh xuất hiện hoặc ngay khi thấy triệu chứng đầu tiên.',
    },
    'Potato___Late_blight': {
        'severity': 'Rất nguy hiểm',
        'severity_color': '#b71c1c',
        'prevention': [
            'Sử dụng củ giống sạch bệnh, đã được kiểm dịch',
            'Tránh tưới nước quá nhiều, đảm bảo thoát nước tốt',
            'Không trồng dày, đảm bảo thông thoáng giữa các cây',
            'Theo dõi dự báo thời tiết, phun phòng trước khi trời ẩm nhiều ngày',
        ],
        'chemical': [
            'Metalaxyl + Mancozeb (Ridomil Gold) – rất hiệu quả',
            'Dimethomorph (Acrobat) – phun luân phiên tránh kháng thuốc',
            'Cymoxanil + Famoxadone (Tanos) – phun khi bệnh lây lan nhanh',
        ],
        'biological': [
            'Phosphorous acid – kích hoạt kháng bệnh tự nhiên của cây',
            'Chế phẩm đồng hydroxide – phun phòng trước mùa mưa',
        ],
        'timing': '⚠️ Hành động ngay! Bệnh lây lan rất nhanh trong điều kiện ẩm ướt. Phun thuốc trong vòng 24–48 giờ.',
    },
    'Potato___healthy': {
        'severity': 'Khỏe mạnh',
        'severity_color': '#2e7d32',
        'prevention': [
            'Bón phân cân đối NPK theo từng giai đoạn phát triển',
            'Tưới nước đều đặn, tránh để đất quá khô hoặc quá ướt',
            'Kiểm tra lá thường xuyên để phát hiện sớm dấu hiệu bệnh',
            'Phun phòng định kỳ thuốc bảo vệ thực vật vào đầu mùa mưa',
        ],
        'chemical': [],
        'biological': [
            'Bón phân hữu cơ vi sinh để tăng sức đề kháng',
            'Chế phẩm Trichoderma xử lý đất định kỳ',
        ],
        'timing': 'Tiếp tục duy trì chế độ chăm sóc hiện tại và theo dõi định kỳ.',
    },
}

TEMPLATE_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "frontend")
STATIC_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "frontend")
app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
CORS(app)
model = None


def load_model():
    global model
    if model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Không tìm thấy mô hình tại {MODEL_PATH}")
        model = tf.keras.models.load_model(MODEL_PATH)
    return model


def preprocess_image(image: Image.Image) -> np.ndarray:
    image = image.resize((IMAGE_SIZE, IMAGE_SIZE))
    img_array = tf.keras.preprocessing.image.img_to_array(image)
    img_array = np.expand_dims(img_array, axis=0)
    return img_array


def run_predict(img_array: np.ndarray):
    m = load_model()
    predictions = m.predict(img_array, verbose=0)
    predicted_class = CLASS_NAMES[np.argmax(predictions[0])]
    confidence = float(round(100 * np.max(predictions[0]), 2))
    all_probs = {CLASS_NAMES[i]: float(round(100 * predictions[0][i], 2)) for i in range(len(CLASS_NAMES))}
    return predicted_class, confidence, all_probs


def build_result(predicted_class, confidence, all_probs, filename=None):
    label = DISPLAY_LABELS.get(predicted_class, predicted_class)
    description = DESCRIPTIONS.get(predicted_class, "")
    treatment = TREATMENTS.get(predicted_class, {})
    color_map = {
        'Potato___healthy': '#2e7d32',
        'Potato___Early_blight': '#e65100',
        'Potato___Late_blight': '#b71c1c',
    }
    color = color_map.get(predicted_class, '#555')
    res = {
        'predicted_class': predicted_class,
        'label': label,
        'confidence': confidence,
        'description': description,
        'color': color,
        'all_probs': all_probs,
        'treatment': treatment,
    }
    if filename:
        res['filename'] = filename
    return res


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/page-analyze.html')
def page_analyze():
    return render_template('page-analyze.html')


@app.route('/page-chat.html')
def page_chat():
    return render_template('page-chat.html')


@app.route('/page-library.html')
def page_library():
    return render_template('page-library.html')


@app.route('/predict', methods=['POST'])
def predict_api():
    # Nhiều ảnh
    if 'files[]' in request.files:
        files = request.files.getlist('files[]')
        results = []
        for f in files:
            try:
                image = Image.open(f.stream).convert('RGB')
                img_array = preprocess_image(image)
                predicted_class, confidence, all_probs = run_predict(img_array)
                results.append(build_result(predicted_class, confidence, all_probs, f.filename))
            except Exception as e:
                results.append({'filename': f.filename, 'error': str(e)})
        return jsonify({'batch': results})

    # Một ảnh
    if 'file' not in request.files:
        return jsonify({'error': 'Không có file'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Không chọn file'}), 400
    try:
        image = Image.open(file.stream).convert('RGB')
        img_array = preprocess_image(image)
        predicted_class, confidence, all_probs = run_predict(img_array)
        return jsonify(build_result(predicted_class, confidence, all_probs))
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/chat', methods=['POST'])
def chat_api():
    """
    Gemini chat endpoint dùng google-generativeai SDK.
    Body JSON: { "message": "...", "history": [...], "diagnosis_context": "..." }
    """
    data = request.get_json(force=True)
    user_message     = data.get('message', '').strip()
    history          = data.get('history', [])
    diagnosis_context = data.get('diagnosis_context', '')

    if not user_message:
        return jsonify({'error': 'Tin nhắn trống'}), 400

    try:
        # Ghép system prompt + context chẩn đoán
        system_text = GEMINI_SYSTEM_PROMPT
        if diagnosis_context:
            system_text += f"\n\nKết quả phân tích AI vừa thực hiện:\n{diagnosis_context}"

        # Khởi tạo model với system instruction
        gemini = genai.GenerativeModel(
            model_name=GEMINI_MODEL_NAME,
            system_instruction=system_text,
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=1024,
            )
        )

        # Chuyển lịch sử sang định dạng SDK
        sdk_history = []
        for h in history[-10:]:
            role = "user" if h['role'] == 'user' else "model"
            sdk_history.append({"role": role, "parts": [h['text']]})

        # Bắt đầu chat session với lịch sử
        chat = gemini.start_chat(history=sdk_history)

        # Gửi tin nhắn
        response = chat.send_message(user_message)
        reply = response.text

        return jsonify({'reply': reply})

    except Exception as e:
        print(f"[Gemini EXCEPTION] {type(e).__name__}: {e}")
        return jsonify({'error': f'Lỗi Gemini: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)