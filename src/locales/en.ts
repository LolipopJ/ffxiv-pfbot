import type { Locale } from "../types/locale";

export default {
  language: "EN",
  intlLocale: "en-US",
  dictionary: {},
  categories: {
    DutyRoulette: "Duty Roulette",
    Dungeons: "Dungeons",
    Guildhests: "Guildhests",
    Trials: "Trials",
    Raids: "Raids",
    HighEndDuty: "High-end Duty",
    Pvp: "PvP",
    GoldSaucer: "Gold Saucer",
    Fates: "FATEs",
    TreasureHunt: "Treasure Hunt",
    TheHunt: "The Hunt",
    GatheringForays: "Gathering Forays",
    DeepDungeons: "Deep Dungeons",
    AdventuringForays: "Field Operations",
    None: "Other",
    "V&C Dungeon Finder": "V&C Dungeon Finder",
  },
  jobs: {
    PLD: "Paladin",
    GLA: "Gladiator",
    WAR: "Warrior",
    MRD: "Marauder",
    DRK: "Dark Knight",
    GNB: "Gunbreaker",
    WHM: "White Mage",
    CNJ: "Conjurer",
    SCH: "Scholar",
    AST: "Astrologian",
    SGE: "Sage",
    MNK: "Monk",
    PGL: "Pugilist",
    DRG: "Dragoon",
    LNC: "Lancer",
    NIN: "Ninja",
    ROG: "Rogue",
    SAM: "Samurai",
    RPR: "Reaper",
    VPR: "Viper",
    BSM: "Beastmaster",
    BRD: "Bard",
    ARC: "Archer",
    MCH: "Machinist",
    DNC: "Dancer",
    BLM: "Black Mage",
    THM: "Thaumaturge",
    SMN: "Summoner",
    ACN: "Arcanist",
    RDM: "Red Mage",
    PCT: "Pictomancer",
    BLU: "Blue Mage",
    ANY: "Any",
  },
  tags: {
    None: "None",
    "Duty Completion": "Duty Completion",
    Practice: "Practice",
    Loot: "Loot",
    "Duty Complete": "Duty Complete",
    "One Player per Job": "One Player per Job",
  },
  messages: {
    logs: {
      modules: {
        language: "Language",
        startup: "Startup",
        commands: "Commands",
        connection: "Connection",
        shutdown: "Shutdown",
        database: "Database",
        fetcher: "Fetch",
        monitor: "Monitor",
        cleanup: "Cleanup",
        subscription: "Subscription",
        presence: "Presence",
        listing: "Listing",
      },
      events: {
        unsupportedLanguage: "Unsupported LANGUAGE; using EN.",
        languageConfigured: "Bot language configured",
        missingToken:
          "DISCORD_BOT_TOKEN is missing; check the environment variables or .env file",
        commandLoaded: "Command loaded",
        commandInvalid:
          "Command could not be loaded: missing data or execute property",
        commandLoadFailed: "Command loading failed",
        commandNotFound: "Requested command not found",
        commandFailed: "Command execution failed",
        commandErrorReplyFailed: "Failed to send the command error response",
        commandsRegistered: "Guild commands registered",
        commandsRegisterFailed: "Guild command registration failed",
        guildJoined: "Bot joined a guild",
        botReady: "Bot is online",
        initializationFailed:
          "Database initialization or monitor startup failed",
        clientError: "Discord client error",
        clientWarning: "Discord client warning",
        connecting: "Connecting to Discord",
        loginFailed: "Discord login failed",
        shuttingDown:
          "Shutting down the bot; waiting for monitoring and cleanup tasks",
        shutdownComplete: "Bot shut down",
        databaseOpened: "Subscription database opened",
        databaseClosed: "Subscription database closed",
        listingsFetched: "Party Finder page fetched and parsed",
        expiryUnknown:
          "Could not parse the listing expiry; keeping recorded deadlines and expiring new deliveries one hour after observation",
        monitorSkipped: "No check needed: no subscriptions or delivery records",
        monitorFetchFailed:
          "Failed to fetch listings; retrying on the next check and cleaning only by recorded deadlines this round",
        channelUnavailable:
          "Skipping an inaccessible channel or one that does not match its guild; keeping records for retry",
        channelCannotSend:
          "Channel cannot send messages; skipping delivery this round",
        invalidPatternSkipped:
          "Skipping a subscription with an invalid regular expression",
        listingUpdated: "Listing message updated",
        listingSent: "Listing message sent",
        deliveryFailed: "Listing delivery failed; retrying on the next check",
        channelProcessingFailed:
          "Channel processing failed; keeping subscriptions and delivery records for retry",
        monitorComplete: "Check complete",
        monitorFailed: "Monitoring task failed; retrying on the next check",
        monitorCleanupFailed:
          "Automatic cleanup after monitoring failed; retrying on the next cleanup",
        monitorStarted: "Party Finder monitor started",
        monitorStopped: "Party Finder monitor stopped",
        scheduledCleanupFailed: "Scheduled cleanup failed; retrying next time",
        deliveryDeleted: "Message and delivery record deleted",
        deleteFailed: "Deletion failed; keeping the delivery record for retry",
        channelCleanupFailed:
          "Channel cleanup failed; keeping records for retry",
        cleanupFetchFailed:
          "Fetching failed; cleaning only by recorded deadlines",
        cleanupComplete: "Cleanup complete",
        cleanupStarted: "Hourly cleanup started",
        subscriptionCreated: "Party Finder subscription created",
        subscriptionEdited: "Party Finder subscription updated",
        subscriptionCancelled: "Party Finder subscription canceled",
        presenceFailed: "Failed to update the bot presence",
      },
      errors: {
        scopeRequired: "Guild and channel scopes must not be empty",
        invalidPagination: "Invalid pagination parameters",
        channelUnavailable:
          "Channel is inaccessible or does not match its guild",
        cleanupStopped: "Cleanup service has stopped",
        botShuttingDown: "The bot is shutting down",
        fetchNotHtml: "XIVPF did not return an HTML page",
        fetchEmptyBody: "XIVPF returned an empty response body",
        fetchTooLarge: "XIVPF HTML exceeds the 16 MiB response limit",
        missingListingsContainer:
          "XIVPF listings container is missing or ambiguous",
        missingListingId: "XIVPF listing is missing its ID",
        fetchHttp: ({ status }) => `XIVPF HTTP error: ${status}`,
      },
      invalidLanguage: ({ value, supported }) =>
        `Unsupported LANGUAGE ${JSON.stringify(value)}; using EN. Supported: ${supported.join(", ")}.`,
    },
    common: {
      unknown: "Unknown",
      unlimited: "Any",
      listSeparator: ", ",
      now: "Now",
    },
    embed: {
      description: "📃 Comment",
      category: "🎯 Category",
      server: "🌍 World",
      creator: "👤 Recruiter",
      minIlvl: "⚔️ Minimum Item Level",
      expires: "⏳ Time Limit",
      party: ({ current, total }) => `👨‍👩‍👧‍👦 Party (${current}/${total})`,
    },
    commands: {
      subscribe: "Subscribe to Party Finder listings in this channel",
      list: "Browse this channel's Party Finder subscriptions",
      edit: "Select and edit a Party Finder subscription in this channel",
      unsubscribe:
        "Select and cancel a Party Finder subscription in this channel",
      clear:
        "Remove messages and delivery records for ended Party Finder listings in this channel",
      reset:
        "Force-clear messages and delivery records for selected or all subscriptions",
      page: "Page number, starting at 1",
    },
    filters: ({ centres, categories }) =>
      `Data centers: ${centres}\nCategories: ${categories}`,
    form: {
      createTitle: "Create Party Finder subscription",
      editTitle: "Edit Party Finder subscription",
      pattern: "Regular expression",
      patternDescription:
        "Match the English duty name and original recruitment comment. RE2 syntax, 1–1000 characters.",
      dataCentres: "Data centers",
      categories: "Categories",
      multiSelect: "Select multiple; leave empty for any",
      createTimeout:
        "ℹ️ Subscription setup timed out. No subscription was created.",
      editTimeout: "ℹ️ Subscription editing timed out. No changes were saved.",
      created: ({ pattern, filters, id }) =>
        `✅ Party Finder subscription created in this channel.\nPattern: ${pattern}\n${filters}\nID: ${id}`,
      edited: ({ pattern, filters, id }) =>
        `✅ Party Finder subscription updated in this channel.\nPattern: ${pattern}\n${filters}\nID: ${id}`,
    },
    pager: {
      empty: "ℹ️ This channel has no Party Finder subscriptions.",
      summary: ({ total, page, pageCount }) =>
        `📋 **Channel Party Finder subscriptions** (${total}) | Page ${page}/${pageCount}`,
      item: ({ index, pattern, filters, id, userId }) =>
        `\n\n${index}. ${pattern}\n${filters}\nID: ${id} | Created by: <@${userId}>`,
      selectEdit: "\nSelect a Party Finder subscription to edit:",
      selectDelete: "\nSelect a Party Finder subscription to cancel:",
      selectReset:
        "\nSelect a subscription to force-clear its messages and delivery records, including active listings. Settings are kept; active listings may be sent again on the next check. Shared messages are also deleted.",
      placeholder: "Select a subscription on this page",
      emptyPattern: "(Empty pattern)",
      all: "All subscriptions",
      allDescription:
        "Force-clear all recruitment messages and delivery records, including canceled subscriptions",
      previous: "Previous",
      next: "Next",
      resetting: "⏳ Force-clearing…",
      editOpened:
        "ℹ️ Edit the pattern, data centers and categories in the form, then submit to save.",
      cancelled: "✅ Party Finder subscription canceled.",
    },
    errors: {
      PATTERN_LENGTH: "The regular expression must contain 1–1000 characters",
      INVALID_PATTERN: "Invalid RE2 regular expression",
      INVALID_DATA_CENTRE: "Invalid data center",
      INVALID_CATEGORY: "Invalid recruitment category",
      DUPLICATE_SUBSCRIPTION:
        "This channel already has a subscription with the same pattern and filters",
      SUBSCRIPTION_NOT_FOUND:
        "Subscription not found or you do not have access.",
      guildOnly: "Use this command in a server channel.",
      channelOnly:
        "Only text channels, announcement channels and threads are supported.",
      userPermissions:
        "You need View Channel and Manage Channels permissions in this channel.",
      threadClosed: "The thread is archived or locked. Restore it first.",
      botPermissions:
        "The bot needs View Channel, Send Messages and Embed Links permissions here.",
      botTimedOut: "The bot is timed out. Remove the timeout first.",
      privateThread:
        "The bot cannot access this private thread. Add it to the thread and check permissions.",
      commandFailed: "❌ Command failed",
    },
    cleanup: {
      result: ({ removed, failed }) =>
        `Removed ${removed} messages and delivery records; ${failed} failed (records kept for retry). Subscription settings were kept.`,
      fetchFailed:
        "\nFetching failed; only previously recorded expiry times were used for cleanup.",
      unlinked: ({ count }) =>
        `\n${count} older records have no subscription link. Select “All subscriptions” to clear them.`,
    },
    presence: {
      fetching: "Fetching and processing Party Finder listings…",
      clearing: "Clearing ended Party Finder listings…",
      noNextTime: "No scheduled time",
      next: ({ time }) => `Next run: ${time}`,
    },
  },
} satisfies Locale;
