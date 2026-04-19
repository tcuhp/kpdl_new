"""
Script train model phân loại bệnh lá khoai tây
Được tạo tự động từ model.ipynb
"""

import os
import gc
import numpy as np
import tensorflow as tf
from tensorflow.keras import models, layers

# ===================== CẤU HÌNH =====================
IMAGE_SIZE = 256
BATCH_SIZE = 32
EPOCH = 30
CHANNELS = 3
DATASET_DIR = "Dataset"
MODEL_SAVE_PATH = os.path.join("backend", "potato_disease_model.keras")

# ===================== TẢI DATASET =====================
print("=" * 60)
print("BƯỚC 1: Tải dataset...")
print("=" * 60)

dataset = tf.keras.preprocessing.image_dataset_from_directory(
    DATASET_DIR,
    shuffle=True,
    image_size=(IMAGE_SIZE, IMAGE_SIZE),
    batch_size=BATCH_SIZE
)

class_name = dataset.class_names
print(f"Các lớp phân loại: {class_name}")
print(f"Số batch: {len(dataset)}")

# ===================== CHIA DATASET =====================
print("\n" + "=" * 60)
print("BƯỚC 2: Chia dataset (80% train, 10% val, 10% test)...")
print("=" * 60)

def get_dataset_partitions_tf(ds, train_split=0.8, val_split=0.1, test_split=0.1, shuffle=True, shuffle_size=10000):
    ds_size = len(ds)
    train_size = int(train_split * ds_size)
    val_size = int(val_split * ds_size)
    train_ds = ds.take(train_size)
    val_ds = ds.skip(train_size).take(val_size)
    test_ds = ds.skip(train_size).skip(val_size)
    return train_ds, val_ds, test_ds

train_ds, val_ds, test_ds = get_dataset_partitions_tf(dataset)
print(f"Train batches: {len(train_ds)}, Val batches: {len(val_ds)}, Test batches: {len(test_ds)}")

# ===================== TIỀN XỬ LÝ =====================
print("\n" + "=" * 60)
print("BƯỚC 3: Tiền xử lý dữ liệu...")
print("=" * 60)

train_ds = train_ds.cache().shuffle(1000).prefetch(buffer_size=tf.data.AUTOTUNE)
val_ds = val_ds.cache().shuffle(1000).prefetch(buffer_size=tf.data.AUTOTUNE)
test_ds = test_ds.cache().shuffle(1000).prefetch(buffer_size=tf.data.AUTOTUNE)

resize_and_rescale = tf.keras.Sequential([
    layers.Resizing(IMAGE_SIZE, IMAGE_SIZE),
    layers.Rescaling(1.0 / 255)
])

data_augmentation = tf.keras.Sequential([
    layers.RandomFlip("horizontal_and_vertical"),
    layers.RandomRotation(0.2),
])

print("Tiền xử lý hoàn tất!")

# ===================== XÂY DỰNG MODEL =====================
print("\n" + "=" * 60)
print("BƯỚC 4: Xây dựng model CNN...")
print("=" * 60)

gc.collect()  # Giải phóng bộ nhớ

input_shape = (BATCH_SIZE, IMAGE_SIZE, IMAGE_SIZE, CHANNELS)
model = models.Sequential([
    resize_and_rescale,
    data_augmentation,
    layers.Conv2D(32, (3, 3), activation='relu', input_shape=input_shape),
    layers.MaxPooling2D((2, 2)),
    layers.Conv2D(64, kernel_size=(3, 3), activation='relu'),
    layers.MaxPooling2D((2, 2)),
    layers.Conv2D(64, kernel_size=(3, 3), activation='relu'),
    layers.MaxPooling2D((2, 2)),
    layers.Conv2D(64, (3, 3), activation='relu'),
    layers.MaxPooling2D((2, 2)),
    layers.Conv2D(64, (3, 3), activation='relu'),
    layers.MaxPooling2D((2, 2)),
    layers.Flatten(),
    layers.Dense(64, activation='relu'),
    layers.Dense(3, activation='softmax')
])

model.build(input_shape=input_shape)
model.summary()

# ===================== TÍNH CLASS WEIGHTS =====================
print("\n" + "=" * 60)
print("BƯỚC 5: Tính class weights và compile model...")
print("=" * 60)

# Dữ liệu không cân bằng: 1000 Early Blight, 1000 Late Blight, 152 Healthy
total_samples = 2152
num_classes = 3
class_samples = [1000, 1000, 152]  # [Early_blight, Late_blight, Healthy]

class_weights_dict = {
    i: total_samples / (num_classes * samples)
    for i, samples in enumerate(class_samples)
}
print(f"Class weights: {class_weights_dict}")

model.compile(
    optimizer='adam',
    loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=False),
    metrics=['accuracy']
)

print("Model đã được compile!")

# ===================== TRAIN MODEL =====================
print("\n" + "=" * 60)
print(f"BƯỚC 6: Training model ({EPOCH} epochs)...")
print("=" * 60)

history = model.fit(
    train_ds,
    epochs=EPOCH,
    batch_size=BATCH_SIZE,
    verbose=1,
    validation_data=val_ds,
    class_weight=class_weights_dict
)

# ===================== ĐÁNH GIÁ MODEL =====================
print("\n" + "=" * 60)
print("BƯỚC 7: Đánh giá model trên test set...")
print("=" * 60)

scores = model.evaluate(test_ds)
print(f"Test Loss: {scores[0]:.4f}")
print(f"Test Accuracy: {scores[1]:.4f}")

# ===================== LƯU MODEL =====================
print("\n" + "=" * 60)
print("BƯỚC 8: Lưu model...")
print("=" * 60)

os.makedirs("backend", exist_ok=True)
model.save(MODEL_SAVE_PATH)
print(f"Model đã được lưu tại: {MODEL_SAVE_PATH}")

# ===================== KIỂM TRA NHANH =====================
print("\n" + "=" * 60)
print("BƯỚC 9: Kiểm tra nhanh predictions...")
print("=" * 60)

for image_batch, label_batch in test_ds.take(1):
    for i in range(min(5, len(image_batch))):
        img = image_batch[i].numpy()
        actual = class_name[label_batch[i]]
        
        img_array = tf.expand_dims(image_batch[i], 0)
        predictions = model.predict(img_array, verbose=0)
        predicted_class = class_name[np.argmax(predictions[0])]
        confidence = round(100 * np.max(predictions[0]), 2)
        
        print(f"  Ảnh {i+1}: Thực tế = {actual}, Dự đoán = {predicted_class} ({confidence}%)")

print("\n" + "=" * 60)
print("HOÀN TẤT! Model đã sẵn sàng sử dụng.")
print("=" * 60)
