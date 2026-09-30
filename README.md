# ffxiv-pfbot

定时抓取 xivpf.com 的招募信息，用 RE2 正则匹配并推送到 Discord 当前频道。
需要 Bun 1.4.2 或更新版本，使用内置 `bun:sqlite`，无需额外安装数据库服务。

To install dependencies:

```bash
npm install -g bun
bun install
```

Setup Discord bot token:

1. Create a `.env` file in the root directory.
2. Add your Discord bot token to the `.env` file:

```env
DISCORD_BOT_TOKEN="your-bot-token-here"
# Optional, defaults to every 5 minutes (runtime local time zone)
FETCH_CRON="*/5 * * * *"
# Optional, defaults to data/pfbot.sqlite
DATABASE_PATH="data/pfbot.sqlite"
```

```bash
bun run start
```

To find lint errors:

```bash
bun run lint
```

检查类型和运行测试：

```bash
bun run typecheck
bun test
```

## 命令与权限

- `/subscribe keyword:Ultimate|Savage`：订阅当前频道。正则只匹配副本名称和招募描述，长度为 1–1000 字符。
- `/list page:1`：查看当前频道订阅，每页 5 条，支持上一页、下一页按钮。
- `/unsubscribe page:1`：从当前频道订阅中选择取消，每页最多 25 个选项。

所有管理回复均为私密回复，分页按钮在两分钟后失效。命令没有目标频道选项，
创建、查看和删除都限定在当前服务器及频道；按钮和菜单绑定发起用户、频道和会话。
用户必须拥有当前频道的查看频道和管理频道权限，组件操作时重新检查权限。

支持文字频道、公告频道以及公开、私密、公告线程。论坛需要在线程内使用命令。
订阅前和每次投递前检查机器人的查看频道、嵌入链接及发送权限；线程需要发送线程消息权限，
且不能处于归档或锁定状态。向公告频道发送消息不会自动发布到关注者频道。
权限不足时保留订阅，恢复权限后下一轮继续投递。

私密线程中，机器人还必须已加入线程，或已具有管理线程权限。推荐把机器人加入所需
线程，而非为此授予管理线程权限。禁言中的机器人不会投递。

邀请时使用 `bot` 和 `applications.commands` scopes。机器人仅需目标频道的
查看频道、发送消息、嵌入链接权限；线程另需发送线程消息权限。机器人不需要管理员、
管理频道、管理消息权限，也不需要 Message Content 或 Guild Members 特权 intent。
客户端仅启用 `Guilds` intent；管理频道权限要求针对命令发起人，而非机器人。
Token、数据库及其备份应仅允许部署账户和管理员访问。

## SQLite 数据与迁移

订阅和投递记录保存在 `data/pfbot.sqlite`。SQLite 使用 WAL、FULL 同步及写入等待，
通过唯一约束和事务保护更新。`data/` 已加入 Git 忽略规则。
部署时应把数据库目录放到持久化存储；备份运行中的数据库应使用 SQLite 备份工具，
或停止机器人后备份数据库，避免漏掉 WAL 中尚未合并的数据。

## 推送行为

同一频道的多个正则匹配同一招募 ID 时只发送一条消息，并合并匹配到的正则。
网站返回的重复 ID 会先去重。SQLite 持久保存消息 ID 和内容摘要：内容不变时跳过，
内容变化时编辑已发送消息；原消息被删除时，在下一次内容更新后补发。
发送或编辑失败不会记录新的成功状态，下一轮仍匹配时重试。
新增频道订阅可以匹配当前仍存在的招募。任务取消后保留投递记录，避免重新订阅造成重复消息。

过长的队伍字段隐藏空位的可选职业列表，用空白格保留位置，并保留已入队职业。
其他消息字段也遵守 Discord 长度限制。列表中的长正则会缩略显示。

请为同一机器人运行一个监控进程。正常重启不会重复推送已记录的消息；
Discord 投递与 SQLite 提交不能组成跨系统事务，发送成功后、记录提交前异常退出
仍存在很小的重复窗口。发送使用 Discord 的 nonce 去重缩小短时间重试的重复风险，
该机制不是无限期的精确一次投递保证。默认五分钟轮询也可能错过期间出现又消失的招募。

每次 HTTP 抓取（包括正文读取）最多等待 30 秒，解压后的 HTML 上限为 16 MiB。
非 HTML 响应、缺失列表容器或缺失招募 ID 会报错并等待下一轮重试，避免把错误页面
误判为没有招募。正则区分大小写；可用 `(?i)Ultimate` 忽略大小写，支持 RE2JS 语法。
