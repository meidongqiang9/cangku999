#!/usr/bin/env python3
"""图片识别中转脚本 — 通过 NVIDIA API 的免费视觉模型识别图片
用法:
  python img_recog.py <图片路径>               # 单张识别
  python img_recog.py <图片路径> --model <模型> # 指定模型
  python img_recog.py <目录路径> --batch        # 批量识别目录下所有图片
"""

import sys
import os
import base64
import json
import urllib.request
import glob

API_KEY = "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"
BASE_URL = "https://integrate.api.nvidia.com/v1"

# 可用视觉模型（已验证可用的标注 ✅）
AVAILABLE_MODELS = [
    "microsoft/phi-4-multimodal-instruct",   # ✅ 已验证，效果不错
    "meta/llama-3.2-11b-vision-instruct",   # ✅ 可用，效果一般
    "nvidia/nemotron-nano-12b-v2-vl",       # 待验证
    "microsoft/phi-3-vision-128k-instruct", # 待验证
]

DEFAULT_MODEL = "nvidia/nemotron-nano-12b-v2-vl"

# UI 参考图专用提示词
UI_REFERENCE_PROMPT = """请仔细观察这张UI界面参考图，用中文分点回答：
1. 整体风格：这属于什么设计风格？（极简/卡片式/渐变/深色等）
2. 配色方案：主色调、辅助色、背景色、文字色分别是什么？
3. 布局结构：页面分几个区域？导航在哪里？内容怎么排列？
4. 组件细节：按钮、卡片、图标、输入框等有什么特征？
5. 可借鉴点：哪些设计元素适合用在餐饮点单小程序里？

请具体描述颜色（用十六进制色值或常见颜色名），不要泛泛而谈。"""


def describe_image(image_path, prompt=UI_REFERENCE_PROMPT, model=DEFAULT_MODEL):
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    ext = os.path.splitext(image_path)[1].lower()
    mime_map = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"
    }
    mime_type = mime_map.get(ext, "image/png")
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    print(f"[{os.path.basename(image_path)}] {len(img_bytes)/1024:.0f}KB → {model} ...", file=sys.stderr)

    body = json.dumps({
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]
        }],
        "max_tokens": 1024,
        "temperature": 0.2
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else ""
        return f"[错误 {e.code}] {error_body[:300]}"
    except Exception as e:
        return f"[异常] {str(e)}"


def process_directory(dir_path, model=DEFAULT_MODEL):
    """批量处理目录下所有图片"""
    exts = ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.gif", "*.bmp")
    files = []
    for ext in exts:
        files.extend(glob.glob(os.path.join(dir_path, ext)))
        files.extend(glob.glob(os.path.join(dir_path, ext.upper())))

    if not files:
        print(f"目录下没有图片文件: {dir_path}")
        return

    print(f"找到 {len(files)} 张图片，开始批量识别...\n")
    for i, f in enumerate(sorted(files), 1):
        print(f"\n{'='*60}")
        print(f"[{i}/{len(files)}] {os.path.basename(f)}")
        print(f"{'='*60}")
        result = describe_image(f, model=model)
        print(result)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法:")
        print("  python img_recog.py <图片路径>                # 单张识别")
        print("  python img_recog.py <图片路径> --model <模型>  # 指定模型")
        print("  python img_recog.py <目录路径> --batch         # 批量识别")
        print("  python img_recog.py --models                   # 列出可用模型")
        sys.exit(1)

    if sys.argv[1] == "--models":
        print("可用视觉模型:")
        for m in AVAILABLE_MODELS:
            tag = " ← 推荐" if m == DEFAULT_MODEL else ""
            print(f"  {m}{tag}")
        sys.exit(0)

    path = sys.argv[1]
    model = DEFAULT_MODEL
    batch = False

    # 解析参数
    args = sys.argv[2:]
    i = 0
    while i < len(args):
        if args[i] == "--model" and i + 1 < len(args):
            model = args[i + 1]
            i += 2
        elif args[i] == "--batch":
            batch = True
            i += 1
        else:
            # 可能是自定义提示词
            UI_REFERENCE_PROMPT = args[i]
            i += 1

    if not os.path.exists(path):
        print(f"路径不存在: {path}")
        sys.exit(1)

    if os.path.isdir(path) or batch:
        process_directory(path, model)
    else:
        result = describe_image(path, model=model)
        print(result)
