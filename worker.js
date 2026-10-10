
const OWNER = "shenli716";
const REPO = "sticker-library8";
const BRANCH = "main";
const FOLDER = "stickers";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });

async function listStickers() {
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FOLDER}?ref=${BRANCH}`;
  const response = await fetch(api, {
    headers: { "Accept": "application/vnd.github+json" },
  });

  if (!response.ok) {
    throw new Error(`读取图库失败：${response.status}`);
  }

  const files = await response.json();
  return files
    .filter(f => f.type === "file" && /\.(gif|png|jpe?g|webp)$/i.test(f.name))
    .map(f => ({
      name: f.name,
      url: `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}/${FOLDER}/${encodeURIComponent(f.name)}`
    }));
}

async function handleRpc(body) {
  const { id, method, params = {} } = body;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "sticker-library", version: "1.0.0" }
      }
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "list_stickers",
            description: "列出图库中的表情包文件名和图片链接",
            inputSchema: { type: "object", properties: {} }
          },
          {
            name: "show_sticker",
            description: "按文件名获取表情包图片链接",
            inputSchema: {
              type: "object",
              properties: {
                filename: {
                  type: "string",
                  description: "表情包文件名，例如 comfort.gif"
                }
              },
              required: ["filename"]
            }
          }
        ]
      }
    };
  }

  if (method === "tools/call") {
    try {
      const name = params.name;
      let result;

      if (name === "list_stickers") {
        result = await listStickers();
      } else if (name === "show_sticker") {
        const filename = params.arguments?.filename;
        if (!filename || filename.includes("/") || filename.includes("..")) {
          throw new Error("请提供有效的文件名");
        }

        const files = await listStickers();
        result = files.find(f => f.name === filename);

        if (!result) throw new Error("图库中没有找到这个文件");
      } else {
        throw new Error("未知工具名称");
      }

      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false
        }
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: error.message }],
          isError: true
        }
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: -32601, message: "Method not found" }
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version"
        }
      });
    }

    if (request.method === "GET") {
      return new Response("Sticker MCP server is running.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    try {
      const body = await request.json();
      const result = await handleRpc(body);

      if (body.method?.startsWith("notifications/")) {
        return new Response(null, { status: 202 });
      }

      return json(result);
    } catch {
      return json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Invalid JSON" }
      }, 400);
    }
  }
};
