import json

with open('model.ipynb', 'r', encoding='utf-8') as f:
    nb = json.load(f)

# Print full source of important cells
important_cells = [1, 2, 3, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 26]
for i, cell in enumerate(nb['cells']):
    if cell['cell_type'] == 'code' and i in important_cells:
        src = ''.join(cell['source'])
        print(f"=== Cell {i} ===")
        print(src)
        print()
