/**
 * @module        阶段 0 的本地开发服务器
 * @problem       浏览器需要通过一个地址查看首页，并在文件保存后自动刷新。
 * @design        只使用 Node.js 内置模块，避免为一页 Hello 引入整套依赖。
 * @courses       CS50x Week 8 HTML, CSS, JavaScript; The Missing Semester
 * @exercises     https://cs50.harvard.edu/x/psets/8/homepage/
 * @prereq        文件、HTTP 请求，以及浏览器从服务器取得网页的基本概念。
 * @unclear       阶段 1 接入文档框架后，本文件应由框架开发服务器替代。
 *
 * @letter
 * 你保存 index.html 时，程序会通知所有打开的浏览器刷新。这里没有第三方库：一部分
 * 代码把文件送给浏览器，另一部分保持一条很轻的通知通道。这不是要手写一个正式
 * Web 框架，而是让阶段 0 的验证不依赖磁盘空间和安装过程；到了阶段 1 就应退休。
 */
import { readFile, watch } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const clients = new Set();

const server = createServer((request, response) => {
  if (request.url === "/__reload") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (request.url !== "/" && request.url !== "/index.html") {
    response.writeHead(404).end("Not found");
    return;
  }

  readFile(new URL("index.html", import.meta.url), "utf8", (error, html) => {
    if (error) {
      response.writeHead(500).end("Could not read index.html");
      return;
    }

    // 只在本地响应中注入刷新代码，部署出去的 index.html 仍然是一张纯静态页面。
    const reloadScript = '<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>';
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html.replace("</body>", `${reloadScript}</body>`));
  });
});

watch(root, { recursive: false }, (_event, filename) => {
  if (filename === "index.html") {
    for (const client of clients) client.write("data: reload\n\n");
  }
});

server.listen(3000, () => {
  console.log("Open http://localhost:3000");
});
