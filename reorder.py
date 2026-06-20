with open('index.html', 'r') as f:
    lines = f.readlines()

# 0-indexed line ranges
block1 = lines[0:181]          # Lines 1-181
block2 = lines[181:279]        # Lines 182-279 (About)
block3 = lines[279:361]        # Lines 280-361 (Products)
block4 = lines[361:426]        # Lines 362-426 (Reviews)
block5 = lines[426:428]        # Lines 427-428 (Contact Note)
block6 = lines[428:499]        # Lines 429-499 (Order)
block7 = lines[499:]           # Lines 500-700 (Recipe to end)

new_lines = block1 + block6 + block3 + block4 + block2 + block5 + block7

with open('index.html', 'w') as f:
    f.writelines(new_lines)

print("Reordering complete!")
