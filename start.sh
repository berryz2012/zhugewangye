#!/bin/bash
echo "=============================================="
echo "欢迎使用 诸葛王也 AI DRAMA STUDIO"
echo "=============================================="

if ! command -v node &> /dev/null
then
    echo "[错误] 未检测到 Node.js，请先前往 https://nodejs.org/ 安装 Node.js。"
    exit
fi

echo "正在自动安装运行所需的依赖环境，这可能需要几分钟时间..."
npm install --no-fund --no-audit

if [ $? -ne 0 ]; then
    echo "[错误] 依赖安装失败，请检查网络连接后重试。"
    exit 1
fi

echo ""
echo "环境安装完成！正在启动 诸葛王也 ..."
echo "请在浏览器中打开提示的本地运行链接 (通常是 http://localhost:3000 )"
echo ""
npm run dev
