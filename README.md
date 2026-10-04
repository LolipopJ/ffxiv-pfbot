# ffxiv-pfbot

English | [简体中文](./docs/README-chs.md)

<div align="center">
  <img src="./docs/preview.png" alt="Discord Party Finder notification preview" height="320" />
</div>

A Discord bot for subscribing to Party Finder listings on the international servers of **FINAL FANTASY XIV** (FFXIV). It periodically reads listings from [xivpf.com](https://xivpf.com/listings), filters them by keywords, data center, and recruitment category, and sends them to the specified channels.

- **Channel subscriptions**: Manage subscriptions through slash commands and forms, with regular expressions and multiple filter selections.
- **Multilingual output and logs**: Support English, Simplified Chinese, German, French, Japanese, or Korean for listing cards, commands, forms, replies, status, and internal log messages.
- **Automatic message maintenance**: Deduplicate listings within each channel, update existing messages when content changes, and remove messages when recruitment ends.
- **Local persistence**: Bun's built-in SQLite stores subscriptions and delivery records across restarts, with no separate database service required.

## Deployment

The runtime must be able to access Discord and xivpf.com. Running directly requires **Bun 1.4.2 or later**. Docker Compose deployment is also supported.

### Create the bot and configure permissions

Create an application and a bot in the Discord Developer Portal, then obtain its Bot Token. When inviting the bot to your server, select the `bot` and `applications.commands` scopes. Grant the following permissions in channels that will receive notifications:

| Channel type                 | Required bot permissions                            |
| ---------------------------- | --------------------------------------------------- |
| Text or announcement channel | View Channel, Send Messages, Embed Links            |
| Thread                       | View Channel, Send Messages in Threads, Embed Links |

For private threads, also add the bot to the thread or grant Manage Threads. Threads must be neither archived nor locked. Messages sent to an announcement channel are not automatically published to follower channels.

The bot does not need Administrator, Manage Channels, or Manage Messages. It uses only the `Guilds` intent; the privileged Message Content and Guild Members intents are not required.

### Configure the project

```bash
git clone https://github.com/LolipopJ/ffxiv-pfbot.git
cd ffxiv-pfbot
cp .env.example .env
```

Edit `.env` and replace `DISCORD_BOT_TOKEN` with your actual token. Adjust the other settings as needed:

| Environment variable | Default                      | Description                                                                                                                                                                    |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DISCORD_BOT_TOKEN`  | None; required               | Discord Bot Token.                                                                                                                                                             |
| `FETCH_CRON`         | `*/5 * * * *`                | Check schedule; every 5 minutes by default, in the runtime time zone.                                                                                                          |
| `DATABASE_PATH`      | `data/pfbot.sqlite`          | SQLite path. The parent directory is created automatically; Compose fixes this to `/app/data/pfbot.sqlite`.                                                                    |
| `XIVPF_URL`          | `https://xivpf.com/listings` | Listings page URL. Any page used for debugging must have the same HTML structure.                                                                                              |
| `TZ`                 | None                         | Time zone for cron and bot status, such as `Asia/Shanghai`. The example configuration and Compose use `UTC`; direct execution uses the runtime's time zone when this is unset. |
| `LANGUAGE`           | `EN`                         | Language for Discord output and internal logs: `EN`, `CHS`, `DE`, `FR`, `JA`, or `KO`. Restart after changing it.                                                              |

The website is always fetched in English. `EN` keeps the original duty names and system tags; other languages translate game names, jobs, categories, and known system tags at the start of recruitment comments. Unknown names or missing translations remain in English. Player-written comments, character names, world names, and regular expressions retain their original values.

### Start the bot

Choose either method below. Once online, the bot automatically registers slash commands in servers it has joined, and also registers them when joining a new server. The first check runs approximately 5 seconds after monitoring starts; subsequent checks follow the configured schedule.

**Run directly with Bun:**

```bash
bun install
bun run start
```

**Run with Docker Compose:**

```bash
# Validate configuration, build, and start in the background
docker compose config --quiet
docker compose up -d --build

# View status and logs
docker compose ps
docker compose logs -f --tail=100 pfbot
```

After startup, follow [Usage](#usage) to create subscriptions.

### Updates and maintenance

The following commands apply to Docker Compose:

```bash
# Update the code and rebuild
git pull --ff-only
docker compose up -d --build

# Recreate the container after changing .env
docker compose up -d --force-recreate

# Restart
docker compose restart pfbot

# Stop and remove containers while keeping the data volume
docker compose down
```

The container allows 1 minute for running tasks to finish before shutdown. For larger numbers of subscriptions, increase `stop_grace_period` in `docker-compose.yml`. Logs rotate at 10 MiB per file, keeping up to 3 files.

<details>
<summary>Database backup, restoration, and migration</summary>

Subscriptions and delivery state are stored in the named volume `pfbot-data`, at `/app/data/pfbot.sqlite` inside the container. Compose overrides `DATABASE_PATH` from `.env`. To change this location, adjust both the environment variable and the volume mount, ensuring that the database and WAL files remain in a persistent directory.

Stop the bot before backing up and copy the entire data directory. Use a new destination directory for each backup, and complete the backup before removing the container with `docker compose down`:

```bash
docker compose stop pfbot
mkdir -p backups
docker compose cp pfbot:/app/data ./backups/pfbot-data
docker compose start pfbot
```

Restoration replaces the existing database. Back up the current data and stop the original instance first. A backup should contain `pfbot.sqlite` and any `pfbot.sqlite-wal` and `pfbot.sqlite-shm` files present at backup time.

```bash
# Create the container and data volume, keeping the bot stopped
docker compose build
docker compose create pfbot
docker compose stop pfbot

# Replace the database and fix permissions
docker compose run --rm --no-deps --user root pfbot rm -f /app/data/pfbot.sqlite /app/data/pfbot.sqlite-wal /app/data/pfbot.sqlite-shm
docker compose cp ./backups/pfbot-data/. pfbot:/app/data
docker compose run --rm --no-deps --user root pfbot chown -R bun:bun /app/data
docker compose up -d
```

To migrate from direct execution to Compose, stop the original process, then replace `./backups/pfbot-data/.` in the restoration commands with the original database directory (by default, `./data/.`).

</details>

## Usage

You need **View Channel** and **Manage Channels** permissions in the current channel. Run commands in the text channel, announcement channel, or thread where you want notifications. For forum posts, open the post and run commands inside it. Direct messages are not supported.

The following example uses the `LANGUAGE=CHS` interface to subscribe to Ultimate or Savage listings on the Mana data center:

1. Run `/subscribe` to open the subscription form.
2. Enter `(?i)(Ultimate|Savage)` in “Regular expression” (「正则表达式」).
3. Select `Mana (JP)` under “Data centers” (「数据中心」).
4. Select “High-end Duty” (「高难度任务」) under “Categories” (「招募类别」).
5. Submit the form, confirm the success reply, and wait for the next check. Checks run every 5 minutes by default and also match active listings already on the website.

Data centers and categories both support multiple selections. Leaving either filter empty means any value is allowed. **A listing may match any selected value within a filter, but must satisfy all different filters**. The example above requires a listing on Mana, in the High-end Duty category, with `Ultimate` or `Savage` in its English duty name or original recruitment comment.

### Define matching criteria

The “Regular expression” field defines the keyword matching rule. It is required, accepts **1–1000 characters**, and uses RE2 syntax. Matching uses **the English duty name on the website and the original recruitment comment**. Translated names on cards are never used for matching.

The bot joins the English duty name and recruitment comment with a space, then searches the combined text. **Matching either part is sufficient**, so you usually do not need `.*` around a keyword. Copy the code below directly into the form, without backticks or `/…/i`. To ignore case, put the flag at the start of the expression, as in `(?i)Savage`.

#### Filter by duty

These examples filter for specific duty names:

| Use case                | Regular expression           | Example matches                                                                                                                 |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| No text restriction     | `[\s\S]*`                    | Any text; filter only by data center and category.                                                                              |
| Savage or Ultimate      | `(?i)\b(Savage\|Ultimate)\b` | `(Savage)` or `(Ultimate)` in the English duty name.                                                                            |
| Extreme trials          | `(?i)\bExtreme\b`            | `(Extreme)` in the English duty name. Some Extreme trials use `The Minstrel's Ballad`; add their English duty names separately. |
| Futures Rewritten (FRU) | `(?i)(Futures Rewritten)`    | `Futures Rewritten (Ultimate)`.                                                                                                 |

#### Filter by recruitment purpose or comment

These examples cover English terms used on EU/NA servers and Japanese terms used on JP servers:

| Use case                                | Regular expression                                         | Example matches                                                                           |
| --------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Practice or progression                 | `(?i)(\b(practice\|prog(ression)?\|learning)\b\|練習)`     | `practice`, `P2 prog`, `progression`, `learning`, `後半練習`.                             |
| First-time or fresh progression         | `(?i)(\b(fresh\|blind)\b\|初見\|最初から)`                 | `fresh prog`, `blind run`, `初見歓迎`, `最初から練習`.                                    |
| Clear attempts or helping someone clear | `(?i)(\b(a2c\|c41\|clears?)\b\|クリア目的\|未クリア)`      | `A2C` (aim to clear), `C41` (clear for one), `clear party`, `クリア目的`, `未クリア歓迎`. |
| Weekly clears or reclears               | `(?i)(\b(reclears?\|weekly)\b\|消化)`                      | `weekly reclears`, `reclear party`, `今週分消化`.                                         |
| Farming                                 | `(?i)(\bfarm(ing)?\b\|周回)`                               | `farm party`, `farming`, `周回PT`.                                                        |
| Mount or totem keywords                 | `(?i)(\b(mounts?\|totems?\|wings?)\b\|マウント\|トーテム)` | `mount farm`, `totems`, `wing farm`, `マウント周回`, `トーテム集め`.                      |
| Mercenary or payment keywords           | `(?i)(\bmerc(enary\|enaries)?\b\|バイト\|報酬\|傭兵)`      | `merc`, `mercenary`, `mercenaries`, `バイト募集`, `報酬あり`.                             |
| Treasure maps                           | `(?i)(\b(maps?\|treasure)\b\|地図)`                        | `maps`, `treasure maps`, `地図PT`.                                                        |
| Blue Mage                               | `(?i)(\b(BLU\|Blue Mage)\b\|青魔)`                         | `BLU spell learning`, `Blue Mage`, `青魔法ラーニング`.                                    |
| Minimum item level challenges           | `(?i)(\bMINE\b\|minimum\s+item\s+level\|下限)`             | `MINE` (minimum item level, no echo), `minimum item level`, `下限`.                       |
| Specific guides or strategies           | `(?i)(\bHector\b\|ぬけまる\|ハムカツ)`                     | `Hector strat`, `ぬけまる式`, `ハムカツ式`.                                               |

#### RE2 syntax tips

- `(?i)`: Ignore case for English letters; for example, `prog` also matches `PROG`.
- `\b`: An ASCII word boundary, useful for English abbreviations. For example, `\bTEA\b` does not match `team`. Do not put it directly around Japanese or Chinese keywords.
- `\s*` / `\s+`: Zero or more / one or more whitespace characters. Escape special characters such as parentheses when matching them literally; for example, `\(Savage\)`.
- RE2 **does not support lookahead, lookbehind, or backreferences**, including `(?=...)`, `(?!...)`, `(?<=...)`, `(?<!...)`, and `\1`. Do not use `(?=.*Savage)(?=.*prog)` to require both keywords; instead, combine the keywords in sequence.

See the [official RE2 syntax reference](https://github.com/google/re2/wiki/Syntax) for more details.

### Manage subscriptions and messages

All commands apply only to **the current channel or thread in the current server**. Subscriptions are shared by the channel, and anyone with the required permissions can manage them.

| Command        | Purpose                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/subscribe`   | Create a Party Finder subscription.                                                                                                                |
| `/list`        | View existing subscriptions in the current channel.                                                                                                |
| `/edit`        | Select a subscription, edit its form, and submit. New criteria take effect on the next check.                                                      |
| `/unsubscribe` | Select and cancel a subscription, stopping notifications for those criteria.                                                                       |
| `/clear`       | Remove messages and delivery records for ended listings in the current channel.                                                                    |
| `/reset`       | Select one subscription or “All subscriptions” to immediately force-clear its associated messages and delivery records, including active listings. |

`/list`, `/edit`, `/unsubscribe`, and `/reset` support pagination. You can also specify a page with `page`, as in `/list page:2`; the default is page 1.

Command replies are visible only to you, while recruitment notifications are visible to channel members. Menus and forms expire after **2 minutes**; rerun the command if it times out. Creation and editing are saved only after a successful submission. Closing the form, timing out, entering an invalid regular expression, or duplicating another subscription's exact criteria in the channel does not save changes.

Keep the following in mind when clearing messages:

- **Canceling or editing a subscription does not immediately delete existing messages**. Those messages are still removed automatically when recruitment ends. Listings that match other subscriptions can continue to be sent or updated.
- **`/clear` and `/reset` both keep subscription settings**. They affect only recruitment messages recorded by the bot and do not clear other messages in the channel.
- **`/reset` runs immediately after selection**. If multiple subscriptions match a message, selecting any one of them also deletes that shared message. Active listings that still match a subscription can be sent again on the next check.
- “All subscriptions” covers all delivery records in the current channel, including records left by canceled subscriptions. It is available even if the channel has no subscriptions. Use it if a reply says older records cannot be assigned to an individual subscription.
- Records that fail to clear are kept, and the reply shows the failure count. Fix permission or network issues, then run the command again.

### Delivery and automatic cleanup

Each channel keeps only one message per listing ID. When multiple subscriptions match, the message combines their matching criteria. If a matching listing's content changes, the bot updates the existing message; unchanged content is skipped.

After each check, the bot removes messages that satisfy any of these conditions:

- The listing has disappeared from a successfully fetched website list.
- The listing has expired. Its expiry is refreshed using the remaining time reported by the website.
- The website says the listing was last retrieved at least 10 minutes ago. The bot treats it as ended. This refers to the listing's update time on the website, not how long the bot has been running.

Existing messages continue to be cleaned up after all subscriptions are canceled. If fetching fails, cleanup uses only previously recorded expiry times. If a channel is temporarily inaccessible or sending fails, subscriptions are kept, and matching listings are processed again when access recovers.

Manually deleting a notification does not guarantee that it will be sent again on the next check. The bot attempts to update and resend it only when the listing still matches and the outgoing content has changed. To resend a listing, use `/reset` to remove its delivery record.

## Development

After installing dependencies and configuring `.env`, use these commands:

```bash
bun run start       # Start the bot
bun run lint        # Check code style
bun run lint:fix    # Automatically fix formatting and style issues
bun run typecheck   # Check TypeScript types
bun run test        # Run automated tests
```

Translation dictionaries come from the `ffxiv-data` Git submodule. The runtime uses the prebuilt dictionaries committed to the repository, so Docker does not need game data or build tools at runtime. Update the game data and generate dictionaries for all five target languages with:

```bash
bun run build:dict
```

To rebuild using only the game data already available locally, run `bun run scripts/build-dict.ts`. Building is independent of `LANGUAGE`. Output goes to `src/locales/generated/`, aligning English and target-language text by game data row ID. The build reports missing translations, conflicts, and control-code handling statistics. Later sources override earlier nonempty translations. Korean data may be older; entries without translations stay in English at runtime. Soft hyphens and italic control codes are removed, and nonbreaking spaces become ordinary spaces. Unknown control codes cause the translation entry to be skipped and counted in the statistics.

Manually maintained interface text and log messages are stored in `src/locales/{en,chs,de,fr,ja,ko}.ts`. Do not edit generated dictionaries by hand. All six locale packs follow the same TypeScript interface; update every language when adding or changing text.

### Implementation structure

The project uses discord.js for commands and messages, Cheerio to parse pages, RE2JS to validate and execute regular expressions, and `bun:sqlite` to persist state. The file layout is:

```text
ffxiv-pfbot/
├── src/
│   ├── index.ts                   # Startup, command registration, and shutdown
│   ├── commands/                  # Subscription management and cleanup commands
│   ├── services/
│   │   ├── fetcher.ts             # Fetch and parse the listings page
│   │   ├── monitor.ts             # Scheduled checks, matching, and message updates
│   │   ├── listing-state.ts       # Refresh expiry times and expired-listing markers
│   │   ├── cleanup.ts             # Automatic, manual, and forced cleanup
│   │   ├── tasks.ts               # Serial task queue and bot status
│   │   ├── store.ts               # SQLite storage and subscription validation
│   │   ├── subscription-form.ts   # Forms for creating and editing subscriptions
│   │   └── subscription-pager.ts  # Paginated subscription lists and action menus
│   ├── utils/                     # Permissions, messages, time parsing, and logging
│   ├── locales/                   # Six-language text, configuration, and formatting
│   │   ├── generated/             # Generated game-name dictionaries for five languages
│   │   └── utils/                 # Localization utilities
│   ├── constants/recruitment.ts   # Language-independent filters and identifiers
│   └── types/                     # Command and recruitment data types
├── scripts/build-dict.ts          # Generate five-language dictionaries from game data
├── tests/                         # Automated tests and helpers
├── ffxiv-data/                    # Game data Git submodule
├── docs/preview.png               # Notification preview
├── docs/README-chs.md             # Simplified Chinese README
├── package.json                   # Dependencies, scripts, and Bun version requirement
├── bun.lock                       # Dependency lockfile
├── tsconfig.json                  # TypeScript configuration
├── eslint.config.js               # Lint configuration
├── .prettierrc                    # Formatter configuration
├── .husky/pre-commit              # Pre-commit checks
├── Dockerfile                     # Bun runtime image
├── docker-compose.yml             # Container deployment and SQLite data volume
├── .dockerignore                  # Docker build exclusions
└── .env.example                   # Example environment configuration
```

The monitoring flow is **fetch listings → refresh expiry times → match subscriptions → send or update → clean up ended listings**. Monitoring, manual cleanup, and scheduled cleanup share a serial queue. Cleanup after monitoring reuses the current fetch results. Each completed cleanup resets a timer for a fallback cleanup 1 hour later. Monitoring skips fetching when there are no subscriptions, delivery records, or expired-listing markers.

SQLite stores subscriptions, delivery records, subscription-message associations, and expired-listing markers, using WAL and transactions to protect updates. Message IDs and content hashes are saved only after sending or editing succeeds. Failed deletions keep their records for retries. Expiry times are refreshed independently of content changes, subscription cancellation, or channel accessibility. If an expiry cannot be parsed, its previous value is kept; new notifications expire 1 hour after the listing is first observed.

### Extending and troubleshooting

- **Add a command**: Create a `.ts` file in `src/commands/` and export `data` and `execute`; the entry point loads it automatically. See `src/types/command.ts` for the contract.
- **Change filters or presentation**: Valid filter values are in `src/constants/recruitment.ts`, translations and labels in `src/locales/`, and message formatting in `src/utils/embed.ts`. Display labels can be translated, while filter values and database identifiers must remain stable. Check Discord's length limits after localization.
- **Adapt to website changes**: Update `fetcher.ts` and verify normal listings, empty listings, and invalid pages. Requests time out after 30 seconds, and decompressed HTML is limited to 16 MiB. Non-HTML responses, a missing listings container, or missing listing IDs are treated as failures.
- **Inspect logs**: Entries use `[UTC timestamp] [level] [module] message` and include context such as channel, listing, or message IDs. They cover startup, subscription changes, fetching, delivery, and cleanup. Messages and module labels follow `LANGUAGE`; timestamps remain in UTC, and structured context keys and external error details keep their original values.
