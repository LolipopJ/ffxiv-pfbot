import type { Locale } from "../types/locale";
import dictionary from "./generated/ja";

export default {
  language: "JA",
  intlLocale: "ja-JP",
  dictionary,
  categories: {
    DutyRoulette: "コンテンツルーレット",
    Dungeons: "ダンジョン",
    Guildhests: "ギルドオーダー",
    Trials: "討伐・討滅戦",
    Raids: "レイド",
    HighEndDuty: "高難易度コンテンツ",
    Pvp: "PvP",
    GoldSaucer: "ゴールドソーサー",
    Fates: "F.A.T.E.",
    TreasureHunt: "トレジャーハント",
    TheHunt: "モブハント",
    GatheringForays: "採集活動",
    DeepDungeons: "ディープダンジョン",
    AdventuringForays: "特殊フィールド探索",
    None: "その他",
    "V&C Dungeon Finder": "特殊ダンジョン探索",
  },
  jobs: {
    PLD: "ナイト",
    GLA: "剣術士",
    WAR: "戦士",
    MRD: "斧術士",
    DRK: "暗黒騎士",
    GNB: "ガンブレイカー",
    WHM: "白魔道士",
    CNJ: "幻術士",
    SCH: "学者",
    AST: "占星術師",
    SGE: "賢者",
    MNK: "モンク",
    PGL: "格闘士",
    DRG: "竜騎士",
    LNC: "槍術士",
    NIN: "忍者",
    ROG: "双剣士",
    SAM: "侍",
    RPR: "リーパー",
    VPR: "ヴァイパー",
    BSM: "魔獣使い",
    BRD: "吟遊詩人",
    ARC: "弓術士",
    MCH: "機工士",
    DNC: "踊り子",
    BLM: "黒魔道士",
    THM: "呪術士",
    SMN: "召喚士",
    ACN: "巴術士",
    RDM: "赤魔道士",
    PCT: "ピクトマンサー",
    BLU: "青魔道士",
    ANY: "だれでも可",
  },
  tags: {
    None: "設定なし",
    "Duty Completion": "コンプリート目的",
    Practice: "練習",
    Loot: "周回",
    "Duty Complete": "コンプリート済み",
    "One Player per Job": "ジョブ重複なし",
  },
  messages: {
    logs: {
      modules: {
        language: "言語",
        startup: "起動",
        commands: "コマンド",
        connection: "接続",
        shutdown: "終了",
        database: "データベース",
        fetcher: "取得",
        monitor: "監視",
        cleanup: "削除処理",
        subscription: "購読",
        presence: "ステータス",
        listing: "募集",
      },
      events: {
        unsupportedLanguage: "未対応の LANGUAGE のため、EN を使用します。",
        languageConfigured: "ボットの言語を設定しました",
        missingToken:
          "DISCORD_BOT_TOKEN がありません。環境変数または .env ファイルを確認してください",
        commandLoaded: "コマンドを読み込みました",
        commandInvalid:
          "コマンドを読み込めません。data または execute プロパティがありません",
        commandLoadFailed: "コマンドの読み込みに失敗しました",
        commandNotFound: "要求されたコマンドが見つかりません",
        commandFailed: "コマンドの実行に失敗しました",
        commandErrorReplyFailed: "コマンドのエラー応答を送信できませんでした",
        commandsRegistered: "サーバーのコマンドを登録しました",
        commandsRegisterFailed: "サーバーのコマンド登録に失敗しました",
        guildJoined: "ボットがサーバーに参加しました",
        botReady: "ボットがオンラインになりました",
        initializationFailed:
          "データベースの初期化または監視の開始に失敗しました",
        clientError: "Discord クライアントでエラーが発生しました",
        clientWarning: "Discord クライアントから警告がありました",
        connecting: "Discord に接続しています",
        loginFailed: "Discord へのログインに失敗しました",
        shuttingDown:
          "ボットを終了しています。監視と削除処理の完了を待っています",
        shutdownComplete: "ボットを終了しました",
        databaseOpened: "購読データベースを開きました",
        databaseClosed: "購読データベースを閉じました",
        listingsFetched: "パーティ募集ページの取得と解析が完了しました",
        expiryUnknown:
          "募集期限を解析できません。記録済みの期限を維持し、新規配信は観測から 1 時間後に期限切れとします",
        monitorSkipped: "購読も配信記録もないため、今回の確認は不要です",
        monitorFetchFailed:
          "募集の取得に失敗しました。次回確認時に再試行し、今回は記録済みの期限のみで削除します",
        channelUnavailable:
          "アクセスできないかサーバーが一致しないチャンネルをスキップしました。再試行のため記録を保持します",
        channelCannotSend:
          "チャンネルにメッセージを送信できないため、今回の配信をスキップしました",
        invalidPatternSkipped: "正規表現が無効な購読をスキップしました",
        listingUpdated: "募集メッセージを更新しました",
        listingSent: "募集メッセージを送信しました",
        deliveryFailed: "募集の配信に失敗しました。次回確認時に再試行します",
        channelProcessingFailed:
          "チャンネルの処理に失敗しました。再試行のため購読と配信記録を保持します",
        monitorComplete: "今回の確認が完了しました",
        monitorFailed:
          "監視タスクでエラーが発生しました。次回確認時に再試行します",
        monitorCleanupFailed:
          "監視後の自動削除処理に失敗しました。次回の削除処理で再試行します",
        monitorStarted: "パーティ募集の監視を開始しました",
        monitorStopped: "パーティ募集の監視を停止しました",
        scheduledCleanupFailed: "定期削除処理に失敗しました。次回再試行します",
        deliveryDeleted: "メッセージと配信記録を削除しました",
        deleteFailed: "削除に失敗しました。再試行のため配信記録を保持します",
        channelCleanupFailed:
          "チャンネルの削除処理に失敗しました。再試行のため記録を保持します",
        cleanupFetchFailed:
          "取得に失敗しました。記録済みの期限のみで削除します",
        cleanupComplete: "削除処理が完了しました",
        cleanupStarted: "毎時の削除処理を開始しました",
        subscriptionCreated: "パーティ募集の購読を作成しました",
        subscriptionEdited: "パーティ募集の購読を変更しました",
        subscriptionCancelled: "パーティ募集の購読を解除しました",
        presenceFailed: "ボットのステータス更新に失敗しました",
      },
      errors: {
        scopeRequired: "サーバーとチャンネルの指定は空にできません",
        invalidPagination: "ページ指定のパラメータが無効です",
        channelUnavailable:
          "チャンネルにアクセスできないか、サーバーが一致しません",
        cleanupStopped: "削除サービスは停止しています",
        botShuttingDown: "ボットは終了処理中です",
        fetchNotHtml: "XIVPF から HTML ページが返されませんでした",
        fetchEmptyBody: "XIVPF のレスポンス本文が空です",
        fetchTooLarge: "XIVPF の HTML がレスポンス上限の 16 MiB を超えています",
        missingListingsContainer:
          "XIVPF の募集コンテナが存在しないか、複数存在します",
        missingListingId: "XIVPF の募集に ID がありません",
        fetchHttp: ({ status }) => `XIVPF HTTP エラー：${status}`,
      },
      invalidLanguage: ({ value, supported }) =>
        `LANGUAGE ${JSON.stringify(value)} は未対応のため、EN を使用します。対応言語：${supported.join(", ")}。`,
    },
    common: {
      unknown: "不明",
      unlimited: "指定なし",
      listSeparator: "、",
      now: "今",
    },
    embed: {
      description: "📃 コメント",
      category: "🎯 募集カテゴリ",
      server: "🌍 ワールド",
      creator: "👤 募集者",
      minIlvl: "⚔️ 最低平均アイテムレベル",
      expires: "⏳ 募集期限",
      party: ({ current, total }) => `👨‍👩‍👧‍👦 パーティ (${current}/${total})`,
    },
    commands: {
      subscribe: "このチャンネルにパーティ募集の通知設定を登録する",
      list: "このチャンネルのパーティ募集の通知設定を表示する",
      edit: "このチャンネルの通知設定を選択して編集する",
      unsubscribe: "このチャンネルの通知設定を選択して解除する",
      clear: "このチャンネルの終了した募集メッセージと配信記録を削除する",
      reset:
        "選択した通知設定またはすべての通知設定のメッセージと配信記録を強制削除する",
      page: "ページ番号（初期値は1）",
    },
    filters: ({ centres, categories }) =>
      `データセンター：${centres}\n募集カテゴリ：${categories}`,
    form: {
      createTitle: "パーティ募集の通知設定を作成",
      editTitle: "パーティ募集の通知設定を編集",
      pattern: "正規表現",
      patternDescription:
        "英語のコンテンツ名と募集コメントの原文を照合します。RE2構文、1～1000文字。",
      dataCentres: "データセンター",
      categories: "募集カテゴリ",
      multiSelect: "複数選択可。未選択なら指定なし",
      createTimeout: "ℹ️ 時間切れになりました。通知設定は作成されていません。",
      editTimeout: "ℹ️ 時間切れになりました。変更は保存されていません。",
      created: ({ pattern, filters, id }) =>
        `✅ このチャンネルに通知設定を作成しました。\n正規表現：${pattern}\n${filters}\nID：${id}`,
      edited: ({ pattern, filters, id }) =>
        `✅ このチャンネルの通知設定を更新しました。\n正規表現：${pattern}\n${filters}\nID：${id}`,
    },
    pager: {
      empty: "ℹ️ このチャンネルには通知設定がありません。",
      summary: ({ total, page, pageCount }) =>
        `📋 **このチャンネルの通知設定一覧**（${total}件）｜${page}/${pageCount}ページ`,
      item: ({ index, pattern, filters, id, userId }) =>
        `\n\n${index}. ${pattern}\n${filters}\nID：${id} ｜ 作成者：<@${userId}>`,
      selectEdit: "\n編集する通知設定を選択してください：",
      selectDelete: "\n解除する通知設定を選択してください：",
      selectReset:
        "\nメッセージと配信記録を強制削除する通知設定を選択してください。募集中のものも削除されます。通知設定は保持され、有効な募集は次回の確認で再送される場合があります。複数の通知設定が共有するメッセージも削除されます。",
      placeholder: "このページの通知設定を選択",
      emptyPattern: "（空の正規表現）",
      all: "すべての通知設定",
      allDescription:
        "解除済みの通知設定の記録を含め、すべての募集メッセージと配信記録を強制削除",
      previous: "前のページ",
      next: "次のページ",
      resetting: "⏳ 強制削除中…",
      editOpened:
        "ℹ️ フォームで正規表現、データセンター、募集カテゴリを編集して送信すると保存されます。",
      cancelled: "✅ 通知設定を解除しました。",
    },
    errors: {
      PATTERN_LENGTH: "正規表現は1～1000文字で入力してください",
      INVALID_PATTERN: "無効なRE2正規表現です",
      INVALID_DATA_CENTRE: "無効なデータセンターです",
      INVALID_CATEGORY: "無効な募集カテゴリです",
      DUPLICATE_SUBSCRIPTION:
        "このチャンネルには同じ正規表現と条件の通知設定が既にあります",
      SUBSCRIPTION_NOT_FOUND:
        "通知設定が見つからないか、操作する権限がありません。",
      guildOnly: "サーバー内のチャンネルで使用してください。",
      channelOnly:
        "テキストチャンネル、アナウンスチャンネル、スレッドに対応しています。",
      userPermissions:
        "このチャンネルの「チャンネルを見る」と「チャンネルの管理」権限が必要です。",
      threadClosed:
        "スレッドがアーカイブまたはロックされています。先に解除してください。",
      botPermissions:
        "ボットに「チャンネルを見る」「メッセージを送信」「埋め込みリンク」権限が必要です。",
      botTimedOut: "ボットがタイムアウト中です。先に解除してください。",
      privateThread:
        "ボットがこのプライベートスレッドにアクセスできません。追加して権限を確認してください。",
      commandFailed: "❌ コマンドの実行に失敗しました",
    },
    cleanup: {
      result: ({ removed, failed }) =>
        `${removed}件のメッセージと配信記録を削除しました。失敗は${failed}件（再試行のため記録を保持）。通知設定は保持されています。`,
      fetchFailed:
        "\n取得に失敗したため、保存済みの期限のみで削除を判定しました。",
      unlinked: ({ count }) =>
        `\n通知設定との関連がない古い記録が${count}件あります。「すべての通知設定」で削除できます。`,
    },
    presence: {
      fetching: "パーティ募集の情報を取得・処理中…",
      clearing: "終了したパーティ募集を削除中…",
      noNextTime: "実行予定なし",
      next: ({ time }) => `次回実行：${time}`,
    },
  },
} satisfies Locale;
