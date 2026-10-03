# ffxiv-pfbot

<div align="center">
  <img src="./docs/preview.png" alt="Discord 招募推送预览" height="320" />
</div>

面向《最终幻想 XIV》（FF14）国际服玩家的 Discord 招募订阅机器人。定时读取 [xivpf.com](https://xivpf.com/listings) 的招募信息，按关键词、数据中心和招募类别筛选，推送到指定频道。

- **按频道订阅**：通过斜杠命令和表单管理，支持正则表达式及多选筛选。
- **中文招募卡片**：显示副本、招募描述、服务器、招募人、装等和队伍职业；副本名称优先使用中文译名，描述正文保留原文。
- **自动维护消息**：同一频道内去重，内容变化时更新原消息，招募结束后自动清理。
- **本地持久化**：使用 Bun 内置的 SQLite，无需额外数据库服务，重启后保留订阅和推送记录。

## 部署指南

运行环境需能正常访问 Discord 和 xivpf.com。选择直接运行时需 **Bun 1.4.2 或更高版本**；支持选择使用 Docker Compose 部署。

### 创建机器人并配置权限

在 Discord Developer Portal 创建应用和机器人，取得 Bot Token。邀请机器人进入服务器时，选择 `bot` 和 `applications.commands` scopes，并在接收推送的频道授予以下权限：

| 使用场景           | 机器人所需权限                   |
| ------------------ | -------------------------------- |
| 文字频道、公告频道 | 查看频道、发送消息、嵌入链接     |
| 线程               | 查看频道、发送线程消息、嵌入链接 |

私密线程还需将机器人加入线程，或授予管理线程权限；线程不能处于归档或锁定状态。向公告频道发送消息不会自动发布到关注者频道。

机器人无需管理员、管理频道或管理消息权限，仅使用 `Guilds` intent，无需开启 Message Content 或 Guild Members 特权 intent。

### 配置项目

```bash
git clone https://github.com/LolipopJ/ffxiv-pfbot.git
cd ffxiv-pfbot
cp .env.example .env
```

编辑 `.env`，将 `DISCORD_BOT_TOKEN` 替换为真实 Token。其他配置按需修改：

| 环境变量            | 默认值                       | 说明                                                                                                                     |
| ------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DISCORD_BOT_TOKEN` | 无，必填                     | Discord Bot Token。                                                                                                      |
| `FETCH_CRON`        | `*/5 * * * *`                | 检查周期，默认每 5 分钟，使用运行时区。                                                                                  |
| `DATABASE_PATH`     | `data/pfbot.sqlite`          | SQLite 路径，父目录自动创建；Compose 固定为 `/app/data/pfbot.sqlite`。                                                   |
| `XIVPF_URL`         | `https://xivpf.com/listings` | 招募页面地址；调试页面需保持相同 HTML 结构。                                                                             |
| `TZ`                | 无                           | Cron 和机器人状态显示使用的时区，如 `Asia/Shanghai`。示例配置和 Compose 使用 `UTC`；直接运行且未设置时使用运行环境时区。 |

### 启动机器人

两种方式任选其一。上线后会自动向已加入的服务器注册斜杠命令，加入新服务器时也会注册。监控启动约 5 秒后首次检查，之后按配置周期运行。

**直接使用 Bun：**

```bash
bun install
bun run start
```

**使用 Docker Compose：**

```bash
# 验证配置，构建并后台启动
docker compose config --quiet
docker compose up -d --build

# 查看状态和日志
docker compose ps
docker compose logs -f --tail=100 pfbot
```

启动后，按[使用方法](#使用方法)创建订阅。

### 更新与维护

以下命令适用于 Docker Compose：

```bash
# 更新代码并重新构建
git pull --ff-only
docker compose up -d --build

# 修改 .env 后重新创建容器
docker compose up -d --force-recreate

# 重启
docker compose restart pfbot

# 停止并移除容器，保留数据卷
docker compose down
```

容器默认留出 1 分钟等待任务结束，订阅量较大时可调高 `docker-compose.yml` 中的 `stop_grace_period`。日志按每文件 10 MiB、最多 3 个文件轮转。

<details>
<summary>数据库备份、恢复与迁移</summary>

订阅及推送状态存放在 `pfbot-data` 命名数据卷中，容器内路径为 `/app/data/pfbot.sqlite`。Compose 会覆盖 `.env` 中的 `DATABASE_PATH`；更换位置时须同时调整环境变量和卷挂载，确保数据库及 WAL 文件位于持久化目录中。

备份前先停止机器人，复制整个数据目录；每次使用新的备份目标目录，并在 `docker compose down` 移除容器前完成：

```bash
docker compose stop pfbot
mkdir -p backups
docker compose cp pfbot:/app/data ./backups/pfbot-data
docker compose start pfbot
```

恢复会替换现有数据库，请先备份原数据并停止原实例。备份应包含 `pfbot.sqlite` 及备份时存在的 `pfbot.sqlite-wal`、`pfbot.sqlite-shm` 文件。

```bash
# 创建容器和数据卷，保持机器人停止
docker compose build
docker compose create pfbot
docker compose stop pfbot

# 替换数据库并修正权限
docker compose run --rm --no-deps --user root pfbot rm -f /app/data/pfbot.sqlite /app/data/pfbot.sqlite-wal /app/data/pfbot.sqlite-shm
docker compose cp ./backups/pfbot-data/. pfbot:/app/data
docker compose run --rm --no-deps --user root pfbot chown -R bun:bun /app/data
docker compose up -d
```

从直接运行迁移到 Compose 时，先停止原进程，再将恢复命令中的 `./backups/pfbot-data/.` 替换为原数据库目录（默认 `./data/.`）。

</details>

## 使用方法

你需要当前频道的**查看频道**和**管理频道**权限。请在希望接收推送的文字频道、公告频道或线程中操作；论坛帖子请进入帖子内使用命令，不支持私信。

以订阅 Mana 数据中心的绝境战或零式招募为例：

1. 输入 `/subscribe`，打开订阅表单。
2. 在「正则表达式」中填写 `(?i)(Ultimate|Savage)`，无需添加反引号或两侧的 `/`。
3. 在「数据中心」中选择 `Mana (JP)`。
4. 在「招募类别」中选择「高难度任务」。
5. 提交并确认收到创建成功的提示，等待下一轮检查。默认每 5 分钟检查一次，也会匹配网站上已有的有效招募。

数据中心和招募类别均可多选，留空表示该项不限。**同一项选中任意一个即可，不同项必须同时满足**：上述订阅要求招募位于 Mana、属于高难度任务，且英文副本名称或描述中包含 `Ultimate` 或 `Savage`。

### 填写匹配条件

「正则表达式」是关键词匹配规则，必填，长度为 **1–1000 字符**，使用 RE2 语法。匹配范围是**网站上的英文副本名称和招募描述**，卡片中的中文副本译名不参与匹配。

可以直接复制以下示例；`(?i)` 表示忽略英文字母大小写，`|` 表示“或”。示例仅按文字匹配，不保证覆盖所有同类招募。

| 填写内容                         | 匹配效果                                            |
| -------------------------------- | --------------------------------------------------- |
| `(?i)Savage`                     | 包含 `Savage`。                                     |
| `(?i)(Ultimate\|Savage)`         | 包含 `Ultimate` 或 `Savage`。                       |
| `(?i)(practice\|prog)`           | 包含 `practice` 或 `prog`，可用于查找练习或进度队。 |
| `(?i)(バイト\|報酬\|傭兵\|merc)` | 包含这些常见佣兵招募关键词之一。                    |
| `.*`                             | 不限制文字内容，仅按数据中心和招募类别筛选。        |

### 管理订阅与消息

所有命令只作用于**当前服务器的当前频道或线程**。订阅由频道共享，具备上述权限的用户均可管理。

| 命令           | 用途                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| `/subscribe`   | 创建订阅。                                                                       |
| `/list`        | 查看订阅及筛选条件。                                                             |
| `/edit`        | 选择订阅，修改表单并提交；新条件在下一轮检查生效。                               |
| `/unsubscribe` | 选择并取消订阅，停止按该条件推送。                                               |
| `/clear`       | 清理当前频道已结束的招募消息及推送记录。                                         |
| `/reset`       | 选择一个订阅或「全部订阅」，立即强制清理关联消息及推送记录，包括尚未结束的招募。 |

`/list`、`/edit`、`/unsubscribe`、`/reset` 支持翻页，也可填写 `page` 指定页码，例如 `/list page:2`；省略时从第 1 页开始。

命令回复仅自己可见，招募推送则对频道成员可见。菜单和表单在 **2 分钟**后失效，超时后请重新运行命令。创建或编辑只有在提交成功后才保存；关闭、超时、正则无效或与频道内其他订阅条件完全相同时，均不会保存变更。

清理消息时请区分：

- **取消或修改订阅不会立即删除已有消息**，这些消息仍会在招募结束后自动清理。若招募匹配其他订阅，仍可继续推送或更新。
- **`/clear` 和 `/reset` 都保留订阅设置**，仅处理机器人记录的招募消息，不会清空频道内的其他消息。
- **`/reset` 选择后立即执行**。若消息被多个订阅共同匹配，选择其中一个也会删除该消息；仍符合订阅条件的有效招募可在下一轮重新推送。
- 「全部订阅」覆盖当前频道的所有推送记录，包括已取消订阅留下的记录，即使频道已无订阅也可使用。若提示旧记录无法归属到单个订阅，可用此选项清理。
- 清理失败的记录会保留，回复中会显示失败数量；修复权限或网络问题后可再次执行。

### 推送与自动清理规则

同一频道内，同一个招募 ID 只保留一条推送，多个订阅命中时合并显示匹配条件。仍符合订阅条件的招募内容变化时更新原消息，未变化则跳过。

每轮检查后，机器人会清理满足以下任一条件的消息：

- 招募已从成功读取的网站列表中消失。
- 招募已到期，期限以网站提供的剩余时间刷新。
- 网站显示该招募上次被抓取距今已达 10 分钟，机器人将其视为已结束。这里指网站上的招募更新时间，并非机器人连续运行了 10 分钟。

取消全部订阅后，已有消息仍会自动清理。网站读取失败时，仅按已记录的到期时间清理；频道暂时不可访问或发送失败时保留订阅，恢复后继续处理仍符合条件的招募。

手动删除推送不保证下一轮补发：只有招募仍匹配且待推送内容变化时，机器人才会尝试更新并补发。需要重新推送时，可用 `/reset` 清除相应记录。

## 项目开发

安装依赖并配置 `.env` 后，可使用以下命令：

```bash
bun run start       # 启动
bun run lint        # 代码风格检查
bun run lint:fix    # 自动修复格式和风格问题
bun run typecheck   # TypeScript 类型检查
bun run test        # 自动化测试
```

翻译词典来自 `ffxiv-data` Git 子模块，运行时使用已构建的词典。更新游戏数据并重新生成：

```bash
bun run build:dict
```

### 实现结构

项目使用 discord.js 处理命令和消息，Cheerio 解析页面，RE2JS 校验和执行正则，`bun:sqlite` 保存状态。文件树结构如下：

```text
ffxiv-pfbot/
├── src/
│   ├── index.ts                   # 启动、命令注册与进程关闭
│   ├── commands/                  # 订阅管理及清理命令入口
│   ├── services/
│   │   ├── fetcher.ts             # 抓取并解析招募页面
│   │   ├── monitor.ts             # 定时检查、匹配订阅及更新消息
│   │   ├── listing-state.ts       # 刷新招募期限及过期标记
│   │   ├── cleanup.ts             # 自动、手动及强制清理
│   │   ├── tasks.ts               # 串行任务队列及机器人状态
│   │   ├── store.ts               # SQLite 存储及订阅校验
│   │   ├── subscription-form.ts   # 创建和编辑订阅的表单
│   │   └── subscription-pager.ts  # 订阅列表及操作菜单的分页交互
│   ├── utils/                     # 权限检查、消息构建、时间解析和日志
│   ├── locales/zh-cn.ts           # 筛选项、职业及招募标签的中文名称
│   ├── constants/dict-zh-cn.ts    # 自动生成的副本名称词典
│   └── types/                     # 命令及招募数据类型
├── scripts/build-dict.ts          # 从游戏数据生成词典
├── tests/                         # 自动化测试及辅助工具
├── ffxiv-data/                    # 游戏数据 Git 子模块
├── docs/preview.png               # 推送效果预览
├── package.json                   # 依赖、运行脚本及 Bun 版本要求
├── bun.lock                       # 依赖锁定文件
├── tsconfig.json                  # TypeScript 配置
├── eslint.config.js               # 代码检查配置
├── .prettierrc                    # 格式化配置
├── .husky/pre-commit              # 提交前检查
├── Dockerfile                     # Bun 运行镜像
├── docker-compose.yml             # 容器部署及 SQLite 数据卷
├── .dockerignore                  # Docker 构建排除规则
└── .env.example                   # 环境变量配置示例
```

监控流程为：**抓取列表 → 刷新期限 → 匹配订阅 → 发送或更新 → 清理结束招募**。监控、手动清理和定时清理共用串行队列；监控后的清理复用本轮抓取结果。每次清理完成后重新计时，1 小时后执行兜底清理。没有订阅、推送记录或过期标记时，监控跳过抓取。

SQLite 保存订阅、推送记录、订阅与消息的关联及过期标记，使用 WAL 和事务保护更新。发送或编辑成功后才保存消息 ID 和内容摘要；删除失败保留记录以供重试。期限独立刷新，不受内容是否变化、订阅是否取消或频道是否可访问影响。期限无法解析时保留原值，新推送按首次观察后 1 小时到期处理。

### 扩展与排查

- **新增命令**：在 `src/commands/` 新建 `.ts` 文件，导出 `data` 和 `execute`，入口会自动加载；契约见 `src/types/command.ts`。
- **修改筛选或展示**：筛选项和标签见 `src/locales/zh-cn.ts`，消息格式见 `src/utils/embed.ts`；保持表单校验、监控筛选及 Discord 消息长度限制一致。
- **适配网站变化**：修改 `fetcher.ts`，验证正常列表、空列表及异常页面。请求超时为 30 秒，解压后的 HTML 上限为 16 MiB；非 HTML、缺少列表容器或招募 ID 均视为失败。
- **查看日志**：格式为 `[UTC 时间] [级别] [模块] 消息`，附带频道、招募或消息 ID 等上下文，涵盖启动、订阅变更、抓取、投递和清理结果。
