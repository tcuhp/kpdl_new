import json

with open('model.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

for i, cell in enumerate(nb['cells']):
    if cell['cell_type'] == 'code':
        src = ''.join(cell['source'])
        first_line = src.strip().split('\n')[0][:100]
        print(f"Cell {i}: {first_line}")
