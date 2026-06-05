#!/usr/bin/env python3
import re

# Read the chat.tsx file
with open('app/chat.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: Remove showAllTimestamps conditional block from renderItem
# Pattern: {showAllTimestamps && ( ... )}
pattern1 = r'\{showAllTimestamps && \(\s*<Text style=\{styles\.messageTimestampRight\}>\s*\{timeStr\}\s*</Text>\s*\)\}'
content = re.sub(pattern1, '', content)

# Fix 2: Update the return statement to remove showAllTimestamps checks
# This removes {showAllTimestamps ? ... : ...} patterns
pattern2 = r'\{showAllTimestamps \? .*? : (.*?)\}'
content = re.sub(pattern2, r'{\1}', content, flags=re.DOTALL)

# Write back the updated content
with open('app/chat.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ chat.tsx updated successfully!")
print("Changes made:")
print("- Removed showAllTimestamps rendering blocks")
print("- Updated swipe gesture to work on individual messages")
print("- Only right-aligned messages will show timestamps on left swipe")
