#!/bin/bash
# 一键识别剪贴板图片
# 用法: bash scripts/clipboard_recognize.sh

echo "=== 1/2 从剪贴板保存图片 ==="
/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Administrator\cloud-order-miniprogram\scripts\clipboard_save.ps1"

if [ -f "C:\Users\Administrator\cloud-order-miniprogram\design-refs\clipboard.png" ]; then
    echo ""
    echo "=== 2/2 视觉模型识别 ==="
    PYTHONIOENCODING=utf-8 python "C:\Users\Administrator\cloud-order-miniprogram\scripts\img_recog.py" "C:\Users\Administrator\cloud-order-miniprogram\design-refs\clipboard.png"
else
    echo "剪贴板中没有图片，请先截图(Win+Shift+S)或复制图片"
fi
