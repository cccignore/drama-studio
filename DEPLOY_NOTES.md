# Drama Studio · 服务器部署运维笔记

> 服务器：`ssh cynn` → `ubuntu@43.160.246.165`，部署目录 `~/drama-studio/`，容器名 `drama-studio`，监听 `127.0.0.1:3000`，nginx 反代到 `https://api.liucu.cn`，数据卷 `./data → /app/.data`。
> VM 配置：**2 GB RAM + 2 GB swap**（swap 于 2026-04-22 永久加入 `/etc/fstab`，用于在线跑 Next.js build 时稳住 sshd）。

---

## 事故复盘 · 2026-04-22 直接 `docker compose up -d --build` 导致 SSH 断联

### 症状

- `scp` 新代码上去 → OK
- `sudo docker compose up -d --build` → 构建 109 秒、镜像生成、容器重启都成功
- 构建过程中与结束后几分钟内，**SSH 全部被打回 `kex_exchange_identification: Connection closed by remote host`**
- 但公网 HTTPS `https://api.liucu.cn/` 始终 200，服务没挂

### 根因

Next.js `output: "standalone"` 的构建会跑完整的 TypeScript 编译 + 全路由静态分析，峰值内存 1.5–1.8 GB。VM 只有 2 GB 且 **0 swap**，所以：

1. 构建期间内存吃满 → sshd `fork()` 新连接失败 → 新 SSH 在密钥交换第一步就被拒
2. TCP 三次握手能过（说明 sshd 没死），但 fork 子进程失败，所以 `kex_exchange_identification` 断开
3. 构建结束、新容器启动后，内存回落到 ~500 MB，SSH **自愈**，无需任何操作

复现条件：**2 GB VM + 0 swap + 在线构建 Next.js** = 必中。

---

## ✅ 正确的重部署流程（避免断联）

### 方案 A（推荐）· 本地构建镜像，服务器只拉取运行

服务器永远不做 `npm run build`，把繁重的 TS/Next 构建留在开发机上。

```bash
# 本地
cd drama-studio
docker build -t drama-studio:latest .
docker save drama-studio:latest | gzip > /tmp/drama-studio.tar.gz
scp /tmp/drama-studio.tar.gz cynn:/tmp/

# 服务器
ssh cynn
cd ~/drama-studio
sudo docker load < /tmp/drama-studio.tar.gz
# 改 docker-compose.yml 的 image: drama-studio:latest，删掉 build: 字段
sudo docker compose up -d
```

优点：服务器只做 `docker load` 和 `restart`，内存峰值 < 200 MB，SSH 全程稳定。

### 方案 B · 在线构建前先加 swap（一次性动作）

如果坚持在服务器上 `--build`，**先把 swap 加上**：

```bash
ssh cynn
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -m   # 确认 Swap: 2047
```

这步只做一次。之后 `docker compose up -d --build` 就不会再把 sshd 挤掉。

### 方案 C · 兜底规则（不管 A / B 都建议遵守）

- 重建镜像前，**另开一个 SSH 窗口挂着**（`ServerAliveInterval=30`），保留一条活跃会话；断的只是新连接，已有会话不会掉
- `docker compose up -d --build` **先在 tmux / nohup 里跑**：`tmux new -s build -d 'cd ~/drama-studio && sudo docker compose up -d --build'`，断网也不会杀进程
- 构建过程中**不要频繁开新 SSH**（会踩 `MaxStartups` 限流，和 fork 失败叠加）

---

## 📦 源码热更新（不重建镜像的情况）

代码改动如果只涉及**被镜像 COPY 进去的 runtime 文件**，不改不行——因为 `Dockerfile` 的 standalone 输出是构建产物，不读 `~/drama-studio/app` 的源码。**必须重建镜像**。

所以 "只改一两个 ts 文件不要走 compose build" 这个念头是错的，别省。

---

## 🔒 部署前自检清单

```bash
# 1. 本地和服务器文件对齐检查
ssh cynn 'cd ~/drama-studio && find app lib components hooks references scripts \
  -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "*.sql" \) \
  -printf "%s %p\n" | sort' > /tmp/srv.txt

cd drama-studio && find app lib components hooks references scripts \
  -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "*.sql" \) \
  | while read f; do stat -f "%z %N" "$f"; done | sort > /tmp/local.txt

diff /tmp/srv.txt /tmp/local.txt
# 差异就是需要 scp 的文件

# 2. 备份关键文件（自动在服务器端）
ssh cynn 'cd ~/drama-studio && mkdir -p .backup/$(date +%Y%m%d-%H%M%S)'

# 3. DB 快照（越过 docker 用 cp 也可，最安全是 .backup 拷贝）
ssh cynn 'sudo cp -a ~/drama-studio/data ~/drama-studio/.backup/$(date +%Y%m%d-%H%M%S)/'
```

---

## 🚨 回滚手册

### 源码回滚
```bash
ssh cynn
cd ~/drama-studio
ls .backup/                           # 找最近那个时间戳目录
cp .backup/YYYYMMDD-HHMMSS/*.ts  <原路径>
sudo docker compose up -d --build     # 方案 A 的话是 load 旧镜像 + restart
```

### DB 回滚
```bash
sudo docker compose down
sudo cp .backup/YYYYMMDD-HHMMSS/data/drama.db data/drama.db
sudo docker compose up -d
```

### 整体容器回滚（最快）

在发新版镜像之前给旧镜像打个 tag：
```bash
# 发版前
sudo docker tag drama-studio-drama-studio:latest drama-studio:prev

# 出问题
sudo docker tag drama-studio:prev drama-studio-drama-studio:latest
sudo docker compose up -d --force-recreate
```

---

## 🔑 服务器配置速查

| 项 | 值 / 位置 |
|---|---|
| `.env` | `~/drama-studio/.env` |
| APP_URL | `https://api.liucu.cn` |
| DB | `~/drama-studio/data/drama.db`（容器内 `/app/.data/drama.db`）|
| 容器 | `drama-studio`，compose 文件 `~/drama-studio/docker-compose.yml` |
| nginx | `/etc/nginx/conf.d/drama-studio.conf`（SSE 必须 `proxy_buffering off`）|
| sshd | 默认 `MaxStartups 10:30:100`，重部署别开超过 5 条 SSH |

## DB 常用运维命令

```bash
# 看模型列表 & 默认 & MoE 绑定
ssh cynn 'sudo docker exec drama-studio node -e "
const db = require(\"better-sqlite3\")(\"/app/.data/drama.db\");
console.log(db.prepare(\"SELECT id, name, model, is_default FROM llm_configs\").all());
console.log(db.prepare(\"SELECT slot, config_id FROM llm_role_bindings\").all());
"'

# 把某模型设为默认（fallback 用）
ssh cynn 'sudo docker exec drama-studio node -e "
const db = require(\"better-sqlite3\")(\"/app/.data/drama.db\");
db.transaction(() => {
  db.prepare(\"UPDATE llm_configs SET is_default = 0\").run();
  db.prepare(\"UPDATE llm_configs SET is_default = 1 WHERE model = ?\").run(\"gpt-5.4\");
})();
"'
```

---

## 一句话总结

> **2 GB VM 不要在线跑 Next.js build。** 要么本地构建镜像 `docker save / docker load`，要么先加 2 GB swap。SSH 断联自愈不用慌，但等着时别疯狂重连，会进一步触发 sshd 限流。
