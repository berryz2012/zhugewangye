import express from "express";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import path from "path";
import util from "util";
import fs from "fs";
import os from "os";

// --- Log Capturing System ---
const MAX_LOGS = 200;
const serverLogs: { timestamp: string; level: string; message: string }[] = [];

function addLog(level: string, ...args: any[]) {
  const message = args
    .map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 4 })))
    .join(" ");
  serverLogs.unshift({ timestamp: new Date().toISOString(), level, message });
  if (serverLogs.length > MAX_LOGS) serverLogs.pop();
}

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  originalConsoleLog(...args);
  addLog("info", ...args);
};

console.error = (...args) => {
  originalConsoleError(...args);
  addLog("error", ...args);
};
// ----------------------------


async function callLLM(provider: string, apiKey: string, modelId: string, prompt: string) {
  if (provider === "deepseek") {
    const key = apiKey;
    if (!key) throw new Error("缺少 DeepSeek API Key");
    const model = modelId || "ep-20260413173125-z5dcr";
    const openai = new OpenAI({ apiKey: key, baseURL: "https://ark.cn-beijing.volces.com/api/v3" });
    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message?.content || "";
  } 
  else if (provider === "doubao") {
    const key = apiKey;
    if (!key) throw new Error("缺少 Doubao API Key");
    const model = modelId || "ep-20260413173422-w4ggg";
    const openai = new OpenAI({ apiKey: key, baseURL: "https://ark.cn-beijing.volces.com/api/v3" });
    const response = await openai.chat.completions.create({
      model: model,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message?.content || "";
  } 
  throw new Error("Invalid provider selected");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up temporary image uploads directory
  const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Serve the uploads directory statically
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Local upload for persisting asset library images
  app.post("/api/upload-local", async (req, res) => {
    try {
      const { mediaBase64, filename } = req.body;
      if (!mediaBase64) return res.status(400).json({ error: "Missing mediaBase64" });

      const matches = mediaBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ error: "Invalid base64 format" });
      }
      
      const mimeType = matches[1];
      let extMatch = mimeType.split('/')[1] || 'bin';
      if (extMatch === 'jpeg') extMatch = 'jpg';
      if (extMatch === 'mpeg') extMatch = 'mp3';
      
      const buffer = Buffer.from(matches[2], 'base64');
      const baseFilename = filename ? filename.replace(/[^a-zA-Z0-9_-]/g, '') : `local_${Date.now()}`;
      const safeFilename = `${Date.now()}_${baseFilename}.${extMatch}`;
      const filePath = path.join(UPLOADS_DIR, safeFilename);

      fs.writeFileSync(filePath, buffer);
      
      return res.json({ url: `/uploads/${safeFilename}` });
    } catch (err: any) {
      console.error("[Local Upload Exception]:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Local persistence for JSON configs
  app.get("/api/config", (req, res) => {
    const name = String(req.query.name || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
    const configPath = path.join(process.cwd(), 'uploads', `config_${name}.json`);
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        res.json({ value: raw });
      } catch (err: any) {
        res.status(500).json({ error: "Failed to read config" });
      }
    } else {
      res.json({ value: null });
    }
  });

  app.post("/api/config", (req, res) => {
    try {
      const name = String(req.body.name || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
      let value = req.body.value;
      
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      } else {
        value = String(value || '');
      }
      
      const configPath = path.join(process.cwd(), 'uploads', `config_${name}.json`);
      const backupPath = path.join(process.cwd(), 'uploads', `config_${name}.bak.json`);

      // 🛡️ Data Protection Logic:
      // If we already have a file, and the incoming data is significantly smaller (e.g., looks like a reset),
      // we back up the old one first and potentially block the write if it looks too suspicious.
      if (fs.existsSync(configPath)) {
        const oldData = fs.readFileSync(configPath, 'utf-8');
        
        // 1. If old data is much larger than new data (e.g. 50% decrease AND new data is tiny)
        // This usually means the store was reset to initial state.
        if (oldData.length > 5000 && value.length < 2000) {
           console.warn(`[Config Guard] Suspiciously small config save blocked for ${name}. Old: ${oldData.length}bytes, New: ${value.length}bytes`);
           // Create a backup anyway for safety
           fs.writeFileSync(backupPath, oldData, 'utf-8');
           return res.status(400).json({ error: "保存失败：检测到异常的数据减少，为防止数据丢失已拦截。请刷新页面重试。" });
        }

        // Periodic backup
        fs.writeFileSync(backupPath, oldData, 'utf-8');
      }
      
      fs.writeFileSync(configPath, value, 'utf-8');
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Config Write Exception]:", err);
      res.status(500).json({ error: "Failed to save config" });
    }
  });

  app.delete("/api/config", (req, res) => {
    try {
      const name = String(req.query.name || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
      const configPath = path.join(process.cwd(), 'uploads', `config_${name}.json`);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete config" });
    }
  });

  app.post("/api/upload-media", async (req, res) => {
    try {
      const { mediaBase64 } = req.body;
      if (!mediaBase64) return res.status(400).json({ error: "Missing mediaBase64" });

      const matches = mediaBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ error: "Invalid base64 format" });
      }
      
      const mimeType = matches[1];
      let extMatch = mimeType.split('/')[1] || 'bin';
      if (extMatch === 'jpeg') extMatch = 'jpg';
      if (extMatch === 'mpeg') extMatch = 'mp3';
      
      const buffer = Buffer.from(matches[2], 'base64');
      const prefix = mimeType.startsWith('audio/') ? 'audio' : 'img';
      const filename = `${prefix}_${Date.now()}.${extMatch}`;

      // Upload to purely public host so Volcengine can bypass IAM restrictions
      // Try Catbox.moe first
      try {
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', new Blob([buffer], { type: mimeType }), filename);
        
        const catboxRes = await fetch('https://catbox.moe/user/api.php', {
          method: 'POST',
          body: formData
        });
        
        if (catboxRes.ok) {
          const publicUrl = await catboxRes.text();
          if (publicUrl.startsWith('http')) {
            console.log(`[Media Proxy] Saved ${prefix} to catbox: ${publicUrl}`);
            return res.json({ url: publicUrl });
          }
        }
      } catch (e: any) {
        console.warn(`[Media Proxy] Catbox upload failed for ${prefix}, falling back...`, e.message);
      }

      // Fallback: tmpfiles.org
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mimeType }), filename);
      
      const tmpRes = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
      });
      
      const tmpData = await tmpRes.json();
      if (tmpData?.data?.url) {
        // Convert to direct download link: https://tmpfiles.org/dl/12345/img.jpg
        const publicUrl = tmpData.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        console.log(`[Media Proxy] Saved ${prefix} to tmpfiles: ${publicUrl}`);
        return res.json({ url: publicUrl });
      }

      throw new Error(`All public ${prefix} uploaders failed`);
    } catch (err: any) {
      console.error("[Media Proxy Exception]:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Log endpoints
  app.get("/api/logs", (req, res) => {
    res.json(serverLogs);
  });

  // 🏥 Asset Recovery Endpoint
  // Scans the uploads folder and returns files that might have been lost from the config
  app.get("/api/recover-assets", (req, res) => {
    try {
      const files = fs.readdirSync(UPLOADS_DIR);
      const results = files
        .filter(f => f.match(/\.(jpg|jpeg|png|gif|webp|mp3|wav|mp4)$/i))
        .map(f => ({
          id: `recovered_${f}`,
          name: f.split('_').slice(1).join('_') || f,
          url: `/uploads/${f}`,
          timestamp: f.split('_')[0]
        }))
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
      
      res.json({ assets: results });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to scan uploads directory" });
    }
  });

  app.delete("/api/logs", (req, res) => {
    serverLogs.length = 0;
    res.json({ success: true });
  });

  app.post("/api/generate", async (req, res) => {
    try {
      const { provider, apiKey, modelId, systemPrompt, userKeywords } = req.body;
      if (!userKeywords) return res.status(400).json({ error: "Keywords are required" });
      const prompt = `${systemPrompt}\n\n用户描述：${userKeywords}`;
      const result = await callLLM(provider, apiKey, modelId, prompt);
      res.json({ result });
    } catch (error: any) {
      console.error(`[Generate Error - ${req.body.provider}]:`, error);
      
      let safeDetails;
      try {
        const rawDetails = error.response?.data || error.error || error;
        JSON.stringify(rawDetails); // Test serializability
        safeDetails = rawDetails;
      } catch (e) {
        safeDetails = { message: error.message, name: error.name };
      }

      const errorMessage = error.response?.data?.error?.message || error.error?.message || error.message || "Failed to generate prompt";
      res.status(500).json({ error: errorMessage, details: safeDetails });
    }
  });

  app.post("/api/translate", async (req, res) => {
    try {
      const { provider, apiKey, modelId, text } = req.body;
      if (!text) return res.status(400).json({ error: "Text is required" });
      const prompt = `请将以下 Midjourney 提示词翻译成中文，只需返回翻译结果，不要任何多余的解释：\n\n${text}`;
      const result = await callLLM(provider, apiKey, modelId, prompt);
      res.json({ result });
    } catch (error: any) {
      console.error(`[Translate Error - ${req.body.provider}]:`, error);
      
      let safeDetails;
      try {
        const rawDetails = error.response?.data || error.error || error;
        JSON.stringify(rawDetails); // Test serializability
        safeDetails = rawDetails;
      } catch (e) {
        safeDetails = { message: error.message, name: error.name };
      }

      const errorMessage = error.response?.data?.error?.message || error.error?.message || error.message || "Failed to translate";
      res.status(500).json({ error: errorMessage, details: safeDetails });
    }
  });

  app.post("/api/seedance", async (req, res) => {
    try {
      const { apiKey, payload } = req.body;
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        return res.status(400).json({ error: "API Key is required" });
      }
      
      console.log("[Seedance Proxy] Creating Task (Ark v3 Mode):", JSON.stringify(payload, null, 2));

      // Connecting to Ark v3 API matching the official Python SDK's endpoint /contents/generations/tasks
      const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      console.log(`[Seedance Proxy] Status: ${response.status}`);
      console.log("[Seedance Proxy] Raw Body:", responseText);

      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("[Seedance Proxy] Failed to parse response as JSON");
      }
      
      if (!response.ok) {
        return res.status(response.status).json({
          error: data?.message || data?.error?.message || `Seedance API 错误 (${response.status})`,
          details: data || responseText
        });
      }

      console.log("[Seedance Proxy] Task Created:", data);
      res.json(data);
    } catch (error: any) {
      console.error("[Seedance Proxy Exception]:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/seedance/task/:taskId", async (req, res) => {
    try {
      const { taskId } = req.params;
      const authHeader = req.headers.authorization;
      const apiKey = authHeader?.split(" ")[1];
      
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        return res.status(400).json({ error: "API Key is missing or invalid" });
      }

      // Querying status via Ark v3 API path matching Python SDK
      const response = await fetch(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      const data = await response.json().catch(() => null);
      
      if (!response.ok) {
        console.error(`[Seedance Task Proxy] Error (${response.status}):`, data);
        return res.status(response.status).json(data);
      }
      res.json(data);
    } catch (error: any) {
      console.error("[Seedance Task Proxy Exception]:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Automatically open the browser & Create Desktop Shortcut
    const url = `http://localhost:${PORT}`;
    const startObj: { [key: string]: string } = {
      darwin: `open ${url}`,
      win32: `start "" "${url}"`,
      default: `xdg-open ${url}`
    };
    
    import('child_process').then(({ exec }) => {
      const platform = process.platform as string;
      const command = startObj[platform] || startObj.default;
      exec(command, () => {});

      // Windows-specific Desktop Shortcut Creation (Bypassing Encoding Bugs)
      if (platform === 'win32') {
        const desktopPath = path.join(os.homedir(), "Desktop");
        const shortcutPath = path.join(desktopPath, "诸葛王也生成器.lnk");
        const targetPath = path.join(process.cwd(), "start.bat");
        const iconPath = path.join(process.cwd(), "public", "app-icon.ico");
        
        if (!fs.existsSync(shortcutPath)) {
          // Use Base64 Encoded Powershell Command to avoid any Chinese character encoding issues in Windows CMD
          let psCommand = `$wshell = New-Object -ComObject WScript.Shell; $s = $wshell.CreateShortcut('${shortcutPath}'); $s.TargetPath = '${targetPath}'; $s.WorkingDirectory = '${process.cwd()}';`;
          
          // Apply icon if it exists
          if (fs.existsSync(iconPath)) {
            psCommand += ` $s.IconLocation = '${iconPath}';`;
          }
          
          psCommand += ` $s.Save()`;
          const encodedCommand = Buffer.from(psCommand, "utf16le").toString("base64");
          
          exec(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`, (err) => {
            if (!err) console.log("Desktop shortcut '诸葛王也生成器' created successfully" + (fs.existsSync(iconPath) ? " with custom icon!" : "!"));
          });
        }
      }
    });
  });
}

startServer();
